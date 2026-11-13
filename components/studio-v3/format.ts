/**
 * 工作台元信息格式化：模型、耗时、token、费用。
 * 未知值一律显示「—」，不写 0；模型显示名来自客户端安全的 model-labels，
 * 不得从 registry（依赖 node:crypto）导入。
 */
import { modelDisplayLabel } from '@/lib/llm/model-labels'

const UNKNOWN = '—'

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatModel(modelId: string | null | undefined): string {
  const value = modelId?.trim()
  if (!value) return UNKNOWN
  return modelDisplayLabel(value)
}

export function formatCost(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return UNKNOWN
  return `¥${value.toFixed(4)}`
}

export function formatLatency(value: number | null | undefined): string {
  if (!isFiniteNumber(value) || value < 0) return UNKNOWN
  if (value < 1000) return `${Math.round(value)} 毫秒`
  return `${(value / 1000).toFixed(1)} 秒`
}

export function formatTokens(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return UNKNOWN
  return String(value)
}
