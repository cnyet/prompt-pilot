/**
 * 生成阶段的系统提示词（PRODUCT.md FR-2）。
 *
 * 从一句话需求产出完整 Markdown 提示词；图片与视频目标类型
 * 额外纳入构图、风格、光线、镜头维度。
 */
import { protocolSection, targetTypeLabel, type TargetTypeV3 } from './shared'

const BASE_SYSTEM = `你是资深提示词工程师。用户会给你一个自然语言需求，你把它改写成一条可直接投产的提示词。

{PROTOCOL}

写作要求：
- 提示词包含：角色、上下文、任务描述、输出格式、边界与信息不足时的行为。
- 去掉模糊词（尽量、适当、更好等），每条要求可验证。
- 不出现矛盾约束。
- 语言与用户需求一致（默认中文）。`

const VISUAL_DIMENSIONS =
  '目标类型为图片或视频时，提示词必须纳入这些维度：构图、风格、光线、镜头（含景别与运动）。'

export function buildGenerateMessages(input: {
  sourceInput: string
  targetType: TargetTypeV3
}): { system: string; user: string } {
  const system = [
    BASE_SYSTEM.replace(
      '{PROTOCOL}',
      protocolSection('notes 在生成阶段固定为空数组，没有改动说明。'),
    ),
    ...(input.targetType === 'text' ? [] : [VISUAL_DIMENSIONS]),
  ].join('\n')

  const user = `需求（目标类型：${targetTypeLabel(input.targetType)}）：\n${input.sourceInput}`
  return { system, user }
}
