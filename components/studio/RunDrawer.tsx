'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PromptVariable } from '@/lib/engine/schema'
import { cn } from '@/lib/utils'
import { RunForm } from './RunForm'
import { formatUsageCost } from './types'
import type { GenerationPhase, TrialRunPhase } from './types'
import {
  planAutoTrialRun,
  useTrialRun,
  type AutoTrialRunOutcome,
} from './useTrialRun'

interface AutoNotice {
  outcome: AutoTrialRunOutcome
  message: string
}

export interface RunDrawerProps {
  prompt: string
  variables: readonly PromptVariable[]
  sessionKey: string
  /** 生成或字段重算进行中时禁用运行，避免跑到一半的提示词。 */
  disabled?: boolean
  /** 生成阶段。done 时才允许触发自动试运行。 */
  generationPhase: GenerationPhase
  /** 每次完整生成或重新开始换一个轮次号，自动试运行按它去重。 */
  generationRound: number
  /** 本轮用户点过「停止生成」后，不再自动触发。 */
  autoRunStopped?: boolean
}

const RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  succeeded: '成功',
  failed: '失败',
  canceled: '已取消',
  interrupted: '中断',
  running: '运行中',
  queued: '排队中',
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) {
    return '未知'
  }
  if (ms < 1000) {
    return `${Math.round(ms)} 毫秒`
  }
  return `${(ms / 1000).toFixed(1)} 秒`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function phaseLabel(phase: TrialRunPhase): string {
  switch (phase) {
    case 'running':
      return '运行中'
    case 'done':
      return '已完成'
    case 'canceled':
      return '已取消'
    case 'failed':
      return '失败'
    default:
      return '未运行'
  }
}

function phaseClass(phase: TrialRunPhase): string {
  switch (phase) {
    case 'running':
      return 'text-accent'
    case 'done':
      return 'text-success'
    case 'canceled':
      return 'text-warning'
    case 'failed':
      return 'text-danger'
    default:
      return 'text-ink-faint'
  }
}

function tokenText(
  tokensIn: number,
  tokensOut: number,
  approximate: boolean,
): string {
  const prefix = approximate ? '约 ' : ''
  return `输入 ${prefix}${tokensIn.toLocaleString('zh-CN')} · 输出 ${prefix}${tokensOut.toLocaleString('zh-CN')} token`
}

/** 中栏上方的试运行区：变量表单在左，真实流式输出在右。 */
export function RunDrawer({
  prompt,
  variables,
  sessionKey,
  disabled = false,
  generationPhase,
  generationRound,
  autoRunStopped = false,
}: RunDrawerProps) {
  const trial = useTrialRun({ prompt, variables, sessionKey, disabled })
  const [expanded, setExpanded] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [autoNotice, setAutoNotice] = useState<AutoNotice | null>(null)
  const outputRef = useRef<HTMLPreElement | null>(null)
  // 记录已经自动处理过的轮次。用 ref 而不是 state，避免重渲染与闭包把
  // 「已经跑过」读成「还没跑」，从而重复发起试运行。
  const consumedRoundRef = useRef<number | null>(null)

  // 重新开始或进入新一轮时清空自动触发标记，保证新轮次仍然可以自动跑一次。
  useEffect(() => {
    consumedRoundRef.current = null
    setAutoNotice(null)
  }, [sessionKey, generationRound])

  // 自动试运行：与手动按钮走同一个 trial.run()，条件判定全部在纯函数里。
  useEffect(() => {
    const plan = planAutoTrialRun({
      phase: generationPhase,
      prompt,
      roundId: generationRound,
      consumedRoundId: consumedRoundRef.current,
      stopped: autoRunStopped,
      disabled,
      variables,
      availability: trial.availability,
    })
    if (plan.consume) {
      consumedRoundRef.current = generationRound
    }
    if (plan.notice !== null) {
      setAutoNotice({ outcome: plan.outcome, message: plan.notice })
    }
    if (plan.outcome === 'run') {
      void trial.run()
    }
  }, [
    autoRunStopped,
    disabled,
    generationPhase,
    generationRound,
    prompt,
    trial.availability,
    trial.run,
    variables,
  ])

  const selectedRun =
    trial.history.find((item) => item.id === selectedRunId) ?? null

  useEffect(() => {
    if (trial.state.phase === 'running') {
      setSelectedRunId(null)
    }
  }, [trial.state.phase])

  // 流式输出时把滚动条跟到末尾；回看历史时不打断用户自己的滚动位置。
  useEffect(() => {
    if (selectedRunId !== null || !trial.isRunning) {
      return
    }
    const node = outputRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [selectedRunId, trial.isRunning, trial.state.output])

  const displayOutput = selectedRun ? selectedRun.output : trial.state.output
  const displayReasoning = selectedRun
    ? (selectedRun.reasoning ?? '')
    : trial.state.reasoning

  const durationMs = selectedRun
    ? selectedRun.latencyMs
    : trial.state.phase === 'running'
      ? trial.elapsedMs
      : trial.state.durationMs

  // Run 表的用量字段可空：null 才是「未知」，0 是「确实为 0」。
  // 两个 token 只要有一个未知，就不展示 token 行，避免把未知读成免费。
  const usage = selectedRun
    ? selectedRun.tokensIn !== null && selectedRun.tokensOut !== null
      ? {
          tokensIn: selectedRun.tokensIn,
          tokensOut: selectedRun.tokensOut,
          costCny: selectedRun.costCny,
        }
      : null
    : trial.state.usage

  const tokens = usage
    ? tokenText(usage.tokensIn, usage.tokensOut, false)
    : trial.estimate
      ? tokenText(trial.estimate.tokensIn, trial.estimate.tokensOut, true)
      : '未知'

  const cost =
    usage != null
      ? formatUsageCost(usage.costCny)
      : trial.estimate?.costCny !== undefined
        ? `约 ${formatUsageCost(trial.estimate.costCny)}`
        : '未知'

  const error = selectedRun
    ? selectedRun.status === 'failed'
      ? (selectedRun.errorMsg ?? '这次运行失败了。')
      : null
    : trial.state.error

  const reason = useMemo(() => {
    if (trial.availability.available) {
      return ''
    }
    return trial.availability.reason || '没有可用模型。'
  }, [trial.availability.available, trial.availability.reason])

  const runDisabledReason = !trial.availability.available
    ? reason
    : disabled
      ? '生成或重算进行中，完成后可以试运行。'
      : prompt.trim().length === 0
        ? '提示词为空，无法试运行。'
        : ''

  const displayStatus = selectedRun?.status ?? trial.state.phase
  const outputPlaceholder = trial.isRunning
    ? '正在等待模型输出。'
    : error
      ? '本次没有可展示的输出。'
      : displayStatus === 'canceled'
        ? '本次运行已取消，没有收到输出。'
        : '点「试运行」后，真实输出会显示在这里。'

  return (
    <section
      aria-labelledby="trial-run-heading"
      className="mb-5 overflow-hidden rounded-panel border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-label font-medium text-ink"
        >
          <span aria-hidden className="text-caption text-ink-faint">
            {expanded ? '▾' : '▸'}
          </span>
          <span id="trial-run-heading">试运行</span>
          <span
            className={cn('text-caption', phaseClass(trial.state.phase))}
            aria-live="polite"
          >
            {phaseLabel(trial.state.phase)}
          </span>
        </button>

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-faint tnum">
          <div className="flex items-center gap-1">
            <dt>模型</dt>
            <dd className="text-ink-muted">
              {trial.availability.model?.label ??
                trial.state.modelLabel ??
                '未知'}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>耗时</dt>
            <dd className="text-ink-muted">{formatDuration(durationMs)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>token</dt>
            <dd
              className="text-ink-muted"
              title={
                usage == null && trial.estimate !== null
                  ? '运行中按字符数估算，收到模型用量后以实际值为准。'
                  : undefined
              }
            >
              {tokens}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>金额</dt>
            <dd className="text-ink-muted">{cost}</dd>
          </div>
        </dl>

        <div className="ml-auto flex items-center gap-2">
          {trial.isRunning ? (
            <button
              type="button"
              onClick={trial.cancel}
              className="rounded-control border border-line px-3 py-1.5 text-label font-medium text-danger transition-colors hover:bg-bg-sunken"
            >
              停止运行
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedRunId(null)
                void trial.run()
              }}
              disabled={!trial.canRun}
              title={runDisabledReason || undefined}
              className="rounded-control bg-accent px-3 py-1.5 text-label font-medium text-bg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
            >
              试运行
            </button>
          )}
        </div>
      </div>

      {autoNotice !== null && autoNotice.outcome !== 'unavailable' ? (
        <div className="border-b border-line bg-bg-sunken px-4 py-2">
          <p className="text-caption text-ink-muted" role="status">
            {autoNotice.message}
          </p>
        </div>
      ) : null}

      {!trial.availability.available ? (
        <div className="border-b border-line bg-bg-sunken px-4 py-2">
          <p className="text-caption text-ink-muted" role="status">
            {trial.availability.status === 'loading'
              ? '正在确认可用模型。'
              : `试运行不可用。${reason}`}
          </p>
        </div>
      ) : null}

      {expanded ? (
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="mb-2 text-caption text-ink-faint">变量</p>
            <RunForm
              fields={trial.fields}
              values={trial.values}
              errors={trial.errors}
              disabled={trial.isRunning}
              onChange={trial.setValue}
            />
            {disabled ? (
              <p className="mt-3 text-caption text-ink-faint">
                生成或重算进行中，完成后可以试运行。
              </p>
            ) : null}
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-caption text-ink-faint">
                {selectedRun
                  ? `历史输出 · ${formatTime(selectedRun.createdAt)} · ${
                      RUN_STATUS_LABELS[selectedRun.status] ?? selectedRun.status
                    }`
                  : '输出'}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-caption text-ink-faint tnum">
                  已输出 {Array.from(displayOutput).length} 字
                </span>
                {selectedRun ? (
                  <button
                    type="button"
                    onClick={() => setSelectedRunId(null)}
                    className="text-caption text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                  >
                    返回本次输出
                  </button>
                ) : null}
              </div>
            </div>
            <pre
              ref={outputRef}
              aria-label="试运行输出"
              aria-busy={trial.isRunning}
              className="max-h-80 min-h-32 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-bg-sunken px-3 py-2 font-mono text-caption text-ink"
            >
              {displayOutput.length > 0 ? displayOutput : outputPlaceholder}
            </pre>

            {displayReasoning.length > 0 ? (
              <details className="mt-2 rounded-control border border-line bg-surface px-3 py-2">
                <summary className="cursor-pointer text-caption text-ink-muted">
                  思考过程
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-caption text-ink-muted">
                  {displayReasoning}
                </pre>
              </details>
            ) : null}

            {error ? (
              <p role="alert" className="mt-2 text-caption text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {trial.history.length > 0 ? (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 text-caption text-ink-faint">本会话运行记录</p>
          <ul className="flex flex-wrap gap-2">
            {trial.history.map((item) => {
              const active = item.id === selectedRunId
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRunId(item.id)}
                    disabled={trial.isRunning}
                    aria-pressed={active}
                    className={cn(
                      'rounded-chip border px-2 py-1 text-caption tnum transition-colors disabled:cursor-not-allowed disabled:text-ink-faint',
                      active
                        ? 'border-accent bg-accent-subtle text-accent'
                        : 'border-line bg-bg-sunken text-ink-muted hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {formatTime(item.createdAt)} ·{' '}
                    {RUN_STATUS_LABELS[item.status] ?? item.status} ·{' '}
                    {formatDuration(item.latencyMs)}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
