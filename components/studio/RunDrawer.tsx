'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PromptVariable } from '@/lib/engine/schema'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
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

  // 键盘路径：⌘Enter 运行，Esc 取消本次运行。与按钮走同一个 run / cancel。
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (!trial.canRun) {
          return
        }
        event.preventDefault()
        setSelectedRunId(null)
        void trial.run()
        return
      }
      if (event.key === 'Escape' && trial.isRunning) {
        event.preventDefault()
        trial.cancel()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [trial.canRun, trial.cancel, trial.isRunning, trial.run])

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
      className="mt-6 overflow-hidden rounded-panel border border-line bg-surface"
    >
      <div className="border-b border-line-subtle px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="flex items-center gap-2 text-label font-medium text-ink"
          >
            <Icon
              name="chevron-right"
              size={14}
              className={cn(
                'text-ink-faint transition-transform duration-150',
                expanded && 'rotate-90',
              )}
            />
            <span id="trial-run-heading">试运行</span>
            <span
              className={cn(
                'text-caption font-normal',
                phaseClass(trial.state.phase),
              )}
              aria-live="polite"
            >
              {phaseLabel(trial.state.phase)}
            </span>
          </button>

          <span className="ml-auto hidden text-caption text-ink-faint sm:inline">
            ⌘Enter 试运行
          </span>
          {trial.isRunning ? (
            <Button
              variant="secondary"
              size="sm"
              icon="stop"
              onClick={trial.cancel}
              className="text-danger"
            >
              停止运行
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon="play"
              onClick={() => {
                setSelectedRunId(null)
                void trial.run()
              }}
              disabled={!trial.canRun}
              title={runDisabledReason || '试运行（⌘Enter）'}
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              试运行
            </Button>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="shrink-0 text-caption text-ink-faint">模型</dt>
            <dd className="truncate text-right text-caption text-ink-muted">
              {trial.availability.model?.label ??
                trial.state.modelLabel ??
                '未知'}
            </dd>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="shrink-0 text-caption text-ink-faint">耗时</dt>
            <dd className="text-right text-caption text-ink-muted tnum">
              {formatDuration(durationMs)}
            </dd>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="shrink-0 text-caption text-ink-faint">token</dt>
            <dd
              className="text-right text-caption text-ink-muted tnum"
              title={
                usage == null && trial.estimate !== null
                  ? '运行中按字符数估算，收到模型用量后以实际值为准。'
                  : undefined
              }
            >
              {tokens}
            </dd>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="shrink-0 text-caption text-ink-faint">金额</dt>
            <dd className="text-right text-caption text-ink-muted tnum">
              {cost}
            </dd>
          </div>
        </dl>
      </div>

      {autoNotice !== null && autoNotice.outcome !== 'unavailable' ? (
        <div className="border-b border-line-subtle bg-surface-inset px-4 py-2">
          <p className="text-caption text-ink-muted" role="status">
            {autoNotice.message}
          </p>
        </div>
      ) : null}

      {!trial.availability.available ? (
        <div className="border-b border-line-subtle bg-surface-inset px-4 py-2">
          <p className="text-caption text-ink-muted" role="status">
            {trial.availability.status === 'loading'
              ? '正在确认可用模型。'
              : `试运行不可用。${reason}`}
          </p>
        </div>
      ) : null}

      {expanded ? (
        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
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
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => setSelectedRunId(null)}
                  >
                    返回本次输出
                  </Button>
                ) : null}
              </div>
            </div>
            <pre
              ref={outputRef}
              aria-label="试运行输出"
              aria-busy={trial.isRunning}
              className="max-h-80 min-h-32 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-inset px-3 py-2 font-mono text-caption text-ink"
            >
              {displayOutput.length > 0 ? displayOutput : outputPlaceholder}
            </pre>

            {displayReasoning.length > 0 ? (
              <details className="mt-2 rounded-control bg-surface-inset px-3 py-2">
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
        <div className="border-t border-line-subtle px-4 py-3">
          <p className="mb-2 text-caption text-ink-faint">本会话运行记录</p>
          <ul className="flex flex-wrap gap-1.5">
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
                      'rounded-chip px-2 py-1 text-caption tnum transition-colors duration-150 disabled:cursor-not-allowed disabled:text-ink-faint',
                      active
                        ? 'bg-accent-subtle text-accent'
                        : 'bg-bg-sunken text-ink-muted hover:bg-surface-inset hover:text-ink',
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
