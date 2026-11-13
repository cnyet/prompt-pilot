'use client'

import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { Rating } from '@/components/ui/Rating'
import { t } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import { MarkdownView } from './MarkdownView'
import { MetaRow, type MetaValues } from './MetaRow'
import { ResultActions } from './ResultActions'
import { isRequestActive, type StreamPhase } from './stream-reducer'

type ResultView = 'rendered' | 'source'

export interface ResultFeedback {
  text: string
  kind: 'status' | 'error'
}

export interface ResultPanelProps {
  source: string
  phase: StreamPhase
  settling: boolean
  meta: MetaValues
  recordId: string | null
  canRegenerate: boolean
  showSaved: boolean
  favorite: boolean
  rating: number | null
  canRate: boolean
  metaBusy: boolean
  feedback: ResultFeedback | null
  onCopy: () => void
  onCopyPlain: () => void
  onDownload: () => void
  onRegenerate: () => void
  onStop: () => void
  onFavorite: () => void
  onRating: (value: number | null) => void
}

function statusText(phase: StreamPhase, settling: boolean): string | null {
  if (settling && phase === 'completed') {
    return t('studio.result.status.settling')
  }
  switch (phase) {
    case 'starting':
    case 'streaming':
      return t('studio.result.status.streaming')
    case 'canceling':
      return t('studio.result.status.canceling')
    case 'canceled':
      return t('studio.result.status.canceled')
    case 'completed':
      return t('studio.result.status.completed')
    case 'failed':
      return t('studio.result.status.failed')
    default:
      return null
  }
}

/**
 * 结果面（DESIGN.md Workspace Result Surface）。
 *
 * 屏幕上最亮的纸：paper-raised 底、顶部 2px 金色描边、正文 68ch。
 * 默认渲染 Markdown，可切源码；源码等宽并横向滚动。未知元信息显示「—」。
 * 收藏与评分只对完成或已中断的记录开放，进行中禁用。
 */
export function ResultPanel({
  source,
  phase,
  settling,
  meta,
  recordId,
  canRegenerate,
  showSaved,
  favorite,
  rating,
  canRate,
  metaBusy,
  feedback,
  onCopy,
  onCopyPlain,
  onDownload,
  onRegenerate,
  onStop,
  onFavorite,
  onRating,
}: ResultPanelProps): ReactElement {
  const [view, setView] = useState<ResultView>('rendered')
  const active = isRequestActive(phase)
  const hasOutput = source.length > 0
  const status = statusText(phase, settling)
  const failed = phase === 'failed'

  return (
    <section
      aria-label={t('studio.result.label')}
      aria-busy={active || undefined}
      data-phase={phase}
      className="relative overflow-hidden rounded-panel border border-line-strong bg-surface-raised shadow-md"
    >
      <div aria-hidden className="h-0.5 w-full bg-accent" />

      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-subtle px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="font-display text-h3 font-semibold text-ink">
            {t('studio.result.label')}
          </h2>
          {status ? (
            <p
              role={failed ? 'alert' : 'status'}
              className={cn(
                'text-caption',
                failed ? 'text-danger' : 'text-ink-faint',
              )}
            >
              {status}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasOutput ? (
            <div
              role="group"
              aria-label={t('studio.result.view.label')}
              className="flex items-center gap-1"
            >
              <Chip
                selected={view === 'rendered'}
                onClick={() => setView('rendered')}
              >
                {t('studio.result.view.rendered')}
              </Chip>
              <Chip
                selected={view === 'source'}
                onClick={() => setView('source')}
              >
                {t('studio.result.view.source')}
              </Chip>
            </div>
          ) : null}
          {hasOutput || recordId || active ? (
            <ResultActions
              phase={phase}
              hasOutput={hasOutput}
              canRegenerate={canRegenerate}
              onCopy={onCopy}
              onCopyPlain={onCopyPlain}
              onDownload={onDownload}
              onRegenerate={onRegenerate}
              onStop={onStop}
            />
          ) : null}
        </div>
      </header>

      <div className="px-5 py-5">
        {hasOutput ? (
          view === 'source' ? (
            <pre className="rise overflow-x-auto whitespace-pre rounded-control border border-line bg-bg-sunken p-4 font-mono text-[0.875rem] leading-6 text-ink">
              {source}
            </pre>
          ) : (
            <MarkdownView source={source} className="rise" />
          )
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-panel border border-line-subtle bg-bg-sunken px-6 py-10 text-center">
            <Icon name="studio" size={20} className="text-ink-faint" />
            <p className="max-w-[44ch] text-balance text-body text-ink-muted">
              {t('studio.result.empty')}
            </p>
          </div>
        )}
      </div>

      {hasOutput || recordId ? (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-subtle px-5 py-3">
          <MetaRow values={meta} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {feedback ? (
              <span
                role={feedback.kind === 'error' ? 'alert' : 'status'}
                className={cn(
                  'text-caption',
                  feedback.kind === 'error' ? 'text-danger' : 'text-success',
                )}
              >
                {feedback.text}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              icon="bookmark"
              aria-pressed={favorite}
              disabled={!canRate || metaBusy}
              onClick={onFavorite}
              className={favorite ? 'text-accent' : undefined}
            >
              {favorite
                ? t('studio.actions.unfavorite')
                : t('studio.actions.favorite')}
            </Button>
            <Rating
              value={rating}
              onChange={onRating}
              disabled={!canRate || metaBusy}
            />
          </div>
        </footer>
      ) : null}

      {showSaved && recordId ? (
        <p className="flex flex-wrap items-center gap-2 border-t border-line-subtle bg-tint-green px-5 py-2.5 text-caption text-success">
          <Icon name="check" size={14} />
          <span>{t('studio.saved')}</span>
          <Link
            href="/library"
            className="text-accent underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-hover"
          >
            {t('studio.saved.libraryLink')}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
