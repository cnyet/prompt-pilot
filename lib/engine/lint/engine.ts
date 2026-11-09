import type { PromptSchema } from '@/lib/engine/schema'
import { collectTextFields, RULES } from './rules'
import {
  type LintContext,
  type LintContextOptions,
  type LintIssue,
  type LintLevel,
  type LintRuleId,
  isLintLevel,
  lintLevelRank,
} from './types'

export { applyAllFixes, applyFix } from './fix'
export { RULES, RULE_LEVELS, RULE_TITLES } from './rules'
export type {
  ConflictAxis,
  LintContext,
  LintContextOptions,
  LintIssue,
  LintIssueData,
  LintLevel,
  LintRule,
  LintRuleId,
  LintSpan,
  LintTextField,
} from './types'

/** R014 默认阈值：超过 2000 warn，超过 4000 error */
export const DEFAULT_TOKEN_WARN_THRESHOLD = 2000
export const DEFAULT_TOKEN_ERROR_THRESHOLD = 4000

/**
 * 默认 token 估算：CJK 字符按 1 token，其余字符按 4 字符 1 token。
 *
 * 这是有意偏保守的粗算——中文场景下宁可早一点提醒用户拆分，
 * 也不要在真实 tokenizer 上超窗。需要精确值时可从 options 注入 estimateTokens。
 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) {
      cjk += 1
    } else {
      other += 1
    }
  }
  return cjk + Math.ceil(other / 4)
}

function readThreshold(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * 把 schema 里的 linter 配置与调用参数合并成一个只读上下文。
 * 调用参数优先于 schema 中的持久化配置。
 */
export function createLintContext(
  schema: PromptSchema,
  options: LintContextOptions = {},
): LintContext {
  const fields = collectTextFields(schema)
  const renderedText = fields.map((field) => field.text).join('\n')
  const suppressedRules = [
    ...(schema.linter?.suppressions ?? []),
    ...(options.suppressedRules ?? []),
  ]
  const severityOverride: Record<string, string> = {
    ...(schema.linter?.severityOverride ?? {}),
    ...(options.severityOverride ?? {}),
  }

  const tokenErrorThreshold = readThreshold(
    options.tokenErrorThreshold,
    DEFAULT_TOKEN_ERROR_THRESHOLD,
  )
  // 阈值配反时把 warn 压到 error 以下，避免出现「超过 error 却因为没超过 warn 而不报」的死角
  const tokenWarnThreshold = Math.min(
    readThreshold(options.tokenWarnThreshold, DEFAULT_TOKEN_WARN_THRESHOLD),
    tokenErrorThreshold,
  )

  return {
    suppressedRules,
    severityOverride,
    estimateTokens: options.estimateTokens ?? estimateTokens,
    renderedText,
    fields,
    tokenWarnThreshold,
    tokenErrorThreshold,
  }
}

function issueKey(issue: LintIssue): string {
  const span = issue.span === undefined ? '' : `${issue.span[0]}-${issue.span[1]}`
  return `${issue.ruleId}|${issue.path}|${span}|${issue.message}`
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareIssues(left: LintIssue, right: LintIssue): number {
  const byLevel = lintLevelRank(left.level) - lintLevelRank(right.level)
  if (byLevel !== 0) return byLevel
  const byRule = compareText(left.ruleId, right.ruleId)
  if (byRule !== 0) return byRule
  const byPath = compareText(left.path, right.path)
  if (byPath !== 0) return byPath
  return (left.span?.[0] ?? -1) - (right.span?.[0] ?? -1)
}

/**
 * 全量诊断。
 *
 * 纯函数：不修改 schema，不读时间/随机数/IO；同一输入 + 同一 options 必然得到同一结果。
 * 流程：建上下文 → 顺序跑 16 条规则 → 应用级别覆盖 → 过滤抑制 → 去重 → 按严重度排序。
 */
export function diagnose(schema: PromptSchema, options: LintContextOptions = {}): LintIssue[] {
  const ctx = createLintContext(schema, options)
  const suppressed = new Set(ctx.suppressedRules)
  const seen = new Set<string>()
  const issues: LintIssue[] = []

  for (const rule of RULES) {
    if (suppressed.has(rule.id)) continue
    for (const issue of rule.run(schema, ctx)) {
      if (suppressed.has(issue.ruleId)) continue

      const override = ctx.severityOverride[issue.ruleId]
      const level: LintLevel =
        override !== undefined && isLintLevel(override) ? override : issue.level

      const normalized: LintIssue = level === issue.level ? issue : { ...issue, level }
      const key = issueKey(normalized)
      if (seen.has(key)) continue
      seen.add(key)
      issues.push(normalized)
    }
  }

  issues.sort(compareIssues)
  return issues
}

/** 语义更直白的别名，便于调用方按场景选择命名 */
export const lintSchema = diagnose

/** 只跑某一条规则，供单测与调试使用；不应用抑制与级别覆盖 */
export function diagnoseRule(
  schema: PromptSchema,
  ruleId: LintRuleId,
  options: LintContextOptions = {},
): LintIssue[] {
  const rule = RULES.find((candidate) => candidate.id === ruleId)
  if (rule === undefined) return []
  const ctx = createLintContext(schema, options)
  return rule.run(schema, ctx)
}
