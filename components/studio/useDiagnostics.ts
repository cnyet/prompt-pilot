'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FIELD_KEYS,
  FIELD_LABELS,
  type FieldKey,
  type PromptSchema,
} from '@/lib/engine/schema'
import {
  applyAllFixes,
  applyFix,
  diagnose,
  type LintIssue,
  type LintLevel,
} from '@/lib/engine/lint/engine'
import {
  fieldKeyOfPath,
  findLeaf,
  normalizeLeafPath,
} from '@/lib/engine/paths'
import { renderFieldText } from '@/lib/engine/render'
import {
  applyRepair,
  applyUserEdit,
  type PromptDoc,
} from '@/lib/engine/doc'

/** 输入停顿多久后刷新诊断。与 ARCHITECTURE 6.4 的 150ms 约定一致。 */
export const DIAGNOSTICS_DEBOUNCE_MS = 150

/** 忽略列表的会话级存储键。只存在当前标签页，关闭标签页即清空。 */
export const IGNORED_STORAGE_KEY = 'pp-diagnostics-ignored'

const EMPTY_IGNORED_KEYS: ReadonlySet<string> = new Set<string>()

export interface DiagnosticsGroups {
  error: LintIssue[]
  warn: LintIssue[]
  info: LintIssue[]
}

export interface DiagnosticsSummary {
  error: number
  warn: number
  info: number
  total: number
  hasError: boolean
}

/**
 * 一条写入的语义。
 *
 * `repair` 是诊断修复：程序对当前文本做确定性修正，写回时 origin 记
 * 'patch'、不置 dirty；`edit` 保留给真正的用户编辑路径。接线方按 kind
 * 分派，不需要自己猜这次写入算不算手改。
 */
export type FieldWriteKind = 'repair' | 'edit'

/** 一次修复要写回某个字段的完整文本。 */
export interface FieldWrite {
  field: FieldKey
  text: string
  kind: FieldWriteKind
}

export interface SingleFixPlan {
  kind: 'apply' | 'needs-confirmation' | 'nothing'
  writes: FieldWrite[]
  field: FieldKey | null
  issueKey: string
}

export interface AllFixPlan {
  writes: FieldWrite[]
  /** 因用户手改而整批跳过的字段，按八字段顺序。 */
  skippedFields: FieldKey[]
  /** 真正会写回字段的问题键。 */
  fixedIssueKeys: string[]
}

export interface IssueExcerpt {
  before: string
  match: string
  after: string
}

export interface IssueSelection {
  start: number
  end: number
}

const PATH_LABELS: Readonly<Record<string, string>> = {
  'role.persona': '身份',
  'role.expertise': '专长',
  'role.stance': '视角',
  'objective.goal': '目标',
  'objective.successCriteria': '成功标准',
  'objective.nonGoals': '不追求',
  'context.background': '背景',
  'context.audience': '受众',
  'constraints.must': '必须',
  'constraints.mustNot': '禁止',
  'constraints.priority': '优先级',
  'constraints.boundaries.scopeIn': '范围内',
  'constraints.boundaries.scopeOut': '明确不做',
  'constraints.boundaries.knowledgePolicy': '知识不足时',
  'constraints.boundaries.ambiguityPolicy': '输入有歧义时',
  'output.format': '输出格式',
  'output.sections': '章节',
  'output.length': '长度',
  'output.language': '输出语言',
  'input.variables': '变量',
  'examples.items': '正例',
  'examples.negative': '反例',
  'selfCheck.checklist': '自检清单',
}

/**
 * 忽略项的稳定键。
 *
 * 刻意不包含 span 与 message：用户改字后偏移和措辞会变，但「这条规则在这个
 * 位置的建议我不接受」这件事没变。带上命中词或矛盾轴，避免同一路径下不同
 * 建议被一条忽略连带吞掉。
 */
export function issueIgnoreKey(issue: LintIssue): string {
  const detail =
    issue.data?.word ??
    issue.data?.axis ??
    issue.data?.variableName ??
    ''
  return [issue.ruleId, normalizeLeafPath(issue.path), detail].join('|')
}

/** 问题所属的八字段之一；文档级问题返回 null。 */
export function issueField(issue: LintIssue): FieldKey | null {
  return fieldKeyOfPath(issue.path)
}

export function groupIssues(
  issues: readonly LintIssue[],
): DiagnosticsGroups {
  const groups: DiagnosticsGroups = { error: [], warn: [], info: [] }
  for (const issue of issues) {
    groups[issue.level].push(issue)
  }
  return groups
}

export function summarizeIssues(
  issues: readonly LintIssue[],
): DiagnosticsSummary {
  let error = 0
  let warn = 0
  let info = 0
  for (const issue of issues) {
    switch (issue.level) {
      case 'error':
        error += 1
        break
      case 'warn':
        warn += 1
        break
      case 'info':
        info += 1
        break
    }
  }
  return {
    error,
    warn,
    info,
    total: error + warn + info,
    hasError: error > 0,
  }
}

/** 过滤掉用户本次会话忽略的问题，保持引擎原有的 error、warn、info 顺序。 */
export function visibleIssues(
  issues: readonly LintIssue[],
  ignoredKeys: ReadonlySet<string>,
): LintIssue[] {
  if (ignoredKeys.size === 0) {
    return [...issues]
  }
  return issues.filter((issue) => !ignoredKeys.has(issueIgnoreKey(issue)))
}

/**
 * 问题在面板里的位置文案：字段名加叶子名，例如「目标 · 成功标准」。
 * 文档级问题（R014 过长）统一显示「整篇文档」。
 */
export function formatIssueLocation(
  issue: LintIssue,
  fieldText?: string,
): string {
  if (issue.path === 'meta.title') {
    return '标题'
  }
  const field = issueField(issue)
  if (field === null) {
    return '整篇文档'
  }
  const leaf =
    fieldText === undefined
      ? null
      : findLeaf(field, fieldText, issue.path)
  const normalizedPath = normalizeLeafPath(issue.path)
  const subject =
    leaf?.label ??
    PATH_LABELS[normalizedPath] ??
    // 集合下标（input.variables[0]）没有对应叶子时退化到父集合的展示名。
    PATH_LABELS[normalizedPath.replace(/\[\d+\](?=\.|$)/gu, '')] ??
    issue.path
  const fieldLabel = FIELD_LABELS[field]
  return subject === fieldLabel ? fieldLabel : `${fieldLabel} · ${subject}`
}

/**
 * 把问题里的字段内相对区间换算成字段文本的绝对区间。
 *
 * `issue.span` 是相对叶子值的（见 lib/engine/lint/types.ts），而 textarea
 * 的 selectionStart 相对整段字段文本，所以必须先找到叶子起点再加偏移。
 */
export function resolveIssueSelection(
  issue: LintIssue,
  fieldText: string,
): IssueSelection | null {
  const field = issueField(issue)
  const span = issue.span
  if (field === null || span === undefined) {
    return null
  }
  const leaf = findLeaf(field, fieldText, issue.path)
  if (leaf === null) {
    return null
  }
  const start = leaf.start + Math.max(0, span[0])
  const end = leaf.start + Math.min(span[1], leaf.value.length)
  if (end <= start) {
    return null
  }
  return { start, end }
}

function compact(text: string): string {
  return text.replace(/\s+/gu, ' ')
}

/** 取命中词前后的短上下文，供字段顶部的高亮条展示。 */
export function buildIssueExcerpt(
  issue: LintIssue,
  fieldText: string,
  radius = 16,
): IssueExcerpt | null {
  const selection = resolveIssueSelection(issue, fieldText)
  if (selection === null) {
    return null
  }
  const beforeRaw = fieldText.slice(
    Math.max(0, selection.start - radius),
    selection.start,
  )
  const afterRaw = fieldText.slice(selection.end, selection.end + radius)
  return {
    before: `${selection.start > radius ? '…' : ''}${compact(beforeRaw)}`,
    match: compact(fieldText.slice(selection.start, selection.end)),
    after: `${compact(afterRaw)}${
      selection.end + radius < fieldText.length ? '…' : ''
    }`,
  }
}

/**
 * 对比修复前后的 schema，只返回渲染文本真的变化的字段。
 *
 * 这是「修复不得顺手重写无关字段」的第一道保险：即使 applyFix 因数据形态
 * 未产生变化，也不会把任何字段标脏。默认按修复写入标记，调用方若确实是在
 * 模拟用户编辑，可显式传 'edit'。
 */
export function changedFieldWrites(
  before: PromptSchema,
  after: PromptSchema,
  kind: FieldWriteKind = 'repair',
): FieldWrite[] {
  const writes: FieldWrite[] = []
  for (const field of FIELD_KEYS) {
    const beforeText = renderFieldText(before, field)
    const afterText = renderFieldText(after, field)
    if (beforeText !== afterText) {
      writes.push({ field, text: afterText, kind })
    }
  }
  return writes
}

/**
 * 按每条写入的 kind 把修复计划落回纯文档状态。
 *
 * React 层通过 useGeneration.repairField 走同一条 applyRepair 路径；这个函数
 * 让计划语义（kind）与文档写入语义（origin/dirty）在一处对齐，测试与后续
 * 接线可以复用同一套判断，不必各自记住"修复不算手改"。
 */
export function applyFieldWrites(
  doc: PromptDoc,
  writes: readonly FieldWrite[],
): PromptDoc {
  let next = doc
  for (const write of writes) {
    next =
      write.kind === 'repair'
        ? applyRepair(next, write.field, write.text)
        : applyUserEdit(next, write.field, write.text)
  }
  return next
}

/**
 * 单项修复计划。
 *
 * 目标字段被用户手改过时返回 `needs-confirmation`，调用方必须先让用户
 * 二次确认才可写回；未确认时不得改动任何字段。
 */
export function planSingleFix(
  schema: PromptSchema,
  issue: LintIssue,
  dirtyFields: ReadonlySet<FieldKey>,
): SingleFixPlan {
  const issueKey = issueIgnoreKey(issue)
  const field = issueField(issue)
  if (!issue.fixable || field === null) {
    return { kind: 'nothing', writes: [], field, issueKey }
  }
  const fixed = applyFix(schema, issue)
  const writes = changedFieldWrites(schema, fixed)
  if (writes.length === 0) {
    return { kind: 'nothing', writes, field, issueKey }
  }
  const touchesDirty = writes.some((write) => dirtyFields.has(write.field))
  return {
    kind: touchesDirty ? 'needs-confirmation' : 'apply',
    writes,
    field,
    issueKey,
  }
}

/**
 * 全部修复计划。
 *
 * 批量修复整字段跳过用户手改过的字段：这些字段里的问题留给单项修复，
 * 由用户二次确认后处理。不可修复与文档级问题不在本函数处理范围内。
 * 产出的每条 write 都带 `kind: 'repair'`，接线方据此走修复写入而不是用户编辑。
 */
export function planAllFixes(
  schema: PromptSchema,
  issues: readonly LintIssue[],
  dirtyFields: ReadonlySet<FieldKey>,
): AllFixPlan {
  const skipped = new Set<FieldKey>()
  const allowed: Array<{ issue: LintIssue; field: FieldKey }> = []

  for (const issue of issues) {
    if (!issue.fixable) {
      continue
    }
    const field = issueField(issue)
    if (field === null) {
      continue
    }
    if (dirtyFields.has(field)) {
      skipped.add(field)
      continue
    }
    allowed.push({ issue, field })
  }

  if (allowed.length === 0) {
    return {
      writes: [],
      skippedFields: FIELD_KEYS.filter((field) => skipped.has(field)),
      fixedIssueKeys: [],
    }
  }

  const fixed = applyAllFixes(
    schema,
    allowed.map((entry) => entry.issue),
  )
  // 第二道保险：即使某条修复间接触及手改字段，也不把该字段写回。
  const writes = changedFieldWrites(schema, fixed).filter(
    (write) => !dirtyFields.has(write.field),
  )
  const writtenFields = new Set(writes.map((write) => write.field))
  const fixedIssueKeys = allowed
    .filter((entry) => writtenFields.has(entry.field))
    .map((entry) => issueIgnoreKey(entry.issue))

  return {
    writes,
    skippedFields: FIELD_KEYS.filter((field) => skipped.has(field)),
    fixedIssueKeys,
  }
}

/* ------------------------------------------------------------------ */
/* 忽略列表的会话存储                                                   */
/* ------------------------------------------------------------------ */

export function parseIgnoredKeys(raw: string | null): string[] {
  if (raw === null || raw.length === 0) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    )
  } catch {
    return []
  }
}

export function serializeIgnoredKeys(keys: ReadonlySet<string>): string {
  return JSON.stringify([...keys])
}

function readStoredIgnoredKeys(): string[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    return parseIgnoredKeys(window.sessionStorage.getItem(IGNORED_STORAGE_KEY))
  } catch {
    // 隐私模式或存储被禁用时忽略持久化，内存里的忽略状态仍然可用。
    return []
  }
}

function writeStoredIgnoredKeys(keys: ReadonlySet<string>): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(
      IGNORED_STORAGE_KEY,
      serializeIgnoredKeys(keys),
    )
  } catch {
    // 写不进去不影响本次会话内的忽略。
  }
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface DiagnosticsApi {
  /** 原始诊断结果，包含已忽略项，供设置页或调试使用。 */
  allIssues: LintIssue[]
  /** 过滤掉忽略项之后的诊断结果。 */
  issues: LintIssue[]
  groups: DiagnosticsGroups
  summary: DiagnosticsSummary
  ignoredKeys: ReadonlySet<string>
  ignoredCount: number
  ignoreIssue: (issue: LintIssue) => void
  restoreIgnored: () => void
}

/**
 * 诊断派生与忽略状态。
 *
 * schema 每次变化先按 150ms 防抖，再全量运行 diagnose；忽略列表只存活在
 * 当前标签页（sessionStorage），刷新保留，关闭标签页清空。
 */
export function useDiagnostics(schema: PromptSchema): DiagnosticsApi {
  const [allIssues, setAllIssues] = useState<LintIssue[]>(() =>
    diagnose(schema),
  )
  const [ignoredKeys, setIgnoredKeys] =
    useState<ReadonlySet<string>>(EMPTY_IGNORED_KEYS)
  const [storeReady, setStoreReady] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setAllIssues(diagnose(schema))
    }, DIAGNOSTICS_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [schema])

  // 先读后写：挂载后第一轮只加载，避免用空集合覆盖已有忽略列表。
  useEffect(() => {
    const stored = readStoredIgnoredKeys()
    if (stored.length > 0) {
      setIgnoredKeys(new Set(stored))
    }
    setStoreReady(true)
  }, [])

  useEffect(() => {
    if (!storeReady) {
      return
    }
    writeStoredIgnoredKeys(ignoredKeys)
  }, [ignoredKeys, storeReady])

  const ignoreIssue = useCallback((issue: LintIssue) => {
    const key = issueIgnoreKey(issue)
    setIgnoredKeys((previous) => {
      if (previous.has(key)) {
        return previous
      }
      const next = new Set(previous)
      next.add(key)
      return next
    })
  }, [])

  const restoreIgnored = useCallback(() => {
    setIgnoredKeys(new Set())
  }, [])

  const issues = useMemo(
    () => visibleIssues(allIssues, ignoredKeys),
    [allIssues, ignoredKeys],
  )
  const groups = useMemo(() => groupIssues(issues), [issues])
  const summary = useMemo(() => summarizeIssues(issues), [issues])

  return {
    allIssues,
    issues,
    groups,
    summary,
    ignoredKeys,
    ignoredCount: ignoredKeys.size,
    ignoreIssue,
    restoreIgnored,
  }
}

/** 级别对应的文字色，面板与字段定位条共用，避免两处色值漂移。 */
export const LINT_LEVEL_TEXT_CLASS: Readonly<Record<LintLevel, string>> = {
  error: 'text-danger',
  warn: 'text-warning',
  info: 'text-ink-muted',
}
