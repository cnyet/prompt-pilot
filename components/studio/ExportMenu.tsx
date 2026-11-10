'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildExportAssumptions } from '@/lib/engine/assumptions'
import {
  buildMarkdownExport,
  buildOpenAIMessagesExport,
  type ExportResult,
} from '@/lib/engine/export'
import type { Assumption, PromptSchema } from '@/lib/engine/schema'
import { cn } from '@/lib/utils'
import { copyText } from './clipboard'

type ExportFormat = 'markdown' | 'openai-messages'
type CopyState = 'idle' | 'copied' | 'failed'

const FORMAT_ORDER: readonly ExportFormat[] = ['markdown', 'openai-messages']

const FORMAT_META: Record<
  ExportFormat,
  { label: string; copyLabel: string; hint: string }
> = {
  markdown: {
    label: 'Markdown',
    copyLabel: '复制 Markdown',
    hint: '结构可读，变量以 {{var}} 保留。',
  },
  'openai-messages': {
    label: 'OpenAI messages',
    copyLabel: '复制 JSON',
    hint: '合法 JSON，含 system / user 角色与变量清单。调用时取 model 与 messages。',
  },
}

export interface ExportMenuProps {
  schema: PromptSchema
  assumptions: ReadonlyArray<{
    path: string
    label: string
    value: string
  }>
  omitAssumptions: boolean
  onOmitAssumptionsChange: (next: boolean) => void
}

/**
 * 导出菜单（工单 12）。
 *
 * 受控组件：格式与复制反馈是本地 UI 状态，假设剔除开关由父组件持有。
 * 这里不读 useGeneration、不发请求，只调用 `lib/engine/export.ts` 的纯函数。
 * 导出结果先过语法自检，失败时只显示原因并禁用复制，不会把坏文件交出去。
 */
export function ExportMenu({
  schema,
  assumptions,
  omitAssumptions,
  onOmitAssumptionsChange,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const resolvedAssumptions = useMemo(() => {
    const full: Assumption[] = assumptions.map((item) => ({
      path: item.path,
      label: item.label,
      value: item.value,
      candidates: [],
      source: 'inferred',
    }))
    return buildExportAssumptions(full, { omitAssumptions })
  }, [assumptions, omitAssumptions])

  const result = useMemo<ExportResult>(() => {
    const input = { schema, assumptions: resolvedAssumptions }
    return format === 'markdown'
      ? buildMarkdownExport(input)
      : buildOpenAIMessagesExport(input)
  }, [format, schema, resolvedAssumptions])

  const active = FORMAT_META[format]
  const copyLabel =
    copyState === 'copied'
      ? '已复制'
      : copyState === 'failed'
        ? '复制失败，重试'
        : active.copyLabel

  const clearCopyFeedback = () => {
    setCopyState('idle')
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handleCopy = async () => {
    if (!result.ok) {
      return
    }
    const ok = await copyText(result.content)
    setCopyState(ok ? 'copied' : 'failed')
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      setCopyState('idle')
      timerRef.current = null
    }, 2000)
  }

  const literalHint =
    result.ok && result.literalPlaceholders.length > 0
      ? `未声明的 ${result.literalPlaceholders
          .map((name) => `{{${name}}}`)
          .join('、')} 按字面量保留。`
      : ''

  const toggleOpen = () => {
    if (open) {
      clearCopyFeedback()
    }
    setOpen(!open)
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={cn(
          'rounded-control border px-3 py-1.5 text-label transition-colors',
          open
            ? 'border-line-strong text-ink'
            : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
        )}
      >
        导出
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="导出提示词"
          className="absolute right-0 top-full z-20 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-overlay border border-line-strong bg-surface p-3"
        >
          <div
            role="group"
            aria-label="导出格式"
            className="flex items-center gap-1 border-b border-line"
          >
            {FORMAT_ORDER.map((id) => {
              const selected = id === format
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    clearCopyFeedback()
                    setFormat(id)
                  }}
                  className={cn(
                    'relative px-2.5 py-1.5 text-label transition-colors',
                    selected ? 'text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {FORMAT_META[id].label}
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-chip bg-accent"
                    />
                  ) : null}
                </button>
              )
            })}
          </div>

          <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-caption text-ink-muted">
            <input
              type="checkbox"
              checked={omitAssumptions}
              onChange={(event) => {
                clearCopyFeedback()
                onOmitAssumptionsChange(event.target.checked)
              }}
              className="mt-0.5 size-3.5 rounded-chip border-line accent-[var(--accent)]"
            />
            <span>
              导出时剔除假设注释
              <span className="mt-0.5 block text-ink-faint">
                和假设条上的开关共用同一个状态，只影响导出内容。
              </span>
            </span>
          </label>

          {result.ok ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
                <span>{`${result.variables.length} 个变量`}</span>
                {literalHint.length > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-warning">{literalHint}</span>
                  </>
                ) : null}
              </div>
              <pre
                tabIndex={0}
                aria-label="导出预览"
                className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-bg-sunken p-2.5 font-mono text-caption text-ink-muted"
              >
                {result.content}
              </pre>
            </>
          ) : (
            <div
              role="alert"
              className="mt-2 rounded-control border border-line bg-bg-sunken px-2.5 py-2"
            >
              <p className="text-caption font-medium text-danger">
                导出内容有语法问题，已阻止复制
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-caption text-ink-muted">
                {result.issues.map((issue, index) => (
                  <li key={`${issue.code}-${issue.path ?? ''}-${index}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="min-w-0 text-caption text-ink-faint">
              {active.hint}
            </p>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!result.ok}
              className={cn(
                'shrink-0 rounded-control bg-accent px-3 py-1.5 text-label font-medium text-bg transition-colors hover:bg-accent-hover',
                'disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint',
              )}
            >
              <span aria-live="polite">{copyLabel}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
