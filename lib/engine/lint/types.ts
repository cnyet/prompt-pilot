import type { PromptSchema } from '@/lib/engine/schema'

/**
 * 本地诊断引擎的公共类型。
 *
 * 坐标系约定：`span` 是**字段内**的 UTF-16 偏移，左闭右开 `[start, end)`。
 * 例如 `path = 'objective.goal'`、`span = [2, 4]`，表示
 * `schema.objective.goal.slice(2, 4)` 这一段文本有问题。
 * 结构性缺失（例如整个数组为空）没有可下划线的高亮区间，此时省略 `span`。
 */
export const LINT_RULE_IDS = [
  'R001',
  'R002',
  'R003',
  'R004',
  'R005',
  'R006',
  'R007',
  'R008',
  'R009',
  'R010',
  'R011',
  'R012',
  'R013',
  'R014',
  'R015',
  'R016',
] as const

export type LintRuleId = (typeof LINT_RULE_IDS)[number]

export const LINT_LEVELS = ['error', 'warn', 'info'] as const

export type LintLevel = (typeof LINT_LEVELS)[number]

/** 字段内字符区间，左闭右开 */
export type LintSpan = readonly [start: number, end: number]

/** R008 的四个矛盾轴 */
export type ConflictAxis = 'detail' | 'length' | 'formality' | 'format'

/**
 * 规则内部给修复器/界面留的附加数据。
 * 全部是可序列化的原始类型，不携带函数或正则。
 */
export interface LintIssueData {
  /** 命中的词，例如「尽量」 */
  readonly word?: string
  /** 建议替换成的文本；空字符串表示删除 */
  readonly replacement?: string
  /** 变量名，供 R011 / R012 修复使用 */
  readonly variableName?: string
  /** R008 的矛盾轴 */
  readonly axis?: ConflictAxis
  /** 同一字段内的命中次数（聚合展示时使用） */
  readonly count?: number
  /** 冲突涉及的输出格式，例如 'json' */
  readonly format?: string
}

/** 一条诊断问题 */
export interface LintIssue {
  readonly ruleId: LintRuleId
  readonly level: LintLevel
  /** 字段路径，如 'objective.goal'、'constraints.must[2]'；文档级问题用 '$' */
  readonly path: string
  /** 能定位到具体文本时给出字段内区间 */
  readonly span?: LintSpan
  /** 问题是什么 */
  readonly message: string
  /** 为什么是问题（对输出质量的具体影响） */
  readonly why: string
  /** 可执行的修复建议 */
  readonly suggestion: string
  /** 是否能由 applyFix 自动修复 */
  readonly fixable: boolean
  readonly data?: LintIssueData
}

/** schema 中的一段正文，供规则扫描 */
export interface LintTextField {
  readonly path: string
  readonly text: string
}

/** 规则运行上下文：纯数据 + 两个纯函数，无 IO、无时间依赖 */
export interface LintContext {
  /** 用户抑制的规则 id（来自 schema.linter.suppressions 与调用参数合并） */
  readonly suppressedRules: readonly string[]
  /** 用户级别覆盖表（来自 schema.linter.severityOverride 与调用参数合并） */
  readonly severityOverride: Readonly<Record<string, string>>
  /** token 估算函数，默认按字符数粗算 */
  readonly estimateTokens: (text: string) => number
  /** 一次性渲染出的正文，避免每条规则重复遍历 */
  readonly renderedText: string
  /** 一次性收集的所有正文字段 */
  readonly fields: readonly LintTextField[]
  readonly tokenWarnThreshold: number
  readonly tokenErrorThreshold: number
}

/** 创建上下文时的可选项；调用方不必自己拼完整上下文 */
export interface LintContextOptions {
  readonly suppressedRules?: readonly string[]
  readonly severityOverride?: Readonly<Record<string, string>>
  readonly estimateTokens?: (text: string) => number
  readonly tokenWarnThreshold?: number
  readonly tokenErrorThreshold?: number
}

/** 一条规则：纯函数，只读 schema 与 ctx */
export interface LintRule {
  readonly id: LintRuleId
  readonly title: string
  readonly run: (schema: PromptSchema, ctx: LintContext) => LintIssue[]
}

export function isLintRuleId(value: string): value is LintRuleId {
  return (LINT_RULE_IDS as readonly string[]).includes(value)
}

export function isLintLevel(value: string): value is LintLevel {
  return (LINT_LEVELS as readonly string[]).includes(value)
}

/** error 排在 warn 前，warn 排在 info 前 */
export function lintLevelRank(level: LintLevel): number {
  switch (level) {
    case 'error':
      return 0
    case 'warn':
      return 1
    case 'info':
      return 2
  }
}
