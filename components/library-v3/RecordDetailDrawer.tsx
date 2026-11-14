'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Button, IconButton, buttonStyles } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { Rating } from '@/components/ui/Rating'
import { ChangeNotes } from '@/components/studio-v3/ChangeNotes'
import { CheckPanel, type RepairIssueInput } from '@/components/studio-v3/CheckPanel'
import { ContinueBar } from '@/components/studio-v3/ContinueBar'
import { IterationCompare } from '@/components/studio-v3/IterationCompare'
import { MarkdownView } from '@/components/studio-v3/MarkdownView'
import { MetaRow } from '@/components/studio-v3/MetaRow'
import { SaveTemplateForm } from '@/components/studio-v3/SaveTemplateForm'
import { isRequestActive } from '@/components/studio-v3/stream-reducer'
import { usePromptStream } from '@/components/studio-v3/usePromptStream'
import {
  deleteRecord,
  fetchRecordDetail,
  patchRecordMeta,
  postOptimize,
  postRepair,
  type ProcessMode,
  type RecordDetailDto,
  type RecordSummaryDto,
  type TargetType,
} from '@/components/studio-v3/api'
import { copyText } from '@/lib/clipboard'
import { downloadMarkdown } from '@/lib/download'
import { t, type MessageKey } from '@/lib/i18n/zh'
import { latestIteration } from '@/lib/library/detail'
import {
  formatRecordTime,
  isValidRecordTitle,
  toProcessMode,
  toTargetType,
} from '@/lib/library/format'
import { markdownToPlainText } from '@/lib/markdown/plain'
import { cn } from '@/lib/utils'
import { RecordTimeline } from './RecordTimeline'
import { useRecordMeta } from './useRecordMeta'

type RecordDetail = RecordDetailDto['record']
type ResultView = 'rendered' | 'source'
type Feedback = { text: string; kind: 'status' | 'error' }

const MODE_KEYS: Record<ProcessMode, MessageKey> = {
  generate: 'library.filter.generate',
  optimize: 'library.filter.optimize',
}

const TARGET_KEYS: Record<TargetType, MessageKey> = {
  text: 'library.target.text',
  image: 'library.target.image',
  video: 'library.target.video',
}

function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export interface RecordDetailDrawerProps {
  recordId: string
  optimizeAvailable: boolean
  onClose: () => void
  onDeleted: (id: string) => void
  onMetaChanged: (record: RecordSummaryDto) => void
}

/**
 * 记录详情抽屉（FR-6.7）。
 *
 * 原生 `<dialog>` + `showModal()` 提供焦点陷阱与 Esc：桌面 560px 右滑，
 * 移动端全屏；遮罩纯色半透明，不做背景模糊。关闭时恢复触发按钮焦点。
 * 结果默认渲染 Markdown，可切源码；时间线、任意两轮对比、本地检查、
 * 存模板与行内二次确认删除都在抽屉内完成。
 */
export function RecordDetailDrawer({
  recordId,
  optimizeAvailable,
  onClose,
  onDeleted,
  onMetaChanged,
}: RecordDetailDrawerProps) {
  const [detail, setDetail] = useState<RecordDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [view, setView] = useState<ResultView>('rendered')
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [savingTitle, setSavingTitle] = useState(false)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    state: streamState,
    run: runStream,
    cancel: cancelStream,
    reset: resetStream,
  } = usePromptStream()
  const active = isRequestActive(streamState.phase)
  const busy = active || streamState.settling

  // 关闭抽屉时中断仍在进行的生成；服务端把该轮标记为已中断并保留正文。
  useEffect(
    () => () => {
      cancelStream()
      resetStream()
    },
    [cancelStream, resetStream],
  )

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
    },
    [],
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    if (!dialog.open) dialog.showModal()
    closeButtonRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    setDetail(null)
    void fetchRecordDetail(recordId)
      .then((dto) => {
        if (controller.signal.aborted) return
        setDetail(dto.record)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(
          cause instanceof Error ? cause.message : t('library.detail.error'),
        )
        setLoading(false)
      })
    return () => controller.abort()
  }, [recordId, reloadToken])

  // 流式结算后详情到达：更新抽屉正文、时间线与用量，并同步列表行。
  useEffect(() => {
    const next = streamState.detail
    if (!next) return
    setDetail(next.record)
    onMetaChanged(next.record)
  }, [streamState.detail, onMetaChanged])

  const flash = useCallback((text: string, kind: Feedback['kind'] = 'status') => {
    setFeedback({ text, kind })
    if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => {
      setFeedback(null)
      feedbackTimer.current = null
    }, 2500)
  }, [])

  const updateMetaRecord = useCallback(
    (next: RecordSummaryDto) => {
      setDetail((current) => (current ? { ...current, ...next } : current))
      onMetaChanged(next)
    },
    [onMetaChanged],
  )

  const onMetaError = useCallback(() => {
    flash(t('library.meta.saveFailed'), 'error')
  }, [flash])

  const { isPending, toggleFavorite, setRating } = useRecordMeta(
    updateMetaRecord,
    onMetaError,
  )

  function startTitleEdit() {
    if (!detail) return
    setTitleDraft(detail.title)
    setTitleError(null)
    setEditingTitle(true)
  }

  async function saveTitle() {
    if (!detail) return
    const title = titleDraft.trim()
    if (!isValidRecordTitle(title)) {
      setTitleError(t('library.rename.invalid'))
      return
    }
    setSavingTitle(true)
    setTitleError(null)
    try {
      const { record: updated } = await patchRecordMeta(detail.id, { title })
      setDetail((current) =>
        current ? { ...current, ...updated } : current,
      )
      onMetaChanged(updated)
      setEditingTitle(false)
    } catch {
      setTitleError(t('library.rename.failed'))
    } finally {
      setSavingTitle(false)
    }
  }

  async function confirmDelete() {
    if (!detail || busy) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteRecord(detail.id)
      onDeleted(detail.id)
      onClose()
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : t('library.detail.deleteFailed'),
      )
      setDeleting(false)
    }
  }

  const detailOutput = detail?.latestOutput ?? ''
  // 进行中与结算前优先显示流内正文；流结束并结算后本地详情已同步。
  const streamSource =
    streamState.draftOutput.length > 0
      ? streamState.draftOutput
      : streamState.committedOutput
  const output = streamSource.length > 0 ? streamSource : detailOutput
  const optimizeReady = optimizeAvailable && !streamState.unavailable
  const iterations = detail?.iterations ?? []
  const latest = latestIteration(iterations)
  const mode: ProcessMode = detail ? toProcessMode(detail.mode) : 'generate'
  const targetType: TargetType = detail ? toTargetType(detail.targetType) : 'text'
  const canRate =
    detail !== null &&
    !busy &&
    (detail.status === 'completed' || detail.status === 'canceled')
  const pending =
    detail !== null &&
    (isPending(detail.id, 'favorite') || isPending(detail.id, 'rating'))

  const copyMarkdown = useCallback(async () => {
    const copied = await copyText(output)
    flash(
      copied ? t('studio.actions.copied') : t('studio.actions.copyFailed'),
      copied ? 'status' : 'error',
    )
  }, [output, flash])

  const copyPlain = useCallback(async () => {
    const copied = await copyText(markdownToPlainText(output))
    flash(
      copied ? t('studio.actions.copiedPlain') : t('studio.actions.copyFailed'),
      copied ? 'status' : 'error',
    )
  }, [output, flash])

  const download = useCallback(() => {
    if (detail === null) return
    if (downloadMarkdown(output, detail.title)) {
      flash(t('studio.actions.downloaded'))
    } else {
      flash(t('studio.actions.downloadFailed'), 'error')
    }
  }, [detail, output, flash])

  const continueOptimize = useCallback(
    (instruction: string) => {
      if (!detail || !optimizeReady || busy) return
      void runStream(() =>
        postOptimize(detail.id, { instruction, requestId: createRequestId() }),
      )
    },
    [detail, optimizeReady, busy, runStream],
  )

  const repair = useCallback(
    (issues: RepairIssueInput[]) => {
      if (!detail || !optimizeReady || busy || issues.length === 0) return
      void runStream(() =>
        postRepair(detail.id, {
          issues: issues.slice(0, 20),
          requestId: createRequestId(),
        }),
      )
    },
    [detail, optimizeReady, busy, runStream],
  )

  const retryDetail = useCallback(() => {
    resetStream()
    setReloadToken((token) => token + 1)
  }, [resetStream])

  return (
    <dialog
      ref={dialogRef}
      className="library-drawer"
      aria-label={detail ? detail.title : t('library.detail.loading')}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="text-body text-ink-muted">{t('library.detail.loading')}</p>
          ) : loadError ? (
            <p className="text-body text-ink-muted">{t('library.detail.error')}</p>
          ) : detail ? (
            <>
              {editingTitle ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void saveTitle()
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setEditingTitle(false)
                          setTitleError(null)
                        }
                      }}
                      aria-label={t('library.detail.title')}
                      invalid={Boolean(titleError)}
                      disabled={savingTitle}
                      autoFocus
                      className="h-8 max-w-xs text-label"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void saveTitle()}
                      disabled={savingTitle}
                    >
                      {savingTitle
                        ? t('library.rename.saving')
                        : t('library.rename.save')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingTitle(false)
                        setTitleError(null)
                      }}
                      disabled={savingTitle}
                    >
                      {t('library.rename.cancel')}
                    </Button>
                  </div>
                  {titleError ? (
                    <p role="alert" className="text-caption text-danger">
                      {titleError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <h2 className="min-w-0 truncate font-display text-h3 font-semibold text-ink">
                    {detail.title}
                  </h2>
                  <IconButton
                    icon="studio"
                    size="sm"
                    label={t('library.rename')}
                    onClick={startTitleEdit}
                  />
                </div>
              )}

              <div
                aria-busy={pending || undefined}
                className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5"
              >
                <Chip>{t(MODE_KEYS[mode])}</Chip>
                <Chip>{t(TARGET_KEYS[targetType])}</Chip>
                <Rating
                  value={detail.rating}
                  onChange={(value) => setRating(detail, value)}
                  disabled={!canRate}
                  label={`${detail.title} ${t('rating.label')}`}
                />
                <button
                  type="button"
                  aria-label={
                    detail.favorite
                      ? t('library.unfavorite')
                      : t('library.favorite')
                  }
                  aria-pressed={detail.favorite}
                  disabled={!canRate}
                  onClick={() => toggleFavorite(detail)}
                  className={cn(
                    'inline-flex size-8 items-center justify-center rounded-control transition-colors duration-150 hover:bg-surface-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40',
                    detail.favorite ? 'text-accent' : 'text-ink-muted',
                  )}
                >
                  <Icon
                    name="bookmark"
                    size={16}
                    className={detail.favorite ? 'fill-current' : undefined}
                  />
                </button>
                <span className="text-caption text-ink-faint tabular-nums">
                  <span className="sr-only">{t('library.updatedAt')}：</span>
                  {formatRecordTime(detail.updatedAt)}
                </span>
                {pending ? (
                  <span aria-live="polite" className="sr-only">
                    {t('library.row.pending')}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className={cn(
            buttonStyles({ variant: 'ghost', size: 'sm' }),
            'size-8 shrink-0 px-0',
          )}
        >
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
        {loading ? (
          <div className="flex flex-col gap-3 px-5 py-4" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-panel border border-line bg-bg-sunken"
              />
            ))}
          </div>
        ) : loadError ? (
          <EmptyState
            icon="alert"
            title={t('library.detail.error')}
            hint={loadError}
            action={
              <Button
                variant="secondary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                {t('common.retry')}
              </Button>
            }
          />
        ) : detail ? (
          <>
            <section
              aria-label={t('library.detail.result')}
              className="px-5 py-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-label font-medium text-ink">
                    {t('library.detail.result')}
                  </h3>
                  <div
                    role="group"
                    aria-label={t('studio.result.view.label')}
                    className="flex gap-1"
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
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="copy"
                    onClick={() => void copyMarkdown()}
                    disabled={output.length === 0}
                  >
                    {t('studio.actions.copy')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="copy"
                    onClick={() => void copyPlain()}
                    disabled={output.length === 0}
                  >
                    {t('studio.actions.copyPlain')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="download"
                    onClick={download}
                    disabled={output.length === 0}
                  >
                    {t('studio.actions.download')}
                  </Button>
                </div>
              </div>

              {feedback ? (
                <p
                  role={feedback.kind === 'error' ? 'alert' : 'status'}
                  className={cn(
                    'mb-2 text-caption',
                    feedback.kind === 'error'
                      ? 'text-danger'
                      : 'text-success',
                  )}
                >
                  {feedback.text}
                </p>
              ) : null}

              {active ? (
                <p role="status" className="mb-2 text-caption text-ink-muted">
                  {t(
                    streamState.phase === 'starting'
                      ? 'studio.result.status.starting'
                      : 'studio.result.status.streaming',
                  )}
                </p>
              ) : streamState.phase === 'canceled' ? (
                <p role="status" className="mb-2 text-caption text-warning">
                  {t('studio.result.status.canceled')}
                </p>
              ) : streamState.settling ? (
                <p role="status" className="mb-2 text-caption text-ink-muted">
                  {t('studio.result.status.settling')}
                </p>
              ) : null}

              {streamState.error ? (
                <p role="alert" className="mb-2 text-caption text-danger">
                  {streamState.error.message}
                </p>
              ) : null}

              {streamState.settleFailed ? (
                <p
                  role="alert"
                  className="mb-2 flex flex-wrap items-center gap-2 text-caption text-warning"
                >
                  <span>{t('studio.result.status.settleFailed')}</span>
                  <Button variant="ghost" size="sm" onClick={retryDetail}>
                    {t('common.retry')}
                  </Button>
                </p>
              ) : null}

              {view === 'rendered' ? (
                <MarkdownView source={output} />
              ) : (
                <pre className="max-w-full overflow-x-auto whitespace-pre rounded-control border border-line bg-bg-sunken p-4 font-mono text-[0.875rem] leading-6 text-ink">
                  {output}
                </pre>
              )}

              <div className="mt-3">
                <MetaRow
                  values={{
                    modelId: latest?.modelId ?? detail.modelId,
                    latencyMs: latest?.latencyMs ?? null,
                    tokensIn: latest?.tokensIn ?? detail.tokensIn,
                    tokensOut: latest?.tokensOut ?? detail.tokensOut,
                    costCny: latest?.costCny ?? detail.costCny,
                  }}
                />
              </div>

              <ChangeNotes notes={latest?.notes ?? []} />
            </section>

            <ContinueBar
              busy={busy}
              available={optimizeReady}
              onContinue={continueOptimize}
            />

            <section className="border-t border-line-subtle px-5 py-4">
              <h3 className="text-label font-medium text-ink">
                {t('library.timeline.title')}
              </h3>
              <div className="mt-2">
                <RecordTimeline iterations={iterations} />
              </div>
            </section>

            {iterations.length > 0 ? (
              <section className="border-t border-line-subtle px-5 py-4">
                <h3 className="text-label font-medium text-ink">
                  {t('library.detail.compare')}
                </h3>
                <div className="mt-2">
                  <IterationCompare
                    iterations={iterations}
                    original={mode === 'optimize' ? detail.sourceInput : undefined}
                  />
                </div>
              </section>
            ) : null}

            <CheckPanel
              key={output}
              source={output}
              recordId={detail.id}
              busy={busy}
              repairAvailable={optimizeReady}
              onRepair={repair}
            />

            <section className="border-t border-line-subtle px-5 py-4">
              <SaveTemplateForm
                source={output}
                targetType={targetType}
                mode={mode}
                exampleInput={detail.sourceInput}
                disabled={busy}
              />
            </section>

            <section className="border-t border-line-subtle px-5 py-4">
              {deleteError ? (
                <p role="alert" className="mb-2 text-caption text-danger">
                  {deleteError}
                </p>
              ) : null}
              {busy ? (
                <p className="mb-2 text-caption text-ink-faint">
                  {t('library.detail.deleteBusy')}
                </p>
              ) : null}
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-caption text-ink-muted">
                    {t('library.detail.deleteConfirm')}
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void confirmDelete()}
                    disabled={deleting || busy}
                  >
                    {deleting
                      ? t('library.detail.deleting')
                      : t('library.detail.deleteConfirmAction')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    {t('library.detail.deleteCancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                >
                  {t('library.detail.delete')}
                </Button>
              )}
            </section>
          </>
        ) : null}
      </div>
    </dialog>
  )
}
