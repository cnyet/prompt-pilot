'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { PageShell } from '@/components/ui/PageShell'
import { copyText } from '@/lib/clipboard'
import { downloadMarkdown } from '@/lib/download'
import { t } from '@/lib/i18n/zh'
import { markdownToPlainText } from '@/lib/markdown/plain'
import {
  patchAgainstConfirmed,
  queueMetaPatch,
  type MetaPatch,
} from '@/lib/ui/meta-coalesce'
import {
  patchRecordMeta,
  postGenerate,
  postOptimize,
  postRegenerate,
  postRepair,
  type ProcessMode,
  type TargetType,
} from './api'
import { BudgetNotice } from './BudgetNotice'
import type { RepairIssueInput } from './CheckPanel'
import {
  initialComposerState,
  validateComposer,
  type ComposerState,
} from './composer'
import type { MetaValues } from './MetaRow'
import { PromptComposer } from './PromptComposer'
import { canRegenerateRecord } from './regenerate-guard'
import { ResultPanel, type ResultFeedback } from './ResultPanel'
import { isRequestActive } from './stream-reducer'
import { usePromptStream } from './usePromptStream'

export interface StudioWorkspaceProps {
  /** 从模板页「用它开始」带过来的示例需求，只作生成草稿初值。 */
  initialGenerateInput?: string
  generateAvailable: boolean
  optimizeAvailable: boolean
}

function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/** 记录 DTO 的目标类型是 string；未知值按文本处理，避免模板分类非法。 */
function toTargetType(value: string): TargetType {
  return value === 'image' || value === 'video' ? value : 'text'
}

/**
 * 工作台（PRODUCT.md 核心旅程 + DESIGN.md Workspace Result Surface）。
 *
 * 输入区与结果面左右分栏；首次提交按当前模式走 `postGenerate`（生成或优化），
 * 结果区展示 `draftOutput || committedOutput`。流式进行中可停止并保留正文；
 * 详情到达后用 `detail.record` 驱动元信息、收藏与评分；重新生成追加迭代。
 * 收藏与评分乐观更新并合并补发（I1），请求失败时按已确认值回滚并提示。
 */
export function StudioWorkspace({
  initialGenerateInput = '',
  generateAvailable,
  optimizeAvailable,
}: StudioWorkspaceProps): ReactElement {
  const [composer, setComposer] = useState<ComposerState>(() =>
    initialComposerState(initialGenerateInput),
  )
  const {
    state: streamState,
    run: runStream,
    cancel: cancelStream,
    reset: resetStream,
  } = usePromptStream()
  const [favorite, setFavorite] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  // 收藏/评分乐观写合并（I1）：PATCH 在途时不原生禁用控件，避免焦点被弹到 BODY。
  // 队列记住每个字段的最新请求值，当前 PATCH 落定后如有差异补发一次；
  // confirmed 记录服务器已确认值，失败时按它回滚。
  const metaFlightRef = useRef(false)
  const metaQueueRef = useRef<MetaPatch | null>(null)
  const metaConfirmedRef = useRef<{ favorite: boolean; rating: number | null }>({
    favorite: false,
    rating: null,
  })
  const recordIdRef = useRef<string | null>(null)
  // 详情到达前用提交时的模式与目标类型兜底，避免切换 tab 后存错模板分类
  const [submittedMeta, setSubmittedMeta] = useState<{
    mode: ProcessMode
    targetType: TargetType
  } | null>(null)
  const [feedback, setFeedback] = useState<ResultFeedback | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 同步启动锁：reset 把 phase 拨回 idle 后，双击仍能靠它在同一 tick 内拦住第二次请求。
  // 用递增令牌而不是布尔，旧请求的 finally 不会误清新请求的锁。
  const requestToken = useRef(0)

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
    },
    [],
  )

  const flash = useCallback(
    (text: string, kind: ResultFeedback['kind'] = 'status') => {
      setFeedback({ text, kind })
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
      feedbackTimer.current = setTimeout(() => {
        setFeedback(null)
        feedbackTimer.current = null
      }, 2500)
    },
    [],
  )

  // 一旦流进入 starting / streaming，phase 守卫与 hook 的 controllerRef 已经接管，
  // 锁只负责覆盖 reset 之后、start 事件到达之前的那段空窗。结算拉详情不阻塞再次提交。
  useEffect(() => {
    if (streamState.phase !== 'idle') requestToken.current = 0
  }, [streamState.phase])

  const { phase, detail } = streamState
  const active = isRequestActive(phase)
  const detailRecord = detail?.record ?? null
  const recordId = streamState.recordId ?? detailRecord?.id ?? null
  recordIdRef.current = recordId
  const source =
    streamState.draftOutput.length > 0
      ? streamState.draftOutput
      : streamState.committedOutput
  const latestIteration = detailRecord?.iterations.at(-1) ?? null
  const recordMode: ProcessMode = detailRecord
    ? detailRecord.mode === 'optimize'
      ? 'optimize'
      : 'generate'
    : (submittedMeta?.mode ?? composer.mode)
  const recordTargetType: TargetType = detailRecord
    ? toTargetType(detailRecord.targetType)
    : (submittedMeta?.targetType ?? composer.generate.targetType)
  const recordSourceInput =
    detailRecord?.sourceInput ??
    (recordMode === 'optimize'
      ? composer.optimize.sourceInput
      : composer.generate.sourceInput)
  const meta: MetaValues = {
    modelId: detailRecord?.modelId ?? latestIteration?.modelId ?? null,
    latencyMs: latestIteration?.latencyMs ?? streamState.usage?.latencyMs ?? null,
    tokensIn: latestIteration?.tokensIn ?? streamState.usage?.tokensIn ?? null,
    tokensOut: latestIteration?.tokensOut ?? streamState.usage?.tokensOut ?? null,
    costCny: latestIteration?.costCny ?? streamState.usage?.costCny ?? null,
  }

  const modeUnavailable =
    composer.mode === 'generate' ? !generateAvailable : !optimizeAvailable
  const composerUnavailable = modeUnavailable || streamState.unavailable
  // 继续优化、修复与优化输入共用同一可用性：配置缺失或运行时 503 都禁用
  const optimizeReady = optimizeAvailable && !streamState.unavailable
  const canRate =
    recordId !== null && (phase === 'completed' || phase === 'canceled')
  // 重新生成只属于生成模式记录（I3），结算期间同样禁用（M11）
  const canRegenerate = canRegenerateRecord({
    recordId,
    active,
    settling: streamState.settling,
    generateAvailable,
    mode: recordMode,
  })
  const showSaved =
    recordId !== null &&
    source.trim().length > 0 &&
    (phase === 'completed' || phase === 'canceled')

  // 详情到达后同步记录级收藏与评分；乐观更新期间不会被旧详情覆盖。
  useEffect(() => {
    if (!detailRecord) return
    setFavorite(detailRecord.favorite)
    setRating(detailRecord.rating)
    metaConfirmedRef.current = {
      favorite: detailRecord.favorite,
      rating: detailRecord.rating,
    }
    setSubmittedMeta({
      mode: detailRecord.mode === 'optimize' ? 'optimize' : 'generate',
      targetType: toTargetType(detailRecord.targetType),
    })
  }, [detailRecord])

  const startRequest = useCallback(
    (request: () => Promise<Response>) => {
      if (requestToken.current !== 0) return
      const token = requestToken.current + 1
      requestToken.current = token
      void runStream(request).finally(() => {
        if (requestToken.current === token) requestToken.current = 0
      })
    },
    [runStream],
  )

  const submit = useCallback(() => {
    if (requestToken.current !== 0 || isRequestActive(streamState.phase)) return

    const unavailableForMode =
      (composer.mode === 'generate' ? !generateAvailable : !optimizeAvailable) ||
      streamState.unavailable
    const validation = validateComposer(composer, {
      unavailable: unavailableForMode,
    })
    if (!validation.valid) return

    const mode = composer.mode
    const draft = mode === 'generate' ? composer.generate : composer.optimize
    const requestId = createRequestId()
    setSubmittedMeta({ mode, targetType: draft.targetType })

    // 全新请求先清空上一条详情，避免新流首字到达前泄漏旧结果。
    resetStream()
    setFavorite(false)
    setRating(null)
    setFeedback(null)
    // 丢弃上一记录的元数据写队列与已确认值
    metaQueueRef.current = null
    metaConfirmedRef.current = { favorite: false, rating: null }

    if (mode === 'generate') {
      startRequest(() =>
        postGenerate({
          mode: 'generate',
          sourceInput: draft.sourceInput,
          targetType: draft.targetType,
          requestId,
        }),
      )
      return
    }

    const instruction =
      draft.instruction.trim().length > 0 ? draft.instruction : undefined
    startRequest(() =>
      postGenerate({
        mode: 'optimize',
        sourceInput: draft.sourceInput,
        ...(instruction ? { instruction } : {}),
        requestId,
      }),
    )
  }, [
    composer,
    generateAvailable,
    optimizeAvailable,
    resetStream,
    startRequest,
    streamState.phase,
    streamState.unavailable,
  ])

  const regenerate = useCallback(() => {
    if (
      !recordId ||
      requestToken.current !== 0 ||
      streamState.settling ||
      isRequestActive(streamState.phase) ||
      !generateAvailable ||
      recordMode !== 'generate'
    ) {
      return
    }
    startRequest(() =>
      postRegenerate(recordId, { requestId: createRequestId() }),
    )
  }, [
    recordId,
    recordMode,
    generateAvailable,
    startRequest,
    streamState.phase,
    streamState.settling,
  ])

  const stop = useCallback(() => {
    cancelStream()
  }, [cancelStream])

  // 继续优化与修复沿用当前记录，不 reset：旧正文在下一轮流式期间继续可见，
  // 首个 delta 到达后才被草稿替换。请求锁与并发守卫与重新生成一致；
  // settling 期间 hook 仍持有 controller，必须与 active 一样拒绝新请求。
  const continueOptimize = useCallback(
    (instruction: string) => {
      if (
        !recordId ||
        !optimizeReady ||
        requestToken.current !== 0 ||
        streamState.settling ||
        isRequestActive(streamState.phase)
      ) {
        return
      }
      setFeedback(null)
      startRequest(() =>
        postOptimize(recordId, {
          instruction,
          requestId: createRequestId(),
        }),
      )
    },
    [
      recordId,
      optimizeReady,
      startRequest,
      streamState.phase,
      streamState.settling,
    ],
  )

  const repair = useCallback(
    (issues: RepairIssueInput[]) => {
      if (
        !recordId ||
        !optimizeReady ||
        issues.length === 0 ||
        requestToken.current !== 0 ||
        streamState.settling ||
        isRequestActive(streamState.phase)
      ) {
        return
      }
      setFeedback(null)
      startRequest(() =>
        postRepair(recordId, {
          issues,
          requestId: createRequestId(),
        }),
      )
    },
    [
      recordId,
      optimizeReady,
      startRequest,
      streamState.phase,
      streamState.settling,
    ],
  )

  const copyMarkdown = useCallback(async () => {
    const copied = await copyText(source)
    flash(
      copied ? t('studio.actions.copied') : t('studio.actions.copyFailed'),
      copied ? 'status' : 'error',
    )
  }, [source, flash])

  const copyPlain = useCallback(async () => {
    const copied = await copyText(markdownToPlainText(source))
    flash(
      copied ? t('studio.actions.copiedPlain') : t('studio.actions.copyFailed'),
      copied ? 'status' : 'error',
    )
  }, [source, flash])

  const download = useCallback(() => {
    const title = detailRecord?.title ?? t('download.defaultTitle')
    if (downloadMarkdown(source, title)) {
      flash(t('studio.actions.downloaded'))
    } else {
      flash(t('studio.actions.downloadFailed'), 'error')
    }
  }, [source, detailRecord, flash])

  /**
   * 串行补发元数据 PATCH（I1）。单飞：一次只允许一个 PATCH 在途；
   * 队列里与已确认值相同的字段跳过；失败按已确认值回滚并清队列。
   */
  const flushMetaQueue = useCallback(async () => {
    if (metaFlightRef.current) return
    metaFlightRef.current = true
    try {
      while (metaQueueRef.current) {
        const targetId = recordIdRef.current
        if (!targetId) {
          metaQueueRef.current = null
          break
        }
        const queued = metaQueueRef.current
        metaQueueRef.current = null
        const patch = patchAgainstConfirmed(queued, metaConfirmedRef.current)
        if (!patch) continue
        try {
          const result = await patchRecordMeta(targetId, patch)
          if (recordIdRef.current === targetId) {
            metaConfirmedRef.current = {
              favorite: result.record.favorite,
              rating: result.record.rating,
            }
          }
        } catch {
          // 回滚到最后一次服务器确认的值；PATCH 失败的错误提示由反馈区呈现
          metaQueueRef.current = null
          if (recordIdRef.current === targetId) {
            setFavorite(metaConfirmedRef.current.favorite)
            setRating(metaConfirmedRef.current.rating)
            flash(t('studio.meta.saveFailed'), 'error')
          }
          break
        }
      }
    } finally {
      metaFlightRef.current = false
    }
  }, [flash])

  const toggleFavorite = useCallback(() => {
    if (!recordId || !canRate) return
    const next = !favorite
    setFavorite(next)
    metaQueueRef.current = queueMetaPatch(metaQueueRef.current, { favorite: next })
    void flushMetaQueue()
  }, [recordId, canRate, favorite, flushMetaQueue])

  const changeRating = useCallback(
    (next: number | null) => {
      if (!recordId || !canRate) return
      setRating(next)
      metaQueueRef.current = queueMetaPatch(metaQueueRef.current, { rating: next })
      void flushMetaQueue()
    },
    [recordId, canRate, flushMetaQueue],
  )

  return (
    <PageShell variant="workbench">
      <div className="mx-auto w-full max-w-[1440px]">
        <BudgetNotice />
      </div>
      <div className="mx-auto grid w-full max-w-[1440px] items-start gap-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:gap-6">
        <PromptComposer
          state={composer}
          onChange={setComposer}
          onSubmit={submit}
          onCancel={stop}
          active={active}
          unavailable={composerUnavailable}
          error={streamState.error?.message ?? null}
        />
        <ResultPanel
          source={source}
          phase={phase}
          settling={streamState.settling}
          settleFailed={streamState.settleFailed}
          meta={meta}
          recordId={recordId}
          mode={recordMode}
          targetType={recordTargetType}
          sourceInput={recordSourceInput}
          iterations={detailRecord?.iterations ?? []}
          notes={streamState.notes}
          continueAvailable={optimizeReady}
          repairAvailable={optimizeReady}
          canRegenerate={canRegenerate}
          showSaved={showSaved}
          favorite={favorite}
          rating={rating}
          canRate={canRate}
          feedback={feedback}
          onCopy={copyMarkdown}
          onCopyPlain={copyPlain}
          onDownload={download}
          onRegenerate={regenerate}
          onStop={stop}
          onFavorite={toggleFavorite}
          onRating={changeRating}
          onContinue={continueOptimize}
          onRepair={repair}
        />
      </div>
    </PageShell>
  )
}
