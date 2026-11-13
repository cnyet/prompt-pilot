/**
 * 本地检查 R101-R108（PRODUCT FR-5 / NFR-3）。
 *
 * 纯函数、零网络、零 token：只做确定性字符串匹配，不调用模型，不读写存储。
 * 空输入不产生问题；结果最多 50 条，按 error → warn → info、同级别按
 * span 起点排序。文案只给字典键，界面层用 `t(key, params)` 取中文。
 */
import type { MessageKey } from '@/lib/i18n/zh'
import {
  BOUNDARY_HINTS,
  CONTRADICTION_PAIRS,
  FORMAT_HINTS,
  FUZZY_WORDS,
  INJECTION_PATTERNS,
  MAX_CONSTRAINT_PATTERN,
  MIN_CONSTRAINT_PATTERN,
  REQUIREMENT_MIN_LENGTH,
  REQUIREMENT_SPLIT_PATTERN,
  ROLE_HINTS,
  normalizeRequirement,
} from './check-lexicons'

export type CheckLevel = 'error' | 'warn' | 'info'

export type CheckRuleId =
  | 'R101'
  | 'R102'
  | 'R103'
  | 'R104'
  | 'R105'
  | 'R106'
  | 'R107'
  | 'R108'

export interface CheckIssue {
  id: string
  ruleId: CheckRuleId
  level: CheckLevel
  span: { start: number; end: number }
  messageKey: MessageKey
  messageParams?: Record<string, string | number>
  reasonKey: MessageKey
  suggestionKey: MessageKey | null
  fixable: boolean
}

const LEVEL_RANK: Record<CheckLevel, number> = { error: 0, warn: 1, info: 2 }
const MAX_ISSUES = 50
const MIN_PROMPT_LENGTH = 40
const MAX_PROMPT_LENGTH = 12000

type IssueDraft = Omit<CheckIssue, 'id'>

interface NumericConstraint {
  value: number
  unit: string
  start: number
  end: number
  text: string
}

/**
 * 本地检查入口。`durationMs` 是本次执行的实测耗时，便于界面与测试核对
 * NFR-3（P95 < 50ms）。
 */
export function checkPrompt(source: string): {
  issues: CheckIssue[]
  durationMs: number
} {
  const startedAt = performance.now()
  const trimmedLength = source.trim().length
  if (trimmedLength === 0) {
    return { issues: [], durationMs: performance.now() - startedAt }
  }

  const drafts: IssueDraft[] = [
    ...collectFuzzyWords(source),
    ...collectContradictions(source),
    ...collectMissingFormat(source),
    ...collectMissingRole(source),
    ...collectMissingBoundary(source),
    ...collectInjectionRisks(source),
    ...collectRepeatedRequirements(source),
    ...collectLengthIssue(source, trimmedLength),
  ]

  const issues = assignIds(drafts)
  issues.sort(compareIssues)
  return {
    issues: issues.slice(0, MAX_ISSUES),
    durationMs: performance.now() - startedAt,
  }
}

/** R101：每个模糊词各报一条，span 覆盖匹配词。 */
function collectFuzzyWords(source: string): IssueDraft[] {
  const issues: IssueDraft[] = []
  for (const word of FUZZY_WORDS) {
    let from = 0
    for (;;) {
      const at = source.indexOf(word, from)
      if (at === -1) break
      issues.push({
        ruleId: 'R101',
        level: 'warn',
        span: { start: at, end: at + word.length },
        messageKey: 'check.r101.message',
        messageParams: { term: word },
        reasonKey: 'check.r101.reason',
        suggestionKey: 'check.r101.suggestion',
        fixable: true,
      })
      from = at + word.length
    }
  }
  return issues
}

/** R102：数值下限高于同单位上限，或互斥概念对同时出现。 */
function collectContradictions(source: string): IssueDraft[] {
  const issues: IssueDraft[] = []
  const lowerBounds = collectNumericConstraints(source, MIN_CONSTRAINT_PATTERN)
  const upperBounds = collectNumericConstraints(source, MAX_CONSTRAINT_PATTERN)

  for (const lower of lowerBounds) {
    for (const upper of upperBounds) {
      if (lower.unit !== upper.unit || lower.value <= upper.value) continue
      issues.push({
        ruleId: 'R102',
        level: 'error',
        span: {
          start: Math.min(lower.start, upper.start),
          end: Math.max(lower.end, upper.end),
        },
        messageKey: 'check.r102.message',
        messageParams: { a: lower.text, b: upper.text },
        reasonKey: 'check.r102.reason',
        suggestionKey: 'check.r102.suggestion',
        fixable: true,
      })
    }
  }

  for (const pair of CONTRADICTION_PAIRS) {
    const first = source.indexOf(pair.a)
    const second = source.indexOf(pair.b)
    if (first === -1 || second === -1) continue
    issues.push({
      ruleId: 'R102',
      level: 'error',
      span: {
        start: Math.min(first, second),
        end: Math.max(first + pair.a.length, second + pair.b.length),
      },
      messageKey: 'check.r102.message',
      messageParams: { a: pair.a, b: pair.b },
      reasonKey: 'check.r102.reason',
      suggestionKey: 'check.r102.suggestion',
      fixable: true,
    })
  }

  return issues
}

function collectNumericConstraints(
  source: string,
  pattern: RegExp,
): NumericConstraint[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const matcher = new RegExp(pattern.source, flags)
  const constraints: NumericConstraint[] = []

  for (const match of source.matchAll(matcher)) {
    const value = Number.parseFloat(match[1] ?? '')
    if (!Number.isFinite(value)) continue
    const start = match.index ?? 0
    constraints.push({
      value,
      unit: (match[2] ?? '').toLowerCase(),
      start,
      end: start + (match[0] ?? '').length,
      text: (match[0] ?? '').trim(),
    })
  }

  return constraints
}

/** R103、R104、R105：缺失类规则统一用 span {0,0}。 */
function missingHintIssue(
  ruleId: CheckRuleId,
  messageKey: MessageKey,
  reasonKey: MessageKey,
  suggestionKey: MessageKey,
): IssueDraft {
  return {
    ruleId,
    level: 'info',
    span: { start: 0, end: 0 },
    messageKey,
    reasonKey,
    suggestionKey,
    fixable: true,
  }
}

function collectMissingFormat(source: string): IssueDraft[] {
  if (containsAny(source, FORMAT_HINTS)) return []
  return [
    missingHintIssue(
      'R103',
      'check.r103.message',
      'check.r103.reason',
      'check.r103.suggestion',
    ),
  ]
}

function collectMissingRole(source: string): IssueDraft[] {
  if (containsAny(source, ROLE_HINTS)) return []
  return [
    missingHintIssue(
      'R104',
      'check.r104.message',
      'check.r104.reason',
      'check.r104.suggestion',
    ),
  ]
}

function collectMissingBoundary(source: string): IssueDraft[] {
  if (containsAny(source, BOUNDARY_HINTS)) return []
  return [
    missingHintIssue(
      'R105',
      'check.r105.message',
      'check.r105.reason',
      'check.r105.suggestion',
    ),
  ]
}

/** R106：每个注入模式取第一处匹配，重叠片段只保留最早的一条。 */
function collectInjectionRisks(source: string): IssueDraft[] {
  const matches: Array<{ start: number; end: number }> = []
  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.exec(source)
    if (match === null || match.index === undefined) continue
    matches.push({ start: match.index, end: match.index + (match[0] ?? '').length })
  }

  matches.sort((left, right) => left.start - right.start || right.end - left.end)
  const kept: Array<{ start: number; end: number }> = []
  for (const span of matches) {
    const overlaps = kept.some(
      (existing) => span.start < existing.end && existing.start < span.end,
    )
    if (!overlaps) kept.push(span)
  }

  return kept.map((span) => ({
    ruleId: 'R106',
    level: 'error',
    span,
    messageKey: 'check.r106.message',
    reasonKey: 'check.r106.reason',
    suggestionKey: null,
    fixable: false,
  }))
}

/** R107：同一要求第二次及以后出现时各报一条，span 指向该次出现。 */
function collectRepeatedRequirements(source: string): IssueDraft[] {
  const issues: IssueDraft[] = []
  const seen = new Set<string>()
  const matcher = new RegExp(REQUIREMENT_SPLIT_PATTERN.source, 'g')

  for (const match of source.matchAll(matcher)) {
    const raw = match[0] ?? ''
    const leadingWhitespace = raw.length - raw.trimStart().length
    const text = raw.trim()
    const normalized = normalizeRequirement(text)
    if (normalized.length < REQUIREMENT_MIN_LENGTH) continue

    if (!seen.has(normalized)) {
      seen.add(normalized)
      continue
    }

    const start = (match.index ?? 0) + leadingWhitespace
    issues.push({
      ruleId: 'R107',
      level: 'warn',
      span: { start, end: start + text.length },
      messageKey: 'check.r107.message',
      reasonKey: 'check.r107.reason',
      suggestionKey: null,
      fixable: false,
    })
  }

  return issues
}

/** R108：少于 40 字或超过 12000 字。 */
function collectLengthIssue(source: string, length: number): IssueDraft[] {
  if (length >= MIN_PROMPT_LENGTH && length <= MAX_PROMPT_LENGTH) return []
  return [
    {
      ruleId: 'R108',
      level: 'warn',
      span: { start: 0, end: source.length },
      messageKey: 'check.r108.message',
      messageParams: { length },
      reasonKey: 'check.r108.reason',
      suggestionKey: null,
      fixable: false,
    },
  ]
}

function containsAny(source: string, hints: readonly string[]): boolean {
  const lower = source.toLowerCase()
  return hints.some((hint) => lower.includes(hint))
}

/** `id` 为规则内 1 起序号，保证唯一且与规则对应。 */
function assignIds(drafts: IssueDraft[]): CheckIssue[] {
  const counters = new Map<CheckRuleId, number>()
  return drafts.map((draft) => {
    const next = (counters.get(draft.ruleId) ?? 0) + 1
    counters.set(draft.ruleId, next)
    return { ...draft, id: `${draft.ruleId}-${next}` }
  })
}

function compareIssues(left: CheckIssue, right: CheckIssue): number {
  const byLevel = LEVEL_RANK[left.level] - LEVEL_RANK[right.level]
  if (byLevel !== 0) return byLevel
  return left.span.start - right.span.start
}
