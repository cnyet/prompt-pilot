'use client'

import { useId, useState } from 'react'
import { FIELD_LABELS, type FieldKey } from '@/lib/engine/schema'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'
import { FieldSuggestionDiff } from './FieldSuggestionDiff'
import {
  FIELD_OP_DESCRIPTIONS,
  FIELD_OP_LABELS,
  FIELD_OPS,
  type FieldOp,
  type FieldOpState,
  type FieldView,
  type GenerationPhase,
} from './types'

function statusLabel(
  state: FieldView,
  phase: GenerationPhase,
  scheduled: boolean,
  opState: FieldOpState | undefined,
): string {
  if (opState?.status === 'running') {
    return '重算中'
  }
  if (opState?.status === 'failed') {
    return '重算失败'
  }
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

function statusClass(
  state: FieldView,
  opState: FieldOpState | undefined,
): string {
  if (opState?.status === 'running') {
    return 'text-accent'
  }
  if (opState?.status === 'failed') {
    return 'text-danger'
  }
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
  switch (state.origin) {
    case 'ai':
      return 'AI 生成'
    case 'patch':
      return '补丁写入'
    case 'import':
      return '导入内容'
    case 'user':
    case 'user_input':
      return '用户输入'
  }
}

export function FieldBlock({
  field,
  index,
  state,
  phase,
  busy,
  opBusy,
  active,
  scheduled,
  opState,
  onRetry,
  onChange,
  onOp,
  onAcceptSuggestion,
  onDiscardSuggestion,
}: {
  field: FieldKey
  index: number
  state: FieldView
  phase: GenerationPhase
  busy: boolean
  opBusy: boolean
  active: boolean
  scheduled: boolean
  opState: FieldOpState | undefined
  onRetry: () => void
  onChange: (text: string) => void
  onOp: (op: FieldOp) => void
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
  const baseText = state.dirty
    ? state.text
    : hasPending
      ? state.pendingText
      : state.text
  const running = opState?.status === 'running'
  // 重算进行中先展示流式预览，完成时才写入文档。
  const displayText = running && opState.preview.length > 0
    ? opState.preview
    : baseText

  const lineCount = displayText.split('\n').reduce((total, line) => {
    return total + Math.max(1, Math.ceil(Array.from(line).length / 34))
  }, 0)
  const rows = Math.min(18, Math.max(3, lineCount))
  const showSourceMark =
    !running &&
    !state.dirty &&
    state.status !== 'idle' &&
    displayText.trim().length > 0

  const opsDisabled =
    busy ||
    opBusy ||
    state.status === 'idle' ||
    state.status === 'streaming' ||
    displayText.trim().length === 0

  return (
    <section
      className={cn('py-4', index > 1 && 'border-t border-line-subtle')}
      aria-labelledby={`${editorId}-title`}
      aria-busy={running}
    >
      <div className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((previous) => !previous)}
            disabled={active}
            aria-expanded={expanded}
            aria-controls={`${editorId}-body`}
            className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
          >
            <Icon
              name="chevron-right"
              size={12}
              className={cn(
                'text-ink-faint transition-transform duration-150',
                expanded && 'rotate-90',
              )}
            />
            <span className="text-caption text-ink-faint tnum">
              {String(index).padStart(2, '0')}
            </span>
            <span
              id={`${editorId}-title`}
              className="truncate text-label font-medium text-ink"
            >
              {FIELD_LABELS[field]}
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            {showSourceMark ? (
              <span
                title="这一版由 AI 产出，手改后标记消失"
                className="inline-flex items-center gap-1 rounded-chip bg-accent-subtle px-1.5 py-0.5 text-caption text-accent"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {sourceLabel(state)}
              </span>
            ) : null}
            <span
              className={cn('text-caption', statusClass(state, opState))}
              aria-live="polite"
            >
              {statusLabel(state, phase, scheduled, opState)}
            </span>
            {showHeaderRetry ? (
              <Button
                variant="ghost"
                size="sm"
                icon="redo"
                onClick={onRetry}
                disabled={busy}
                className="-my-1"
              >
                重试
              </Button>
            ) : null}
          </div>
        </div>

        {expanded ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-ink-faint">重算</span>
            {FIELD_OPS.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => onOp(op)}
                disabled={opsDisabled}
                aria-busy={running && opState.action === op}
                title={`${FIELD_OP_LABELS[op]}：${FIELD_OP_DESCRIPTIONS[op]}`}
                className={cn(
                  'rounded-chip px-2 py-0.5 text-caption transition-colors duration-150',
                  running && opState.action === op
                    ? 'bg-accent-subtle text-accent'
                    : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
                  'disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent',
                )}
              >
                {FIELD_OP_LABELS[op]}
              </button>
            ))}
            {running ? (
              <span className="text-caption text-accent" aria-live="polite">
                只改本字段，完成前不写文档。
              </span>
            ) : null}
            {opState?.status === 'failed' ? (
              <span className="text-caption text-danger" aria-live="polite">
                {opState.error ?? '重算失败，已保留原内容。'}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div id={`${editorId}-body`}>
          {state.suggestion ? (
            <div className="my-2 rounded-panel bg-accent-subtle px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-ink-muted">
                  AI 有新版本。你手改的内容已保留。
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => setShowDiff((previous) => !previous)}
                  >
                    {showDiff ? '收起差异' : '查看差异'}
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={onAcceptSuggestion}
                    className="font-medium text-accent"
                  >
                    采纳
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={onDiscardSuggestion}
                  >
                    丢弃
                  </Button>
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
            <div className="flex flex-col gap-2 py-4" aria-hidden>
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
              readOnly={running}
              onChange={(event) => onChange(event.target.value)}
              aria-label={`${FIELD_LABELS[field]}内容`}
              className={cn(
                'w-full resize-y rounded-control bg-transparent px-0 py-2 text-body-lg focus-visible:-outline-offset-2',
                running ? 'text-ink-muted' : 'text-ink',
              )}
            />
          ) : (
            <div className="flex flex-col items-start gap-2 py-3">
              <p className="text-body text-ink-faint">未生成</p>
              {showBodyRetry ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="redo"
                  onClick={onRetry}
                  disabled={busy}
                  className="-ml-2"
                >
                  重试此字段
                </Button>
              ) : null}
            </div>
          )}

          {streaming && state.dirty && hasPending ? (
            <details className="border-t border-line-subtle py-2">
              <summary className="cursor-pointer text-caption text-ink-faint">
                AI 正在生成的版本，{Array.from(state.pendingText).length} 字
              </summary>
              <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-body text-ink-muted">
                {state.pendingText}
              </p>
            </details>
          ) : null}

          {state.error ? (
            <p className="border-t border-line-subtle py-2 text-caption text-danger">
              {state.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
