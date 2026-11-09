import { OUTPUT_FORMATS, type PromptSchema } from '@/lib/engine/schema'
import {
  DEFAULT_AMBIGUITY_POLICY,
  DEFAULT_KNOWLEDGE_POLICY,
  DEFAULT_SUCCESS_CRITERIA,
  STRUCTURE_REQUIRED_TASK_TYPES,
  TASK_LENGTH_DEFAULTS,
  TASK_OUTPUT_DEFAULTS,
  TASK_PERSONA_DEFAULTS,
  TASK_SCOPE_OUT_DEFAULTS,
} from './lexicons'
import { getValueAtPath, groupMustItems, setValueAtPath } from './rules'
import type { LintIssue } from './types'

/** 删除限定词后顺手收拾多余空格与标点前的空格，避免留下「  ，」这种痕迹 */
function tidyAfterDeletion(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([，。；：、！？])/g, '$1')
    .replace(/([，。；：、！？])[ \t]+/g, '$1')
}

function replaceWordInField(next: PromptSchema, issue: LintIssue): void {
  const word = issue.data?.word
  const replacement = issue.data?.replacement
  if (typeof word !== 'string' || word.length === 0 || typeof replacement !== 'string') return

  const current = getValueAtPath(next, issue.path)
  if (typeof current !== 'string') return

  const updated = current.split(word).join(replacement)
  const nextText = replacement.length === 0 ? tidyAfterDeletion(updated) : updated
  // 删除后整段为空会破坏 schema 的 min(1) 约束，这种情况下宁可保留原文让用户手改
  if (nextText.trim().length === 0) return
  setValueAtPath(next, issue.path, nextText)
}

function fixOutputFormat(next: PromptSchema): void {
  const defaults = TASK_OUTPUT_DEFAULTS[next.meta.taskType]
  const structured = STRUCTURE_REQUIRED_TASK_TYPES.includes(next.meta.taskType)
  const formatValid = (OUTPUT_FORMATS as readonly string[]).includes(next.output.format)

  // 只在格式非法、或结构化任务却用了 plain 时才改格式；用户选的有效格式不覆盖
  if (!formatValid || (structured && next.output.format === 'plain')) {
    next.output.format = defaults.format
  }
  if (next.output.sections.length === 0) {
    next.output.sections = [...defaults.sections]
  }
}

/**
 * 对一条问题应用自动修复，返回新的 schema，绝不修改入参。
 *
 * 不能自动修复的规则（R008 矛盾约束、R013 指代不明、R014 过长、R015 缺示例）
 * 会返回一份与原 schema 内容相同的新对象；调用方可按 `issue.fixable` 先过滤。
 *
 * 对 R001 / R009，修复会替换该字段内**所有**同名命中，
 * 因此同一字段聚合展示的一条问题一次就能修干净。
 */
export function applyFix(schema: PromptSchema, issue: LintIssue): PromptSchema {
  const next = structuredClone(schema)
  if (!issue.fixable) return next

  switch (issue.ruleId) {
    case 'R001':
    case 'R009': {
      replaceWordInField(next, issue)
      return next
    }
    case 'R002': {
      fixOutputFormat(next)
      return next
    }
    case 'R003': {
      next.role.persona = TASK_PERSONA_DEFAULTS[next.meta.taskType]
      return next
    }
    case 'R004': {
      next.objective.successCriteria = [...DEFAULT_SUCCESS_CRITERIA]
      return next
    }
    case 'R005': {
      next.constraints.boundaries.scopeOut = [...TASK_SCOPE_OUT_DEFAULTS[next.meta.taskType]]
      return next
    }
    case 'R006': {
      next.constraints.boundaries.knowledgePolicy = DEFAULT_KNOWLEDGE_POLICY
      return next
    }
    case 'R007': {
      next.constraints.boundaries.ambiguityPolicy = DEFAULT_AMBIGUITY_POLICY
      return next
    }
    case 'R010': {
      next.output.length = TASK_LENGTH_DEFAULTS[next.meta.taskType]
      return next
    }
    case 'R011': {
      const name = issue.data?.variableName
      if (typeof name === 'string' && name.length > 0) {
        const exists = next.input.variables.some((variable) => variable.name === name)
        if (!exists) {
          next.input.variables.push({
            name,
            label: name,
            type: 'text',
            required: true,
            description: 'lint 根据正文占位符自动补全',
          })
        }
      }
      return next
    }
    case 'R012': {
      const name = issue.data?.variableName
      if (typeof name === 'string' && name.length > 0) {
        next.input.variables = next.input.variables.filter((variable) => variable.name !== name)
      }
      return next
    }
    case 'R016': {
      next.constraints.must = groupMustItems(next.constraints.must)
      return next
    }
    case 'R008':
    case 'R013':
    case 'R014':
    case 'R015': {
      return next
    }
  }
}

/** 一键应用全部可自动修复项；不可修复项原样跳过 */
export function applyAllFixes(schema: PromptSchema, issues: readonly LintIssue[]): PromptSchema {
  return issues.reduce<PromptSchema>(
    (current, issue) => (issue.fixable ? applyFix(current, issue) : current),
    schema,
  )
}
