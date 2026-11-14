/**
 * 提示词库列表与详情的展示格式化。
 *
 * 未知值统一走 `common.unknown`（「—」），不写 0；时间按上海固定偏移
 * 输出 YYYY-MM-DD HH:mm，避免运行环境时区影响。
 */
import { t } from '@/lib/i18n/zh'
import { modelDisplayLabel } from '@/lib/llm/model-labels'

/** 折叠空白后按码点截断，超长追加「…」；默认 80 个码点。 */
export function recordExcerpt(text: string, max = 80): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(normalized)
  if (chars.length <= max) return normalized
  return `${chars.slice(0, max).join('')}…`
}

export function formatRecordModel(modelId: string | null): string {
  if (modelId === null || modelId === '') return t('common.unknown')
  return modelDisplayLabel(modelId)
}

export function formatRecordCost(costCny: number | null): string {
  if (costCny === null) return t('common.unknown')
  return `¥${costCny.toFixed(4)}`
}

/** 固定 +08:00 换算，手工补零，输出 YYYY-MM-DD HH:mm。 */
export function formatRecordTime(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  ].join(' ')
}

export function isValidRecordTitle(title: string): boolean {
  const length = title.trim().length
  return length >= 1 && length <= 120
}

export function toProcessMode(value: string): 'generate' | 'optimize' {
  return value === 'optimize' ? 'optimize' : 'generate'
}

export function toTargetType(value: string): 'text' | 'image' | 'video' {
  if (value === 'image') return 'image'
  if (value === 'video') return 'video'
  return 'text'
}
