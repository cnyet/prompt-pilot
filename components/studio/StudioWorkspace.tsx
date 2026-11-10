'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'
import type { LintIssue, LintLevel } from '@/lib/engine/lint/engine'
import type { CommandType } from '@/lib/engine/doc'
import { renderMarkdownDocument } from '@/lib/engine/render'
import { buildSchemaFromFields } from '@/lib/engine/paths'
import { mergeAssumptions } from '@/lib/engine/assumptions'
import { cn } from '@/lib/utils'
import { AssumptionChips } from './AssumptionChips'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import {
  LINT_LEVEL_TEXT_CLASS,
  buildIssueExcerpt,
  formatIssueLocation,
  issueField,
  issueIgnoreKey,
  planAllFixes,
  planSingleFix,
  resolveIssueSelection,
  useDiagnostics,
  type FieldWrite,
  type IssueExcerpt,
} from './useDiagnostics'
import { ExportMenu } from './ExportMenu'
import { copyText } from './clipboard'
import { FieldBlock } from './FieldBlock'
import { RequirementInput } from './RequirementInput'
import { RunDrawer } from './RunDrawer'
import { ThinkingPanel } from './ThinkingPanel'
import { useGeneration } from './useGeneration'
import { modelStatusLabel, useModelStatus } from './modelStatus'
import { formatUsageCost, formatUsageTokens } from './types'

type CopyState = 'idle' | 'copied' | 'failed'

type StudioView = 'structured' | 'rendered' | 'json'

type StudioPane = 'requirement' | 'editor' | 'diagnostics'

const STUDIO_PANES: ReadonlyArray<{ id: StudioPane; label: string }> = [
  { id: 'requirement', label: '需求' },
  { id: 'editor', label: '编辑' },
  { id: 'diagnostics', label: '诊断' },
]

/** 点击诊断项后的字段定位目标，只保存定位所需的快照。 */
interface DiagnosticsFocus {
  key: string
  field: FieldKey
  level: LintLevel
  location: string
  selection: { start: number; end: number } | null
  excerpt: IssueExcerpt | null
}

const STUDIO_VIEWS: ReadonlyArray<{
  id: StudioView
  label: string
  hint: string
}> = [
  { id: 'structured', label: '结构化', hint: '⌥1' },
  { id: 'rendered', label: '渲染文本', hint: '⌥2' },
  { id: 'json', label: 'JSON', hint: '⌥3' },
]

const COMMAND_LABELS: Record<CommandType, string> = {
  'ai-write': 'AI 写入',
  'ai-partial': 'AI 部分写入',
  'user-edit': '用户编辑',
  'accept-suggestion': '采纳 AI 建议',
  patch: '补丁写入',
  'field-rewrite': '单字段重算',
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)} 毫秒`
  }
  return `${(ms / 1000).toFixed(1)} 秒`
}

/** 每次「重新开始」换一个草稿键，Run 记录按它归组。 */
function createTrialSessionKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `draft_${uuid ?? Math.random().toString(36).slice(2)}`
}

type LibrarySaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface LibrarySaveState {
  status: LibrarySaveStatus
  message: string
}

interface SavedPromptRef {
  id: string
  latestVersionNo: number | null
}

function readSavedPrompt(payload: unknown): SavedPromptRef | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const prompt = (payload as { prompt?: unknown }).prompt
  if (typeof prompt !== 'object' || prompt === null) {
    return null
  }
  const record = prompt as { id?: unknown; latestVersionNo?: unknown }
  if (typeof record.id !== 'string' || record.id.length === 0) {
    return null
  }
  return {
    id: record.id,
    latestVersionNo:
      typeof record.latestVersionNo === 'number'
        ? record.latestVersionNo
        : null,
  }
}

function readSaveError(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }
  return '保存失败，请稍后重试。'
}

export function StudioWorkspace() {
  const {
    phase,
    fields,
    scheduled,
    title,
    assumptions,
    assumptionChips,
    setAssumption,
    exportWithoutAssumptions,
    setExportWithoutAssumptions,
    durationMs,
    error,
    usage,
    reasoning,
    isBusy,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    lastCommand,
    schema,
    fieldOps,
    opBusy,
    generate,
    retryFields,
    runFieldOp,
    updateField,
    repairField,
    acceptSuggestion,
    discardSuggestion,
    undo,
    redo,
    stop,
    reset,
  } = useGeneration()

  const modelStatus = useModelStatus()
  const [mobilePane, setMobilePane] = useState<StudioPane>('editor')
  const [submitted, setSubmitted] = useState('')
  const [sessionKey, setSessionKey] = useState(createTrialSessionKey)
  // 自动试运行按轮次去重：每次完整生成或重新开始都换一个轮次号。
  const [generationRound, setGenerationRound] = useState(0)
  const [autoRunStopped, setAutoRunStopped] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [view, setView] = useState<StudioView>('structured')
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [libraryPromptId, setLibraryPromptId] = useState<string | null>(null)
  const [librarySave, setLibrarySave] = useState<LibrarySaveState>({
    status: 'idle',
    message: '',
  })
  const autoBaselineRef = useRef(false)
  const librarySavingRef = useRef(false)
  const libraryRequestRef = useRef(0)
  const previousPhaseRef = useRef(phase)
  const pendingEditorFocusRef = useRef(false)

  const {
    issues: diagnosticsIssues,
    groups: diagnosticsGroups,
    summary: diagnosticsSummary,
    ignoredCount,
    ignoreIssue,
    restoreIgnored,
  } = useDiagnostics(schema)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true)
  const [diagnosticsFocus, setDiagnosticsFocus] =
    useState<DiagnosticsFocus | null>(null)
  const [fixNotice, setFixNotice] = useState<string | null>(null)
  const fieldWrapperRefs = useRef<
    Partial<Record<FieldKey, HTMLDivElement | null>>
  >({})
  const fixNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dirtyFields = useMemo(() => {
    const dirty = new Set<FieldKey>()
    for (const field of FIELD_KEYS) {
      if (fields[field].dirty) {
        dirty.add(field)
      }
    }
    return dirty
  }, [fields])

  const fixableCount = useMemo(
    () =>
      diagnosticsIssues.filter((issue) => {
        const field = issueField(issue)
        return issue.fixable && field !== null && !dirtyFields.has(field)
      }).length,
    [diagnosticsIssues, dirtyFields],
  )

  const skippedIssueCount = useMemo(
    () =>
      diagnosticsIssues.filter((issue) => {
        const field = issueField(issue)
        return issue.fixable && field !== null && dirtyFields.has(field)
      }).length,
    [diagnosticsIssues, dirtyFields],
  )

  const flashFixNotice = useCallback((message: string) => {
    setFixNotice(message)
    if (fixNoticeTimerRef.current) {
      clearTimeout(fixNoticeTimerRef.current)
    }
    fixNoticeTimerRef.current = setTimeout(() => {
      setFixNotice(null)
      fixNoticeTimerRef.current = null
    }, 2600)
  }, [])

  // 「停止生成」也是本轮自动试运行的取消信号：停下来就不再自动跑。
  const handleStop = useCallback(() => {
    setAutoRunStopped(true)
    stop()
  }, [stop])

  const applyWrites = useCallback(
    (writes: readonly FieldWrite[]) => {
      for (const write of writes) {
        // 修复写入与用户编辑是两种语义：修复不置 dirty，否则下一次
        // 一键修复会把自己刚修过的字段当成手改字段跳过。
        if (write.kind === 'repair') {
          repairField(write.field, write.text)
        } else {
          updateField(write.field, write.text)
        }
      }
    },
    [updateField, repairField],
  )

  const handleSelectIssue = useCallback(
    (issue: LintIssue) => {
      const field = issueField(issue)
      if (field === null) {
        setDiagnosticsFocus(null)
        flashFixNotice('这条问题不在八个可编辑字段内，无法定位')
        return
      }
      const fieldText = fields[field].text
      setView('structured')
      // 窄屏下诊断与编辑是互斥面板，点问题后必须把编辑面板切回来，
      // 否则定位逻辑会滚动到一个被 CSS 隐藏的 textarea。
      setMobilePane('editor')
      setDiagnosticsFocus({
        key: issueIgnoreKey(issue),
        field,
        level: issue.level,
        location: formatIssueLocation(issue, fieldText),
        selection: resolveIssueSelection(issue, fieldText),
        excerpt: buildIssueExcerpt(issue, fieldText),
      })
    },
    [fields, flashFixNotice],
  )

  const handleFixIssue = useCallback(
    (issue: LintIssue, options?: { confirmed?: boolean }) => {
      if (isBusy || opBusy) {
        return
      }
      const plan = planSingleFix(schema, issue, dirtyFields)
      if (plan.kind === 'nothing') {
        flashFixNotice('这条问题没有可自动写入的内容，需要手动处理')
        return
      }
      if (plan.kind === 'needs-confirmation' && options?.confirmed !== true) {
        flashFixNotice('目标字段被手改过，先确认再修复')
        return
      }
      applyWrites(plan.writes)
      flashFixNotice(`已修复 ${issue.ruleId}`)
    },
    [
      isBusy,
      opBusy,
      schema,
      dirtyFields,
      applyWrites,
      flashFixNotice,
    ],
  )

  const handleFixAll = useCallback(() => {
    if (isBusy || opBusy) {
      return
    }
    const plan = planAllFixes(schema, diagnosticsIssues, dirtyFields)
    if (plan.writes.length === 0) {
      flashFixNotice(
        plan.skippedFields.length > 0
          ? '可自动修复的问题都在手改字段里，已跳过'
          : '没有可自动修复的问题',
      )
      return
    }
    applyWrites(plan.writes)
    const skippedText =
      plan.skippedFields.length > 0
        ? `，跳过 ${plan.skippedFields.length} 个手改字段`
        : ''
    flashFixNotice(
      `已修复 ${plan.fixedIssueKeys.length} 条问题${skippedText}`,
    )
  }, [
    isBusy,
    opBusy,
    schema,
    diagnosticsIssues,
    dirtyFields,
    applyWrites,
    flashFixNotice,
  ])

  const handleIgnoreIssue = useCallback(
    (issue: LintIssue) => {
      ignoreIssue(issue)
      setDiagnosticsFocus((previous) =>
        previous?.key === issueIgnoreKey(issue) ? null : previous,
      )
      flashFixNotice('已忽略这条问题，可在面板底部恢复')
    },
    [ignoreIssue, flashFixNotice],
  )

  // 问题消失（修好、被忽略或被改写）后收起字段定位条。
  useEffect(() => {
    if (diagnosticsFocus === null) {
      return
    }
    const stillVisible = diagnosticsIssues.some(
      (issue) => issueIgnoreKey(issue) === diagnosticsFocus.key,
    )
    if (!stillVisible) {
      setDiagnosticsFocus(null)
    }
  }, [diagnosticsIssues, diagnosticsFocus])

  // 视图切到结构化后再滚动与选中，保证目标 textarea 已经挂载。
  useEffect(() => {
    if (diagnosticsFocus === null || view !== 'structured') {
      return
    }
    const wrapper = fieldWrapperRefs.current[diagnosticsFocus.field]
    if (!wrapper || !wrapper.isConnected) {
      return
    }
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    wrapper.scrollIntoView({
      block: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
    if (diagnosticsFocus.selection === null) {
      return
    }
    const textarea = wrapper.querySelector('textarea')
    if (!textarea) {
      return
    }
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(
      diagnosticsFocus.selection.start,
      diagnosticsFocus.selection.end,
    )
  }, [diagnosticsFocus, view])

  // 空态输入框在生成开始后会卸载，焦点会掉回 body。把焦点交给第一个
  // 字段编辑器，键盘用户可以立即继续编辑，不必从导航重新 Tab 一遍。
  useEffect(() => {
    if (phase === 'idle') {
      previousPhaseRef.current = phase
      pendingEditorFocusRef.current = false
      return
    }
    if (previousPhaseRef.current === 'idle') {
      pendingEditorFocusRef.current = true
    }
    previousPhaseRef.current = phase
    if (!pendingEditorFocusRef.current) {
      return
    }
    const firstField = FIELD_KEYS[0]
    if (firstField === undefined) {
      return
    }
    const wrapper = fieldWrapperRefs.current[firstField]
    const editor = wrapper?.querySelector('textarea')
    if (!(editor instanceof HTMLTextAreaElement)) {
      return
    }
    pendingEditorFocusRef.current = false
    const active = document.activeElement
    if (active !== null && active !== document.body) {
      return
    }
    editor.focus()
  }, [phase, fields])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
      if (fixNoticeTimerRef.current) {
        clearTimeout(fixNoticeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleViewKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
        return
      }
      const target =
        event.key === '1'
          ? 'structured'
          : event.key === '2'
            ? 'rendered'
            : event.key === '3'
              ? 'json'
              : null
      if (target === null) {
        return
      }
      event.preventDefault()
      setView(target)
    }
    window.addEventListener('keydown', handleViewKey)
    return () => window.removeEventListener('keydown', handleViewKey)
  }, [])

  useEffect(() => {
    if (phase === 'idle') {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (phase === 'streaming') {
          event.preventDefault()
          handleStop()
        }
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') {
        return
      }
      // 输入框里的撤销也走应用历史，避免原生撤销与文档状态各退一步。
      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, handleStop, undo, redo])

  const handleSubmit = useCallback(
    (input: string) => {
      setSubmitted(input)
      setCopyState('idle')
      setMobilePane('editor')
      // 新的一次完整生成：换轮次并解除上一轮的停止标记。
      setGenerationRound((round) => round + 1)
      setAutoRunStopped(false)
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
    setSessionKey(createTrialSessionKey())
    setCopyState('idle')
    setDiagnosticsFocus(null)
    setFixNotice(null)
    setMobilePane('editor')
    pendingEditorFocusRef.current = false
    autoBaselineRef.current = false
    librarySavingRef.current = false
    libraryRequestRef.current += 1
    setLibraryPromptId(null)
    setLibrarySave({ status: 'idle', message: '' })
    // 重新开始后换一个轮次，试运行区据此重置自动触发标记。
    setGenerationRound((round) => round + 1)
    setAutoRunStopped(false)
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

  // 存库用当前已提交的字段，不用流式 pending：pending 不是可保存状态。
  const buildLibrarySchema = useCallback(() => {
    const fieldTexts: Partial<Record<FieldKey, string>> = {}
    for (const field of FIELD_KEYS) {
      fieldTexts[field] = fields[field].text
    }
    return buildSchemaFromFields(fieldTexts, {
      title: title || submitted || '未命名提示词',
      taskType: schema.meta.taskType,
      ...(schema.meta.templateId !== undefined
        ? { templateId: schema.meta.templateId }
        : {}),
      assumptions: mergeAssumptions(assumptions, assumptionChips),
    })
  }, [fields, title, submitted, schema, assumptions, assumptionChips])

  const createBaselineV0 = useCallback(async (): Promise<void> => {
    if (librarySavingRef.current) {
      return
    }
    const sourceInput = submitted.trim()
    const hasContent = FIELD_KEYS.some(
      (field) => fields[field].text.trim().length > 0,
    )
    if (sourceInput.length === 0 || !hasContent) {
      return
    }
    librarySavingRef.current = true
    const requestId = libraryRequestRef.current + 1
    libraryRequestRef.current = requestId
    setLibrarySave({
      status: 'saving',
      message: '正在保存基线 v0',
    })
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || undefined,
          sourceInput,
          schema: buildLibrarySchema(),
        }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(readSaveError(payload))
      }
      const saved = readSavedPrompt(payload)
      if (!saved) {
        throw new Error('保存成功但返回数据不完整。')
      }
      if (libraryRequestRef.current !== requestId) {
        return
      }
      setLibraryPromptId(saved.id)
      setLibrarySave({
        status: 'saved',
        message: '已保存为基线 v0',
      })
    } catch (error) {
      if (libraryRequestRef.current === requestId) {
        setLibrarySave({
          status: 'error',
          message: error instanceof Error ? error.message : '保存基线失败。',
        })
      }
    } finally {
      if (libraryRequestRef.current === requestId) {
        librarySavingRef.current = false
      }
    }
  }, [submitted, title, fields, buildLibrarySchema])

  const saveNewVersion = useCallback(async (): Promise<void> => {
    if (librarySavingRef.current) {
      return
    }
    if (libraryPromptId === null) {
      await createBaselineV0()
      return
    }
    const hasContent = FIELD_KEYS.some(
      (field) => fields[field].text.trim().length > 0,
    )
    if (!hasContent) {
      return
    }
    librarySavingRef.current = true
    const requestId = libraryRequestRef.current + 1
    libraryRequestRef.current = requestId
    setLibrarySave({
      status: 'saving',
      message: '正在保存新版本',
    })
    try {
      const origin = dirtyFields.size > 0 ? 'human_edited' : 'ai_generated'
      const response = await fetch(
        `/api/prompts/${encodeURIComponent(libraryPromptId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: {
              schema: buildLibrarySchema(),
              origin,
              changeSummary:
                dirtyFields.size > 0
                  ? '保存前手动修改过字段'
                  : '保存当前生成结果',
            },
          }),
        },
      )
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(readSaveError(payload))
      }
      const saved = readSavedPrompt(payload)
      if (!saved) {
        throw new Error('保存成功但返回数据不完整。')
      }
      if (libraryRequestRef.current !== requestId) {
        return
      }
      setLibrarySave({
        status: 'saved',
        message:
          saved.latestVersionNo === null
            ? '已保存新版本'
            : `已保存为 v${saved.latestVersionNo}`,
      })
    } catch (error) {
      if (libraryRequestRef.current === requestId) {
        setLibrarySave({
          status: 'error',
          message: error instanceof Error ? error.message : '保存新版本失败。',
        })
      }
    } finally {
      if (libraryRequestRef.current === requestId) {
        librarySavingRef.current = false
      }
    }
  }, [libraryPromptId, fields, dirtyFields, buildLibrarySchema, createBaselineV0])

  // ⌘S / Ctrl+S 保存版本：设计稿的键盘表里承诺过，按钮与保存逻辑复用同一条。
  useEffect(() => {
    if (phase === 'idle') {
      return
    }
    const handleSaveKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
        return
      }
      event.preventDefault()
      void saveNewVersion()
    }
    window.addEventListener('keydown', handleSaveKey)
    return () => window.removeEventListener('keydown', handleSaveKey)
  }, [phase, saveNewVersion])

  // 首次生成完成后自动写入 v0；每次「重新开始」会重置这个标记。
  useEffect(() => {
    if (phase !== 'done' || autoBaselineRef.current) {
      return
    }
    if (libraryPromptId !== null || submitted.trim().length === 0) {
      return
    }
    const hasContent = FIELD_KEYS.some(
      (field) => fields[field].text.trim().length > 0,
    )
    if (!hasContent) {
      return
    }
    autoBaselineRef.current = true
    void createBaselineV0()
  }, [phase, libraryPromptId, submitted, fields, createBaselineV0])

  if (phase === 'idle') {
    return <RequirementInput onSubmit={handleSubmit} busy={isBusy} />
  }

  const filledCount = FIELD_KEYS.filter(
    (field) =>
      fields[field].text.trim().length > 0 ||
      fields[field].pendingText.trim().length > 0,
  ).length
  const suggestionCount = FIELD_KEYS.filter(
    (field) => fields[field].suggestion !== null,
  ).length
  const streamingField = FIELD_KEYS.find(
    (field) =>
      fields[field].status === 'streaming' ||
      fields[field].pendingText.length > 0,
  )
  const currentIndex = streamingField
    ? FIELD_KEYS.indexOf(streamingField) + 1
    : Math.min(filledCount + 1, FIELD_KEYS.length)
  const missingFields = FIELD_KEYS.filter(
    (field) =>
      fields[field].status === 'idle' ||
      (fields[field].status === 'failed' &&
        fields[field].text.trim().length === 0),
  )
  const hasAnyField = FIELD_KEYS.some(
    (field) => fields[field].text.trim().length > 0,
  )
  const historyText = lastCommand
    ? `上一步：${COMMAND_LABELS[lastCommand.type]}，可撤销 ${undoCount} 步${
        redoCount > 0 ? `，可重做 ${redoCount} 步` : ''
      }`
    : '暂无编辑历史'

  const displayTitle =
    title || (phase === 'streaming' ? '正在生成结构' : '生成结果')

  // 三个视图读同一份展示文本：流式中未手改的字段用 pending，其余用已提交值。
  const fieldTexts: Partial<Record<FieldKey, string>> = {}
  for (const field of FIELD_KEYS) {
    const view = fields[field]
    fieldTexts[field] = view.dirty
      ? view.text
      : view.pendingText.length > 0
        ? view.pendingText
        : view.text
  }
  const markdownPreview = renderMarkdownDocument({
    title: displayTitle,
    fields: fieldTexts,
  })
  const viewSchema = buildSchemaFromFields(fieldTexts, {
    title: displayTitle,
    taskType: schema.meta.taskType,
    templateId: schema.meta.templateId,
    assumptions: mergeAssumptions(assumptions, assumptionChips),
  })
  const jsonPreview = JSON.stringify(viewSchema, null, 2)

  let statusText = ''
  if (phase === 'streaming') {
    statusText =
      scheduled.length < FIELD_KEYS.length
        ? `正在重试第 ${currentIndex} 个字段`
        : `正在生成第 ${currentIndex} 个字段，已完成 ${filledCount} / ${FIELD_KEYS.length}`
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

  // 诊断基于已提交的文档文本；流式 pending 不属于可保存状态，不参与定位。
  const diagnosticsFieldTexts: Partial<Record<FieldKey, string>> = {}
  for (const field of FIELD_KEYS) {
    diagnosticsFieldTexts[field] = fields[field].text
  }

  const selectPane = (next: StudioPane) => {
    setMobilePane(next)
    if (next === 'diagnostics') {
      setDiagnosticsOpen(true)
    }
  }

  const collapseDiagnostics = () => {
    setDiagnosticsOpen(false)
    setMobilePane((previous) =>
      previous === 'diagnostics' ? 'editor' : previous,
    )
  }

  const handlePaneKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    const index = STUDIO_PANES.findIndex((pane) => pane.id === mobilePane)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next =
      STUDIO_PANES[(index + delta + STUDIO_PANES.length) % STUDIO_PANES.length]
    if (next === undefined) {
      return
    }
    selectPane(next.id)
    requestAnimationFrame(() => {
      document.getElementById(`studio-tab-${next.id}`)?.focus()
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-6">
      <div
        role="tablist"
        aria-label="工作台分区"
        onKeyDown={handlePaneKeyDown}
        className="sticky top-0 z-20 -mx-4 mb-4 flex gap-1 border-b border-line bg-bg px-4 py-2 min-[1440px]:hidden"
      >
        {STUDIO_PANES.map((pane) => {
          const active = mobilePane === pane.id
          return (
            <button
              key={pane.id}
              id={`studio-tab-${pane.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`studio-pane-${pane.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectPane(pane.id)}
              className={cn(
                'rounded-control border px-3 py-1.5 text-label transition-colors',
                active
                  ? 'border-line-strong bg-surface text-ink'
                  : 'border-transparent text-ink-muted hover:border-line hover:text-ink',
              )}
            >
              {pane.label}
              {pane.id === 'diagnostics' ? (
                <span className="ml-1.5 text-caption text-ink-faint tnum">
                  {diagnosticsSummary.total}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          'grid gap-6',
          diagnosticsOpen
            ? 'min-[1440px]:grid-cols-[240px_minmax(0,1fr)_320px]'
            : 'min-[1440px]:grid-cols-[240px_minmax(0,1fr)]',
        )}
      >
        <aside
          id="studio-pane-requirement"
          role="tabpanel"
          aria-labelledby="studio-tab-requirement"
          className={cn(
            'min-w-0',
            mobilePane === 'requirement'
              ? 'max-[1439px]:block'
              : 'max-[1439px]:hidden',
            'hidden min-[1440px]:block',
          )}
        >
          <div className="sticky top-6 rounded-panel border border-line bg-surface p-4">
            <p className="text-label font-medium text-ink">原始需求</p>
            <p className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-body text-ink-muted">
              {submitted}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="rounded-chip border border-line bg-bg-sunken px-2 py-1 text-caption text-ink-muted"
                title={
                  modelStatus.status === 'available'
                    ? modelStatus.modelLabel ?? '模型可用'
                    : modelStatus.reason
                }
              >
                {modelStatusLabel(modelStatus)}
              </span>
              <span className="rounded-chip border border-line bg-bg-sunken px-2 py-1 text-caption text-ink-muted tnum">
                {filledCount} / {FIELD_KEYS.length} 字段
              </span>
              {suggestionCount > 0 ? (
                <span className="rounded-chip border border-line bg-bg-sunken px-2 py-1 text-caption text-warning tnum">
                  {suggestionCount} 条建议待处理
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-caption text-ink-faint">
              流式生成过程中也可以直接改字。改动会立即写入文档，后到的 AI
              内容只会作为建议保留。
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

        <section
          id="studio-pane-editor"
          role="tabpanel"
          aria-labelledby="studio-tab-editor"
          className={cn(
            'min-w-0',
            mobilePane === 'editor' ? '' : 'max-[1439px]:hidden',
          )}
          aria-busy={isBusy}
        >
          <header className="mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption text-ink-faint">结构化提示词</p>
                <h2 className="mt-1 truncate text-h2 text-ink">{displayTitle}</h2>
                <p className="mt-1 truncate text-caption text-ink-faint">
                  需求：{submitted}
                </p>
                {librarySave.message.length > 0 ? (
                  <p
                    className={cn(
                      'mt-1 text-caption',
                      librarySave.status === 'error'
                        ? 'text-danger'
                        : 'text-ink-muted',
                    )}
                    aria-live="polite"
                  >
                    {librarySave.message}
                    {libraryPromptId !== null &&
                    librarySave.status !== 'error' ? (
                      <>
                        <span aria-hidden className="mx-1 text-ink-faint">
                          ·
                        </span>
                        <Link
                          href="/library"
                          className="text-accent hover:underline"
                        >
                          打开提示词库
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveNewVersion()}
                  disabled={
                    !hasAnyField ||
                    phase === 'streaming' ||
                    opBusy ||
                    librarySave.status === 'saving'
                  }
                  title="保存版本（⌘S）"
                  aria-keyshortcuts="Meta+S Control+S"
                  className="rounded-control bg-accent px-3 py-1.5 text-label text-bg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
                >
                  {librarySave.status === 'saving'
                    ? '正在保存'
                    : libraryPromptId === null
                      ? '保存到提示词库'
                      : '保存新版本'}
                </button>
                {!diagnosticsOpen ? (
                  <button
                    type="button"
                    onClick={() => selectPane('diagnostics')}
                    title="展开诊断面板"
                    className={cn(
                      'rounded-control border px-2.5 py-1.5 text-label transition-colors',
                      diagnosticsSummary.hasError
                        ? 'border-danger text-danger hover:bg-bg-sunken'
                        : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                    )}
                  >
                    诊断 {diagnosticsSummary.total}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  title="撤销（⌘Z）"
                  className="rounded-control border border-line px-2.5 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                >
                  撤销
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  title="重做（⇧⌘Z）"
                  className="rounded-control border border-line px-2.5 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                >
                  重做
                </button>
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
                <Link
                  href="/library"
                  className="rounded-control border border-line px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  提示词库
                </Link>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-control border border-line px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink min-[1440px]:hidden"
                >
                  重新开始
                </button>
              </div>
            </div>

            {hasAnyField && phase !== 'streaming' ? (
              <div className="flex flex-wrap items-start gap-2">
                <AssumptionChips
                  chips={assumptionChips}
                  exportWithoutAssumptions={exportWithoutAssumptions}
                  onSelect={setAssumption}
                  onToggleExport={setExportWithoutAssumptions}
                  disabled={opBusy}
                />
                <ExportMenu
                  schema={schema}
                  assumptions={assumptions}
                  omitAssumptions={exportWithoutAssumptions}
                  onOmitAssumptionsChange={setExportWithoutAssumptions}
                />
              </div>
            ) : null}
          </header>

          {hasAnyField ? (
            <RunDrawer
              prompt={markdownPreview}
              variables={viewSchema.input.variables}
              sessionKey={sessionKey}
              disabled={isBusy || opBusy}
              generationPhase={phase}
              generationRound={generationRound}
              autoRunStopped={autoRunStopped}
            />
          ) : null}

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

          {reasoning.length > 0 ? (
            <ThinkingPanel text={reasoning} streaming={isBusy} />
          ) : null}

          <div
            role="tablist"
            aria-label="中栏视图"
            className="mb-4 flex items-center gap-1 border-b border-line"
          >
            {STUDIO_VIEWS.map((item) => {
              const active = view === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(item.id)}
                  title={`${item.label}（${item.hint}）`}
                  className={cn(
                    'relative px-3 py-2 text-label transition-colors',
                    active
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {item.label}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-chip bg-accent"
                    />
                  ) : null}
                </button>
              )
            })}
          </div>

          {view === 'structured' ? (
            <div className="flex flex-col gap-3">
              {FIELD_KEYS.map((field, index) => {
                const focus =
                  diagnosticsFocus !== null &&
                  diagnosticsFocus.field === field
                    ? diagnosticsFocus
                    : null
                return (
                  <div
                    key={field}
                    ref={(node) => {
                      fieldWrapperRefs.current[field] = node
                    }}
                    className={cn(
                      'scroll-mt-6 rounded-panel',
                      focus !== null
                        ? focus.level === 'error'
                          ? 'ring-1 ring-danger'
                          : focus.level === 'warn'
                            ? 'ring-1 ring-warning'
                            : 'ring-1 ring-line-strong'
                        : '',
                    )}
                  >
                    {focus !== null ? (
                      <div className="mb-2 rounded-panel border border-line bg-bg-sunken px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 text-caption">
                            <span
                              className={cn(
                                'font-medium',
                                LINT_LEVEL_TEXT_CLASS[focus.level],
                              )}
                            >
                              诊断定位
                            </span>
                            <span className="text-ink-muted">
                              {' '}
                              · {focus.location}
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setDiagnosticsFocus(null)}
                            className="shrink-0 rounded-control border border-line px-1.5 py-0.5 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                          >
                            关闭
                          </button>
                        </div>
                        {focus.excerpt ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-body text-ink">
                            {focus.excerpt.before}
                            <mark
                              className={cn(
                                'bg-transparent px-0.5 font-medium underline decoration-1 underline-offset-2',
                                LINT_LEVEL_TEXT_CLASS[focus.level],
                              )}
                            >
                              {focus.excerpt.match}
                            </mark>
                            {focus.excerpt.after}
                          </p>
                        ) : (
                          <p className="mt-1 text-caption text-ink-muted">
                            这条问题没有具体文本区间，已滚动到对应字段。
                          </p>
                        )}
                      </div>
                    ) : null}
                    <FieldBlock
                      field={field}
                      index={index + 1}
                      state={fields[field]}
                      phase={phase}
                      busy={isBusy}
                      opBusy={opBusy}
                      active={fields[field].status === 'streaming'}
                      scheduled={scheduled.includes(field)}
                      opState={fieldOps[field]}
                      onRetry={() => {
                        void retryFields([field])
                      }}
                      onChange={(text) => updateField(field, text)}
                      onOp={(op) => {
                        void runFieldOp(field, op)
                      }}
                      onAcceptSuggestion={() => acceptSuggestion(field)}
                      onDiscardSuggestion={() => discardSuggestion(field)}
                    />
                  </div>
                )
              })}
            </div>
          ) : view === 'rendered' ? (
            <div className="overflow-hidden rounded-panel border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <p className="text-caption text-ink-faint">
                  按当前八字段文本渲染的 Markdown
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={!hasAnyField || phase === 'streaming'}
                  className="rounded-control border border-line px-2 py-0.5 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                >
                  {copyLabel}
                </button>
              </div>
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-body text-ink">
                {markdownPreview}
              </pre>
            </div>
          ) : (
            <div className="overflow-hidden rounded-panel border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <p className="text-caption text-ink-faint">
                  由字段文本按结构化路径解析生成的 schema
                </p>
                <span className="text-caption text-ink-faint tnum">
                  {schema.meta.title}
                </span>
              </div>
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-caption text-ink">
                {jsonPreview}
              </pre>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="text-caption text-ink-muted tnum" aria-live="polite">
                {statusText}
              </p>
              <p className="mt-1 text-caption text-ink-faint tnum">
                本次用量：{formatUsageTokens(usage)} · 金额{' '}
                {formatUsageCost(usage?.costCny)}
              </p>
              <p className="mt-1 text-caption text-ink-faint tnum">
                {historyText}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {phase === 'streaming' ? (
                <button
                  type="button"
                  onClick={handleStop}
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

        {diagnosticsOpen ? (
          <aside
            id="studio-pane-diagnostics"
            role="tabpanel"
            aria-labelledby="studio-tab-diagnostics"
            className={cn(
              'min-w-0',
              mobilePane === 'diagnostics' ? '' : 'max-[1439px]:hidden',
            )}
            aria-label="诊断"
          >
            <div className="sticky top-6">
              <DiagnosticsPanel
                groups={diagnosticsGroups}
                summary={diagnosticsSummary}
                fieldTexts={diagnosticsFieldTexts}
                dirtyFields={dirtyFields}
                ignoredCount={ignoredCount}
                fixableCount={fixableCount}
                skippedIssueCount={skippedIssueCount}
                activeIssueKey={diagnosticsFocus?.key ?? null}
                busy={isBusy || opBusy}
                notice={fixNotice}
                onSelect={handleSelectIssue}
                onFix={handleFixIssue}
                onFixAll={handleFixAll}
                onIgnore={handleIgnoreIssue}
                onRestoreIgnored={restoreIgnored}
                onCollapse={collapseDiagnostics}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
