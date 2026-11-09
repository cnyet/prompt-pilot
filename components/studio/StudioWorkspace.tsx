'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'
import { renderMarkdownDocument } from '@/lib/engine/render'
import { cn } from '@/lib/utils'
import { copyText } from './clipboard'
import { FieldBlock } from './FieldBlock'
import { RequirementInput } from './RequirementInput'
import { useGeneration } from './useGeneration'

type CopyState = 'idle' | 'copied' | 'failed'

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)} 毫秒`
  }
  return `${(ms / 1000).toFixed(1)} 秒`
}

export function StudioWorkspace() {
  const {
    phase,
    fields,
    scheduled,
    title,
    assumptions,
    durationMs,
    error,
    isBusy,
    generate,
    retryFields,
    updateField,
    stop,
    reset,
  } = useGeneration()

  const [submitted, setSubmitted] = useState('')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (phase !== 'streaming') {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        stop()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, stop])

  const handleSubmit = useCallback(
    (input: string) => {
      setSubmitted(input)
      setCopyState('idle')
      void generate(input)
    },
    [generate],
  )

  const handleReset = useCallback(() => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
    reset()
    setSubmitted('')
    setCopyState('idle')
  }, [reset])

  const flashCopy = useCallback((next: CopyState) => {
    setCopyState(next)
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = setTimeout(() => {
      setCopyState('idle')
      copyTimerRef.current = null
    }, 2200)
  }, [])

  const handleCopy = useCallback(async () => {
    const fieldTexts: Partial<Record<FieldKey, string>> = {}
    for (const field of FIELD_KEYS) {
      fieldTexts[field] = fields[field].text
    }
    const markdown = renderMarkdownDocument({
      title: title || submitted || '未命名提示词',
      fields: fieldTexts,
    })
    const ok = await copyText(markdown)
    flashCopy(ok ? 'copied' : 'failed')
  }, [fields, title, submitted, flashCopy])

  if (phase === 'idle') {
    return <RequirementInput onSubmit={handleSubmit} busy={isBusy} />
  }

  const doneCount = FIELD_KEYS.filter(
    (field) => fields[field].status === 'done',
  ).length
  const streamingField = FIELD_KEYS.find(
    (field) => fields[field].status === 'streaming',
  )
  const currentIndex = streamingField
    ? FIELD_KEYS.indexOf(streamingField) + 1
    : Math.min(doneCount + 1, FIELD_KEYS.length)
  const missingFields = FIELD_KEYS.filter(
    (field) =>
      fields[field].status === 'idle' ||
      (fields[field].status === 'failed' &&
        fields[field].text.trim().length === 0),
  )
  const hasAnyField = FIELD_KEYS.some(
    (field) => fields[field].text.trim().length > 0,
  )

  const displayTitle =
    title || (phase === 'streaming' ? '正在生成结构' : '生成结果')

  let statusText = ''
  if (phase === 'streaming') {
    statusText =
      scheduled.length < FIELD_KEYS.length
        ? `正在重试第 ${currentIndex} 个字段`
        : `正在生成第 ${currentIndex} 个字段，已完成 ${doneCount} / ${FIELD_KEYS.length}`
  } else if (phase === 'done') {
    statusText = durationMs
      ? `生成完成，用时 ${formatDuration(durationMs)}`
      : '生成完成'
  } else if (phase === 'stopped') {
    statusText = '生成已停止。已生成字段可编辑，未生成字段可单独重试。'
  } else {
    statusText = '生成中断。已生成字段已保留，可以重试未生成的字段。'
  }

  const copyLabel =
    copyState === 'copied'
      ? '已复制'
      : copyState === 'failed'
        ? '复制失败，重试'
        : '复制 Markdown'

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-panel border border-line bg-surface p-4">
            <p className="text-label font-medium text-ink">原始需求</p>
            <p className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-body text-ink-muted">
              {submitted}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-chip border border-line bg-bg-sunken px-2 py-1 text-caption text-ink-muted">
                离线模板
              </span>
              <span className="rounded-chip border border-line bg-bg-sunken px-2 py-1 text-caption text-ink-muted tnum">
                {doneCount} / {FIELD_KEYS.length} 字段
              </span>
            </div>
            <p className="mt-4 text-caption text-ink-faint">
              所有字段都可以直接编辑，未生成字段可以单独重试。
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-4 w-full rounded-control border border-line px-2.5 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              重新开始
            </button>
          </div>
        </aside>

        <section className="min-w-0" aria-busy={isBusy}>
          <header className="mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption text-ink-faint">结构化提示词</p>
                <h2 className="mt-1 truncate text-h2 text-ink">{displayTitle}</h2>
                <p className="mt-1 truncate text-caption text-ink-faint">
                  需求：{submitted}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={!hasAnyField || phase === 'streaming'}
                  className={cn(
                    'rounded-control border border-line px-3 py-1.5 text-label transition-colors',
                    copyState === 'failed'
                      ? 'text-danger'
                      : 'text-ink-muted hover:border-line-strong hover:text-ink',
                    'disabled:cursor-not-allowed disabled:text-ink-faint',
                  )}
                >
                  {copyLabel}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-control border border-line px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink lg:hidden"
                >
                  重新开始
                </button>
              </div>
            </div>

            {assumptions.length > 0 ? (
              <div className="mt-4">
                <p className="text-caption text-ink-faint">模板假设</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {assumptions.map((assumption) => (
                    <li
                      key={`${assumption.path}-${assumption.label}`}
                      className="rounded-chip border border-line bg-bg-sunken px-2 py-1 text-caption"
                      title="离线模板的默认假设"
                    >
                      <span className="text-ink-faint">{assumption.label}：</span>
                      <span className="text-ink-muted">{assumption.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </header>

          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-panel border border-line bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger"
                />
                <div className="min-w-0">
                  <p className="text-label font-medium text-ink">
                    {error.message}
                  </p>
                  <p className="mt-1 text-body text-ink-muted">{error.hint}</p>
                  {error.retryable && missingFields.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void retryFields(missingFields)}
                      disabled={isBusy}
                      className="mt-3 rounded-control border border-line px-2.5 py-1 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                    >
                      重试未生成字段
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {FIELD_KEYS.map((field, index) => (
              <FieldBlock
                key={field}
                field={field}
                index={index + 1}
                state={fields[field]}
                phase={phase}
                busy={isBusy}
                active={fields[field].status === 'streaming'}
                scheduled={scheduled.includes(field)}
                onRetry={() => {
                  void retryFields([field])
                }}
                onChange={(text) => updateField(field, text)}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-caption text-ink-muted tnum" aria-live="polite">
              {statusText}
            </p>
            <div className="flex items-center gap-2">
              {phase === 'streaming' ? (
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-control border border-line px-3 py-1.5 text-label font-medium text-danger transition-colors hover:bg-bg-sunken"
                >
                  停止生成
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={!hasAnyField}
                  className="rounded-control border border-line px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                >
                  {copyLabel}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
