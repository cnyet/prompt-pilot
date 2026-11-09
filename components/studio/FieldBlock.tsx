'use client'

import { useId, useState } from 'react'
import { FIELD_LABELS, type FieldKey } from '@/lib/engine/schema'
import { cn } from '@/lib/utils'
import { FieldSuggestionDiff } from './FieldSuggestionDiff'
import type { FieldView, GenerationPhase } from './types'

function statusLabel(
  state: FieldView,
  phase: GenerationPhase,
  scheduled: boolean,
): string {
  if (state.suggestion) {
    return '有新版本'
  }
  switch (state.status) {
    case 'streaming':
      return '生成中'
    case 'edited':
      return '已手改'
    case 'done':
      return '已生成'
    case 'partial':
      return '已停止'
    case 'failed':
      return '生成失败'
    case 'suggested':
      return '有新版本'
    case 'idle':
      return phase === 'streaming' && scheduled ? '等待生成' : '未生成'
  }
}

function statusClass(state: FieldView): string {
  if (state.suggestion) {
    return 'text-warning'
  }
  switch (state.status) {
    case 'streaming':
      return 'text-accent'
    case 'edited':
      return 'text-ink-muted'
    case 'failed':
      return 'text-danger'
    case 'done':
      return 'text-ink-muted'
    case 'partial':
      return 'text-warning'
    case 'suggested':
      return 'text-warning'
    case 'idle':
      return 'text-ink-faint'
  }
}

function sourceLabel(state: FieldView): string {
  return state.origin === 'patch' ? '补丁写入内容' : 'AI 生成内容'
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
  onAcceptSuggestion,
  onDiscardSuggestion,
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
  onAcceptSuggestion: () => void
  onDiscardSuggestion: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const editorId = useId()

  const expanded = active || !collapsed
  const hasPending = state.pendingText.length > 0
  // 流式期间也允许直接编辑。用户一开始打字，值就落到文档里，后续 delta 只进 pending。
  const streaming = state.status === 'streaming' || hasPending
  const editable =
    state.status !== 'idle' &&
    (state.status !== 'failed' ||
      state.text.trim().length > 0 ||
      hasPending)
  const waiting = state.status === 'idle' && phase === 'streaming' && scheduled
  // 失败但仍有正文时，重试入口放在头部；未生成或失败且无正文时，入口放在空态里。
  const showHeaderRetry =
    state.status === 'failed' && editable && phase !== 'idle'
  const showBodyRetry =
    (state.status === 'idle' ||
      (state.status === 'failed' && !editable)) &&
    phase !== 'idle' &&
    phase !== 'streaming'

  // 未手改时，编辑区展示待提交的 pending；手改后只展示自己的文本。
  const displayText = state.dirty
    ? state.text
    : hasPending
      ? state.pendingText
      : state.text

  const lineCount = displayText.split('\n').reduce((total, line) => {
    return total + Math.max(1, Math.ceil(Array.from(line).length / 34))
  }, 0)
  const rows = Math.min(18, Math.max(3, lineCount))
  const showSourceDot =
    !state.dirty &&
    state.status !== 'idle' &&
    (state.origin === 'ai' || state.origin === 'patch') &&
    displayText.trim().length > 0

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
          {showSourceDot ? (
            <span
              aria-hidden
              title={sourceLabel(state)}
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
          {state.suggestion ? (
            <div className="border-b border-line bg-accent-subtle px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-ink-muted">
                  AI 有新版本。你手改的内容已保留。
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDiff((previous) => !previous)}
                    className="rounded-control border border-line px-2 py-0.5 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {showDiff ? '收起差异' : '查看差异'}
                  </button>
                  <button
                    type="button"
                    onClick={onAcceptSuggestion}
                    className="rounded-control border border-line px-2 py-0.5 text-caption font-medium text-accent transition-colors hover:border-line-strong"
                  >
                    采纳
                  </button>
                  <button
                    type="button"
                    onClick={onDiscardSuggestion}
                    className="rounded-control border border-line px-2 py-0.5 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    丢弃
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {state.suggestion && showDiff ? (
            <FieldSuggestionDiff
              current={state.text}
              suggested={state.suggestion.value}
            />
          ) : null}

          {waiting ? (
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
              value={displayText}
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

          {streaming && state.dirty && hasPending ? (
            <details className="border-t border-line px-4 py-2">
              <summary className="cursor-pointer text-caption text-ink-faint">
                AI 正在生成的版本，{Array.from(state.pendingText).length} 字
              </summary>
              <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-body text-ink-muted">
                {state.pendingText}
              </p>
            </details>
          ) : null}

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
