'use client'

import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { Rating } from '@/components/ui/Rating'
import { t } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import type { IterationDto, ProcessMode, TargetType } from './api'
import { ChangeNotes } from './ChangeNotes'
import { CheckPanel, type RepairIssueInput } from './CheckPanel'
import { ContinueBar } from './ContinueBar'
import { IterationCompare } from './IterationCompare'
import { MarkdownView } from './MarkdownView'
import { MetaRow, type MetaValues } from './MetaRow'
import { ResultActions } from './ResultActions'
import { SaveTemplateForm } from './SaveTemplateForm'
import { isRequestActive, type StreamPhase } from './stream-reducer'

type ResultView = 'rendered' | 'source' | 'original' | 'compare'

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
  /** 当前记录的模式、原始输入与迭代时间线；详情未到达时由工作台兜底。 */
  mode: ProcessMode
  targetType: TargetType
  sourceInput: string
  iterations: IterationDto[]
  notes: string[]
  continueAvailable: boolean
  repairAvailable: boolean
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
  onContinue: (instruction: string) => void
  onRepair: (issues: RepairIssueInput[]) => void
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
 * 视图：渲染 / 源码 / 原文 / 对比原文。原文永远保留记录 sourceInput；
 * 对比只在优化记录且至少两轮迭代时出现。检查按需展开，正文变化即卸载。
 * 继续优化与存模板常驻结果下方；未知元信息显示「—」。
 */
export function ResultPanel({
  source,
  phase,
  settling,
  meta,
  recordId,
  mode,
  targetType,
  sourceInput,
  iterations,
  notes,
  continueAvailable,
  repairAvailable,
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
  onContinue,
  onRepair,
}: ResultPanelProps): ReactElement {
  const [view, setView] = useState<ResultView>('rendered')
  const active = isRequestActive(phase)
  const hasOutput = source.length > 0
  const status = statusText(phase, settling)
  const failed = phase === 'failed'

  const showOriginal = recordId !== null && sourceInput.trim().length > 0
  const showCompare = mode === 'optimize' && iterations.length >= 2
  const effectiveView: ResultView =
    (view === 'original' && !showOriginal) ||
    (view === 'compare' && !showCompare)
      ? 'rendered'
      : view

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
              className="flex flex-wrap items-center gap-1"
            >
              <Chip
                selected={effectiveView === 'rendered'}
                aria-pressed={effectiveView === 'rendered'}
                onClick={() => setView('rendered')}
              >
                {t('studio.result.view.rendered')}
              </Chip>
              <Chip
                selected={effectiveView === 'source'}
                aria-pressed={effectiveView === 'source'}
                onClick={() => setView('source')}
              >
                {t('studio.result.view.source')}
              </Chip>
              {showOriginal ? (
                <Chip
                  selected={effectiveView === 'original'}
                  aria-pressed={effectiveView === 'original'}
                  onClick={() => setView('original')}
                >
                  {t('studio.result.view.original')}
                </Chip>
              ) : null}
              {showCompare ? (
                <Chip
                  selected={effectiveView === 'compare'}
                  aria-pressed={effectiveView === 'compare'}
                  onClick={() => setView('compare')}
                >
                  {t('studio.result.view.compare')}
                </Chip>
              ) : null}
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
          <>
            {effectiveView === 'rendered' ? (
              <MarkdownView source={source} className="rise" />
            ) : effectiveView === 'source' ? (
              <pre className="rise overflow-x-auto whitespace-pre rounded-control border border-line bg-bg-sunken p-4 font-mono text-[0.875rem] leading-6 text-ink">
                {source}
              </pre>
            ) : effectiveView === 'original' ? (
              <div className="rise max-w-[68ch]">
                <p className="text-caption text-ink-faint">
                  {t('studio.result.original.caption')}
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-control border border-line bg-bg-sunken p-4 font-mono text-[0.875rem] leading-6 text-ink">
                  {sourceInput}
                </pre>
              </div>
            ) : (
              <IterationCompare
                key={`${iterations.length}-${iterations.at(-1)?.id ?? 'none'}`}
                iterations={iterations}
                className="rise"
              />
            )}
            <ChangeNotes notes={notes} />
          </>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-panel border border-line-subtle bg-bg-sunken px-6 py-10 text-center">
            <Icon name="studio" size={20} className="text-ink-faint" />
            <p className="max-w-[44ch] text-balance text-body text-ink-muted">
              {t('studio.result.empty')}
            </p>
          </div>
        )}
      </div>

      {hasOutput ? (
        <CheckPanel
          key={source}
          source={source}
          recordId={recordId}
          busy={active}
          repairAvailable={repairAvailable}
          onRepair={onRepair}
        />
      ) : null}

      {recordId && hasOutput ? (
        <ContinueBar
          busy={active}
          available={continueAvailable}
          onContinue={onContinue}
        />
      ) : null}

      {recordId && hasOutput ? (
        <SaveTemplateForm
          source={source}
          targetType={targetType}
          mode={mode}
          disabled={active}
        />
      ) : null}

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
