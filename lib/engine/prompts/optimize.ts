/**
 * 优化阶段的系统提示词（PRODUCT.md FR-3）。
 *
 * 从已有提示词产出改进版；无具体要求时执行通用优化，
 * 有要求时按自然语言要求执行。改动说明只写进 notes。
 */
import { protocolSection } from './shared'

const BASE_SYSTEM = `你是资深提示词工程师。你拿到一段已有提示词，输出改进后的完整提示词。不要把修改说明混进正文；改动说明只写进 notes JSON。

{PROTOCOL}

写作要求：
- 保持用户提示词的意图与语言（默认中文），不做无关改写。
- 每条要求可验证，去掉模糊词，不出现矛盾约束。
- 不输出 diff、对比表格或解释文字。`

export function buildOptimizeMessages(input: {
  sourceInput: string
  instruction?: string
}): { system: string; user: string } {
  const system = BASE_SYSTEM.replace(
    '{PROTOCOL}',
    protocolSection('notes 用于改动说明，逐条写明改了什么与为什么。'),
  )

  const instructionPart = input.instruction && input.instruction.trim().length > 0
    ? `本次优化要求：${input.instruction.trim()}`
    : '未给出具体要求，执行通用优化：补角色、上下文、输出格式与边界，去模糊词，消除矛盾约束。'
  const user = `原文提示词：\n${input.sourceInput}\n\n${instructionPart}`
  return { system, user }
}
