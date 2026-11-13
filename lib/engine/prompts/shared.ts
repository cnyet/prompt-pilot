/**
 * v3 三组系统提示词的共用协议段（ARCHITECTURE §五 元数据协议）。
 *
 * 生成 / 优化 / 修复共用同一输出协议：先 Markdown 正文，后
 * `<<<PROMPTPILOT_META>>>` 分隔符与一行 JSON 元数据。
 * 文案不带感叹号与 em dash。
 */
import { META_SEPARATOR } from './meta'

export type TargetTypeV3 = 'text' | 'image' | 'video'

/**
 * 返回共用的输出协议段。
 * @param notesUsage 各阶段对 notes 的用途说明（由调用方给出）。
 */
export function protocolSection(notesUsage: string): string {
  return [
    '输出格式（严格遵守）：',
    '1. 先输出完整 Markdown 正文，只有提示词本身，不写任何解释、前言或结论。',
    `2. 正文结束后，另起一行单独输出 ${META_SEPARATOR}。`,
    '3. 紧接着输出一行 JSON：{"title":"不超过 20 字的短标题","notes":["..."]}，title 不含换行。',
    `4. ${notesUsage}`,
    '5. notes 最多 3 条，每条一句话；改动说明只写进 notes，正文不得混入说明文字。',
  ].join('\n')
}

/** 目标类型的界面文案，用于 user 消息回显。 */
export function targetTypeLabel(targetType: TargetTypeV3): string {
  switch (targetType) {
    case 'text':
      return '文本'
    case 'image':
      return '图片'
    case 'video':
      return '视频'
  }
}
