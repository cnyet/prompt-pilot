/**
 * 修复阶段的系统提示词（PRODUCT.md FR-5.4、CONTEXT.md「修复」）。
 *
 * 按本地检查（R101-R108）的结果通过优化模型生成新迭代；
 * 修复不覆盖历史迭代，不改写与检查结果无关的部分。
 */
import { protocolSection } from './shared'

export interface RepairIssue {
  id: string
  level: 'error' | 'warn' | 'info'
  message: string
  suggestion: string | null
}

const BASE_SYSTEM = `你是资深提示词工程师。按检查结果修复提示词，输出修复后的完整提示词，不覆盖历史，不改写与检查结果无关的部分。改动说明只写进 notes JSON，不混进正文。

{PROTOCOL}

写作要求：
- 只修复检查结果指出的问题，保持其余内容不变。
- 语言与原文一致（默认中文）。`

function renderIssue(issue: RepairIssue): string {
  const suggestion = issue.suggestion && issue.suggestion.trim().length > 0
    ? `（建议：${issue.suggestion.trim()}）`
    : ''
  return `- [${issue.id}][${issue.level}] ${issue.message}${suggestion}`
}

export function buildRepairMessages(input: {
  sourceInput: string
  issues: RepairIssue[]
}): { system: string; user: string } {
  const system = BASE_SYSTEM.replace(
    '{PROTOCOL}',
    protocolSection('notes 逐条对应本次修复点，最多 3 条。'),
  )

  const issueLines = input.issues.length > 0
    ? input.issues.map(renderIssue).join('\n')
    : '无具体检查问题，按通用优化处理'
  const user = `原文提示词：\n${input.sourceInput}\n\n检查结果：\n${issueLines}`
  return { system, user }
}
