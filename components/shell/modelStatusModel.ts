import { modelDisplayLabel } from '@/lib/llm/model-labels'

export interface ModelStatusSnapshot {
  status: 'available' | 'unavailable'
  reason: string
  modelLabel: string | null
  providerId: string | null
}

/**
 * 从 `GET /api/settings` 的载荷里读出壳层需要的模型状态。
 *
 * 只依赖客户端安全字段：密钥是否已配置与生成模型 ID，不读取密钥本身。
 * 载荷缺字段或模型 ID 为空时返回 null，由调用方显示未知态。
 */
export function readModelStatus(payload: unknown): ModelStatusSnapshot | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const settings = (payload as { settings?: unknown }).settings
  if (typeof settings !== 'object' || settings === null) {
    return null
  }
  const apiKey = (settings as { apiKey?: unknown }).apiKey
  const modelGenerate = (settings as { modelGenerate?: unknown }).modelGenerate
  if (typeof apiKey !== 'object' || apiKey === null) {
    return null
  }
  if (typeof modelGenerate !== 'object' || modelGenerate === null) {
    return null
  }

  const configured = (apiKey as { configured?: unknown }).configured
  const modelId = (modelGenerate as { value?: unknown }).value
  if (typeof configured !== 'boolean') {
    return null
  }
  if (typeof modelId !== 'string' || modelId.trim().length === 0) {
    return null
  }

  if (!configured) {
    return {
      status: 'unavailable',
      reason: '未配置模型凭据，先在设置里接入模型。',
      modelLabel: null,
      providerId: null,
    }
  }

  return {
    status: 'available',
    reason: '',
    modelLabel: modelDisplayLabel(modelId),
    providerId: 'openai_compatible',
  }
}
