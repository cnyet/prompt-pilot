'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MeterBar } from '@/components/ui/MeterBar'
import { StatTile } from '@/components/ui/StatTile'
import { cn } from '@/lib/utils'

interface PromptOption {
  id: string
  title: string
  versionCount: number
  latestVersionNo: number | null
}

interface TaskRow {
  id: string
  name: string
  mode: string
  status: string
  sampleCount: number
  winRate: number | null
  passRate: number | null
  judgeModelId: string | null
  createdAt: string
}

interface CheckRow {
  sampleIndex: number
  criterionIndex: number
  criterionText: string
  status: string
  note: string | null
}

interface TaskDetail {
  id: string
  name: string
  status: string
  sampleCount: number
  winRate: number | null
  createdAt: string
  checks: CheckRow[]
  result: {
    versionNo?: number
    baselineVersionNo?: number | null
    samples?: Array<{
      input: string
      targetOutput: string
      baselineOutput: string | null
      comparison: string | null
    }>
    summary?: {
      passRate: number | null
      winRate: number | null
      counts: Record<string, number>
      judgedSamples: number
    }
  } | null
}

const VERDICT_META: Record<
  string,
  { label: string; className: string }
> = {
  satisfied: { label: '满足', className: 'bg-tint-sage text-ink' },
  partial: { label: '部分满足', className: 'bg-tint-butter text-ink' },
  unsatisfied: { label: '不满足', className: 'bg-tint-coral text-ink' },
}

const COMPARISON_LABEL: Record<string, string> = {
  better: '比 v0 好',
  same: '与 v0 相当',
  worse: '比 v0 差',
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function EvalWorkspace() {
  const [prompts, setPrompts] = useState<PromptOption[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [promptId, setPromptId] = useState('')
  const [samplesText, setSamplesText] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const loadLists = useCallback(async () => {
    const [promptResponse, taskResponse] = await Promise.all([
      fetch('/api/prompts?limit=50', { cache: 'no-store' }),
      fetch('/api/eval', { cache: 'no-store' }),
    ])
    if (promptResponse.ok) {
      const payload = (await promptResponse.json()) as { prompts?: PromptOption[] }
      const list = payload.prompts ?? []
      setPrompts(list)
      setPromptId((current) => current || (list[0]?.id ?? ''))
    }
    if (taskResponse.ok) {
      const payload = (await taskResponse.json()) as { tasks?: TaskRow[] }
      setTasks(payload.tasks ?? [])
    }
  }, [])

  useEffect(() => {
    void loadLists()
  }, [loadLists])

  const samples = useMemo(
    () =>
      samplesText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [samplesText],
  )

  const run = async () => {
    if (promptId.length === 0) {
      setError('先选一条提示词。')
      return
    }
    if (samples.length === 0) {
      setError('至少填一条样本输入，每行一条。')
      return
    }
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, samples }),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null
            ? ((body as { error?: { message?: string } }).error?.message ??
              '评估失败')
            : '评估失败'
        throw new Error(message)
      }
      setNotice('评估完成。')
      setSamplesText('')
      await loadLists()
      const result = (body as { result?: { taskId?: string } }).result
      if (result?.taskId) {
        await openDetail(result.taskId)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '评估失败。')
    } finally {
      setRunning(false)
    }
  }

  const openDetail = async (taskId: string) => {
    setLoadingDetail(true)
    try {
      const response = await fetch(`/api/eval/${taskId}`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('读取评估详情失败。')
      }
      const payload = (await response.json()) as { task: TaskDetail }
      setDetail(payload.task)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取详情失败。')
    } finally {
      setLoadingDetail(false)
    }
  }

  const groupedChecks = useMemo(() => {
    if (!detail) {
      return []
    }
    const bySample = new Map<number, CheckRow[]>()
    for (const check of detail.checks) {
      const list = bySample.get(check.sampleIndex) ?? []
      list.push(check)
      bySample.set(check.sampleIndex, list)
    }
    return [...bySample.entries()].sort((a, b) => a[0] - b[0])
  }, [detail])

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 rounded-panel border border-line-subtle bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="eval-prompt" className="text-label text-ink">
            评估对象
          </label>
          <select
            id="eval-prompt"
            value={promptId}
            onChange={(event) => setPromptId(event.target.value)}
            className="h-9 min-w-[240px] flex-1 rounded-control border border-line bg-surface px-2.5 text-label text-ink focus:border-accent focus:outline-none"
          >
            {prompts.length === 0 ? (
              <option value="">库里还没有提示词</option>
            ) : (
              prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.title}（{prompt.versionCount} 个版本）
                </option>
              ))
            )}
          </select>
        </div>

        <label htmlFor="eval-samples" className="text-label text-ink">
          样本输入
        </label>
        <textarea
          id="eval-samples"
          value={samplesText}
          onChange={(event) => setSamplesText(event.target.value)}
          rows={4}
          placeholder={'每行一条样本，最多 5 条\n帮我写个周报\n帮我写一份产品评审议程'}
          className="w-full resize-y rounded-control border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={run} disabled={running}>
            {running ? '评估中' : '开始评估'}
          </Button>
          <span className="text-caption text-ink-faint tnum">
            {samples.length} 条样本 · 成功标准取自版本自身
          </span>
          {notice ? (
            <span role="status" className="text-caption text-success">
              {notice}
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="text-caption text-danger">
              {error}
            </span>
          ) : null}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-panel border border-line-subtle bg-surface">
          <EmptyState
            icon="eval"
            title="还没有评估"
            hint="选一条提示词，填几条样本输入，跑一次就能看到通过率与和 v0 的对比。"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-h3 font-medium text-ink">评估记录</h2>
          <ul className="divide-y divide-line-subtle rounded-panel border border-line-subtle bg-surface">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(task.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors duration-150 hover:bg-bg-sunken"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-ink">
                    {task.name}
                  </span>
                  <span className="text-caption text-ink-muted tnum">
                    {task.sampleCount} 条样本
                  </span>
                  <span
                    className={cn(
                      'rounded-chip px-1.5 py-0.5 text-caption tnum',
                      task.status === 'completed'
                        ? 'bg-tint-sage text-ink'
                        : 'bg-tint-butter text-ink',
                    )}
                  >
                    {task.status === 'completed' ? '已判定' : '待人工判定'}
                  </span>
                  <span className="w-20 text-right text-caption text-ink-muted tnum">
                    {task.winRate === null
                      ? '—'
                      : `胜率 ${(task.winRate * 100).toFixed(0)}%`}
                  </span>
                  <span className="text-caption text-ink-faint tnum">
                    {formatTime(task.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail ? (
        <div className="flex flex-col gap-4 rounded-panel border border-line-subtle bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-h3 font-medium text-ink">{detail.name}</h2>
            <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
              关闭详情
            </Button>
          </div>

          {loadingDetail ? (
            <p className="text-body text-ink-muted">正在读取详情。</p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <StatTile
              label="通过率"
              value={
                detail.result?.summary?.passRate === null ||
                detail.result?.summary?.passRate === undefined
                  ? '—'
                  : `${Math.round((detail.result.summary.passRate ?? 0) * 100)}%`
              }
              hint="满足记 1，部分满足记 0.5"
            />
            <StatTile
              label="与 v0 相比"
              value={
                detail.winRate === null
                  ? '—'
                  : `${Math.round(detail.winRate * 100)}%`
              }
              hint="better / (better + worse)"
            />
            <StatTile
              label="已判定样本"
              value={String(detail.result?.summary?.judgedSamples ?? 0)}
              hint={`共 ${detail.sampleCount} 条`}
            />
          </div>

          {detail.result?.summary ? (
            <MeterBar
              label="通过率"
              value={detail.result.summary.passRate ?? 0}
              empty={detail.result.summary.passRate === null}
            />
          ) : null}

          {detail.result?.samples && detail.result.samples.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-label font-medium text-ink">样本输出</h3>
              <ol className="flex flex-col gap-1.5">
                {detail.result.samples.map((sample, index) => (
                  <li key={index}>
                    <details className="rounded-control border border-line-subtle bg-surface px-3 py-2">
                      <summary className="cursor-pointer text-label text-ink">
                        #{index + 1} {sample.input}
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        <div>
                          <p className="text-caption text-ink-faint">当前版本输出</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-inset p-2 text-caption text-ink">
                            {sample.targetOutput || '（空输出）'}
                          </pre>
                        </div>
                        {sample.baselineOutput !== null ? (
                          <div>
                            <p className="text-caption text-ink-faint">v0 输出</p>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-inset p-2 text-caption text-ink">
                              {sample.baselineOutput || '（空输出）'}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {groupedChecks.length === 0 ? (
            <p className="rounded-control bg-tint-butter px-3 py-2 text-caption text-ink">
              本次没有产生判定。可能没有可用评估模型，或模型输出无法解析。样本输出仍然保留，可人工判定。
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {groupedChecks.map(([sampleIndex, checks]) => {
                const sample = detail.result?.samples?.[sampleIndex]
                return (
                  <li key={sampleIndex} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-caption text-ink-faint tnum">
                        #{sampleIndex + 1}
                      </span>
                      <span className="text-body text-ink">
                        {sample?.input ?? '样本输入'}
                      </span>
                      {sample?.comparison ? (
                        <span className="rounded-chip bg-bg-sunken px-1.5 py-0.5 text-caption text-ink-muted">
                          {COMPARISON_LABEL[sample.comparison] ??
                            sample.comparison}
                        </span>
                      ) : null}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {checks.map((check) => {
                        const meta = VERDICT_META[check.status] ?? {
                          label: check.status,
                          className: 'bg-bg-sunken text-ink-muted',
                        }
                        return (
                          <li
                            key={`${check.sampleIndex}-${check.criterionIndex}`}
                            className="flex flex-wrap items-start gap-2 text-caption"
                          >
                            <span
                              className={cn(
                                'shrink-0 rounded-chip px-1.5 py-0.5',
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                            <span className="min-w-0 flex-1 text-ink-muted">
                              {check.criterionText}
                              {check.note ? ` · ${check.note}` : ''}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  )
}
