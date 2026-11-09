'use client'

import { useId, useState } from 'react'
import { FIELD_LABELS, type FieldKey } from '@/lib/engine/schema'
import { cn } from '@/lib/utils'
import type { FieldView, GenerationPhase } from './types'

function statusLabel(
  state: FieldView,
  phase: GenerationPhase,
  scheduled: boolean,
): string {
  switch (state.status) {
    case 'streaming':
      return '生成中'
    case 'done':
      return '已生成'
    case 'partial':
      return '已停止'
    case 'failed':
      return '生成失败'
    case 'idle':
      return phase === 'streaming' && scheduled ? '等待生成' : '未生成'
  }
}

function statusClass(state: FieldView): string {
  switch (state.status) {
    case 'streaming':
      return 'text-accent'
    case 'failed':
      return 'text-danger'
    case 'done':
      return 'text-ink-muted'
    case 'partial':
      return 'text-warning'
    case 'idle':
      return 'text-ink-faint'
  }
}

export function FieldBlock({
  field,
  index,
  state,
  phase,
  busy,
  active,
  scheduled,
  onRetry,
  onChange,
}: {
  field: FieldKey
  index: number
  state: FieldView
  phase: GenerationPhase
  busy: boolean
  active: boolean
  scheduled: boolean
  onRetry: () => void
  onChange: (text: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const editorId = useId()
  const expanded = active || !collapsed
  const editable =
    state.status === 'done' ||
    state.status === 'partial' ||
    (state.status === 'failed' && state.text.trim().length > 0)
  const waiting = state.status === 'idle' && phase === 'streaming' && scheduled
  // 失败但仍有正文时，重试入口放在头部；未生成或失败且无正文时，入口放在空态里。
  const showHeaderRetry =
    state.status === 'failed' && editable && phase !== 'idle'
  const showBodyRetry =
    (state.status === 'idle' ||
      (state.status === 'failed' && !editable)) &&
    phase !== 'idle' &&
    phase !== 'streaming'

  const lineCount = state.text.split('\n').reduce((total, line) => {
    return total + Math.max(1, Math.ceil(Array.from(line).length / 34))
  }, 0)
  const rows = Math.min(18, Math.max(3, lineCount))

  return (
    <section
      className={cn(
        'overflow-hidden rounded-panel border bg-surface',
        active ? 'border-line-strong' : 'border-line',
      )}
      aria-labelledby={`${editorId}-title`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((previous) => !previous)}
          disabled={active}
          aria-expanded={expanded}
          aria-controls={`${editorId}-body`}
          className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
        >
          <span aria-hidden className="text-caption text-ink-faint">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="text-caption text-ink-faint tnum">
            {String(index).padStart(2, '0')}
          </span>
          {!state.dirty && state.text.length > 0 && state.status !== 'idle' ? (
            <span
              aria-hidden
              title="AI 生成内容"
              className="size-1.5 shrink-0 rounded-full bg-accent"
            />
          ) : null}
          <span
            id={`${editorId}-title`}
            className="truncate text-label font-medium text-ink"
          >
            {FIELD_LABELS[field]}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn('text-caption', statusClass(state))}
            aria-live="polite"
          >
            {statusLabel(state, phase, scheduled)}
          </span>
          {showHeaderRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="rounded-control border border-line px-2 py-0.5 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
            >
              重试
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div id={`${editorId}-body`}>
          {state.status === 'streaming' ? (
            <div className="whitespace-pre-wrap break-words px-4 py-3 text-body-lg text-ink">
              {state.text}
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[0.12em] bg-accent align-baseline"
              />
              <span className="sr-only">正在生成</span>
            </div>
          ) : waiting ? (
            <div className="flex flex-col gap-2 px-4 py-4" aria-hidden>
              <div
                className="h-3 w-2/3 animate-pulse rounded-chip bg-bg-sunken"
                style={{ animationDuration: '1.4s' }}
              />
              <div
                className="h-3 w-5/6 animate-pulse rounded-chip bg-bg-sunken"
                style={{ animationDuration: '1.4s' }}
              />
              <div
                className="h-3 w-1/2 animate-pulse rounded-chip bg-bg-sunken"
                style={{ animationDuration: '1.4s' }}
              />
            </div>
          ) : editable ? (
            <textarea
              id={`${editorId}-editor`}
              value={state.text}
              rows={rows}
              onChange={(event) => onChange(event.target.value)}
              aria-label={`${FIELD_LABELS[field]}内容`}
              className="w-full resize-y bg-transparent px-4 py-3 text-body-lg text-ink focus:outline-none"
            />
          ) : (
            <div className="flex flex-col items-start gap-2 px-4 py-4">
              <p className="text-body text-ink-faint">未生成</p>
              {showBodyRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={busy}
                  className="rounded-control border border-line px-2.5 py-1 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                >
                  重试此字段
                </button>
              ) : null}
            </div>
          )}

          {state.error ? (
            <p className="border-t border-line px-4 py-2 text-caption text-danger">
              {state.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
