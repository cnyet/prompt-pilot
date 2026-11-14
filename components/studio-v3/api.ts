/**
 * 工作台 API 客户端（Task 4）。
 *
 * JSON 调用统一走 requestJson：非 2xx 解析 `{ code, message, retryable }`
 * 并抛 ApiError；SSE 调用返回原始 Response，由 usePromptStream 读取事件流。
 * 本模块客户端安全：不引入任何 node: 模块或 registry（后者依赖 node:crypto）。
 * 兜底错误文案走 i18n 字典，不在本模块写死中文。
 */
import { t } from '@/lib/i18n/zh'
import { buildRecordsQuery, type LibraryListParams } from '@/lib/library/query'

export type ProcessMode = 'generate' | 'optimize'
export type TargetType = 'text' | 'image' | 'video'

export interface UsageDto {
  tokensIn: number
  tokensOut: number
  costCny?: number
  latencyMs?: number
}

export interface IterationDto {
  id: string
  seq: number
  kind: string
  instruction: string | null
  output: string
  notes: string[]
  modelId: string | null
  tokensIn: number | null
  tokensOut: number | null
  costCny: number | null
  latencyMs: number | null
  status: string
  createdAt: string
}

export interface RecordSummaryDto {
  id: string
  title: string
  mode: string
  targetType: string
  sourceInput: string
  status: string
  favorite: boolean
  rating: number | null
  modelId: string | null
  iterationCount: number
  tokensIn: number | null
  tokensOut: number | null
  costCny: number | null
  createdAt: string
  updatedAt: string
}

export interface RecordListDto {
  records: RecordSummaryDto[]
  total: number
  limit: number
  offset: number
}

export interface RecordDetailDto {
  record: RecordSummaryDto & {
    latestOutput: string
    copiedAt: string | null
    originTemplateId: string | null
    iterations: IterationDto[]
  }
}

export interface TemplateDto {
  id: string
  slug: string | null
  category: string
  style: string
  title: string
  description: string
  body: string
  mode: string
  exampleInput: string | null
  coverKind: string
  featured: boolean
  builtin: boolean
  createdAt: string
  updatedAt: string
}

export interface V3StatsDto {
  month: { budgetCny: number | null; budgetUsage: number | null }
  daily: unknown[]
  byModel: unknown[]
  byStage: unknown[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean

  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

interface ErrorBody {
  code?: unknown
  message?: unknown
  retryable?: unknown
}

/** 非 2xx 响应 → ApiError；错误体不是 JSON 时按状态码给出可读兜底。 */
async function toApiError(response: Response): Promise<ApiError> {
  let code = 'INTERNAL'
  let message = t('error.requestFailedStatus', { status: response.status })
  let retryable = response.status >= 500 || response.status === 429
  try {
    const body = (await response.json()) as ErrorBody
    if (typeof body.code === 'string' && body.code.length > 0) code = body.code
    if (typeof body.message === 'string' && body.message.length > 0) message = body.message
    if (typeof body.retryable === 'boolean') retryable = body.retryable
  } catch {
    // 非 JSON 错误体：保留按状态码推导的默认值
  }
  return new ApiError(response.status, code, message, retryable)
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) throw await toApiError(response)
  return (await response.json()) as T
}

/** SSE 调用：成功时返回原始 Response（body 未被消费）；失败时抛 ApiError。 */
async function requestStream(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, init)
  if (!response.ok) throw await toApiError(response)
  return response
}

function jsonPost(path: string, body: unknown): Promise<Response> {
  return requestStream(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function recordPath(id: string, suffix = ''): string {
  return `/api/records/${encodeURIComponent(id)}${suffix}`
}

export function postGenerate(body: {
  mode: ProcessMode
  sourceInput: string
  instruction?: string
  targetType?: TargetType
  originTemplateId?: string
  requestId?: string
}): Promise<Response> {
  return jsonPost('/api/generate', body)
}

export function postOptimize(
  recordId: string,
  body: { instruction: string; requestId?: string },
): Promise<Response> {
  return jsonPost(recordPath(recordId, '/optimize'), body)
}

export function postRepair(
  recordId: string,
  body: {
    issues: Array<{
      id: string
      level: 'error' | 'warn' | 'info'
      message: string
      suggestion: string | null
    }>
    requestId?: string
  },
): Promise<Response> {
  return jsonPost(recordPath(recordId, '/repair'), body)
}

export function postRegenerate(
  recordId: string,
  body: { requestId?: string },
): Promise<Response> {
  return jsonPost(recordPath(recordId, '/regenerate'), body)
}

export function fetchRecordList(
  params: LibraryListParams,
  signal?: AbortSignal,
): Promise<RecordListDto> {
  return requestJson<RecordListDto>(buildRecordsQuery(params), { cache: 'no-store', signal })
}

export function fetchRecordDetail(id: string): Promise<RecordDetailDto> {
  return requestJson<RecordDetailDto>(recordPath(id), { cache: 'no-store' })
}

export function patchRecordMeta(
  id: string,
  body: { title?: string; favorite?: boolean; rating?: number | null },
): Promise<{ record: RecordSummaryDto }> {
  return requestJson<{ record: RecordSummaryDto }>(recordPath(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteRecord(id: string): Promise<void> {
  const response = await fetch(recordPath(id), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

export function createTemplate(body: {
  category: TargetType
  style: string
  title: string
  description: string
  body: string
  mode: ProcessMode
  exampleInput?: string | null
}): Promise<{ template: TemplateDto }> {
  return requestJson<{ template: TemplateDto }>('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function fetchTemplates(): Promise<{ templates: TemplateDto[] }> {
  return requestJson<{ templates: TemplateDto[] }>('/api/templates', {
    cache: 'no-store',
  })
}

export async function deleteTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw await toApiError(response)
}

export function fetchV3Stats(): Promise<V3StatsDto> {
  return requestJson<V3StatsDto>('/api/stats', { cache: 'no-store' })
}
