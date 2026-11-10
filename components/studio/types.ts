import { FIELD_KEYS, type Assumption, type FieldKey } from '@/lib/engine/schema'
import {
  createPromptDoc,
  type DocFieldStatus,
  type FieldOrigin,
  type PromptDoc,
  type Suggestion,
} from '@/lib/engine/doc'
import type { TokenUsage } from '@/lib/llm/types'

export type FieldStatus = DocFieldStatus

/** 单字段重算的四种操作。与 /api/engine/field 的 action 一一对应。 */
export const FIELD_OPS = ['lengthen', 'shorten', 'specific', 'regenerate'] as const
export type FieldOp = (typeof FIELD_OPS)[number]

export const FIELD_OP_LABELS: Record<FieldOp, string> = {
  lengthen: '加长',
  shorten: '缩短',
  specific: '更具体',
  regenerate: '重新生成',
}

export const FIELD_OP_DESCRIPTIONS: Record<FieldOp, string> = {
  lengthen: '补充细节与判断依据',
  shorten: '删减冗长表述，保留要点',
  specific: '把模糊词换成可核对的判据',
  regenerate: '按原始需求重算这一字段',
}

export function isFieldOp(value: unknown): value is FieldOp {
  return (
    typeof value === 'string' &&
    (FIELD_OPS as readonly string[]).includes(value)
  )
}

export interface FieldOpState {
  status: 'running' | 'failed'
  action: FieldOp
  /** 流式返回的预览文本。完成前不写文档。 */
  preview: string
  error?: string
}

export type FieldOpMap = Partial<Record<FieldKey, FieldOpState>>

export interface FieldView {
  status: FieldStatus
  /** 已提交的文档文本。流式过程中始终是最后一次提交的值。 */
  text: string
  /** 用户是否手改过。手改后不再显示 AI 来源圆点。 */
  dirty: boolean
  origin: FieldOrigin
  aiBaseline: string | null
  /** 被跳过的 AI 版本，等待用户采纳或丢弃。 */
  suggestion: Suggestion | null
  /** R1 的流式累积区。它不是文档值，只用于展示生成进度。 */
  pendingText: string
  error?: string
}

export type FieldViewMap = Record<FieldKey, FieldView>

export type GenerationPhase = 'idle' | 'streaming' | 'done' | 'stopped' | 'error'

export interface GenerationError {
  code: string
  message: string
  hint: string
  retryable: boolean
}

export interface GenerationState {
  phase: GenerationPhase
  /** 文档状态模型。字段值、dirty、origin、撤销栈都在这里。 */
  doc: PromptDoc
  /** 当前这次请求实际排队的字段。单字段重试时，其余未生成字段不应显示骨架。 */
  scheduled: readonly FieldKey[]
  title: string
  assumptions: Assumption[]
  /** 用户改过的假设路径，用于 chip 的「已改」标记。 */
  assumptionEdits: Record<string, true>
  /** 导出时是否剔除假设注释。工单 12 消费这个开关与对应的导出数据。 */
  exportWithoutAssumptions: boolean
  durationMs: number | null
  error: GenerationError | null
  /** 单字段重算的进行中状态，按字段隔离。 */
  fieldOps: FieldOpMap
  /** 本次请求的用量；没有收到 usage 事件时为 null，界面显示「未知」。 */
  usage: TokenUsage | null
  /** 思维链原文，只进「思考」区，绝不写入字段正文。 */
  reasoning: string
}

function createEmptyView(): FieldView {
  return {
    status: 'idle',
    text: '',
    dirty: false,
    origin: 'ai',
    aiBaseline: null,
    suggestion: null,
    pendingText: '',
  }
}

export function toFieldView(doc: PromptDoc, field: FieldKey): FieldView {
  const state = doc.fields[field]
  if (!state) {
    return createEmptyView()
  }
  return {
    status: state.status,
    text: state.value,
    dirty: state.dirty,
    origin: state.origin,
    aiBaseline: state.aiBaseline,
    suggestion: state.suggestion,
    pendingText: doc.pending[field] ?? '',
    ...(state.error === undefined ? {} : { error: state.error }),
  }
}

export function toFieldViewMap(doc: PromptDoc): FieldViewMap {
  return Object.fromEntries(
    FIELD_KEYS.map((field) => [field, toFieldView(doc, field)] as const),
  ) as FieldViewMap
}

export function createInitialState(): GenerationState {
  return {
    phase: 'idle',
    doc: createPromptDoc(FIELD_KEYS),
    scheduled: [],
    title: '',
    assumptions: [],
    assumptionEdits: {},
    exportWithoutAssumptions: false,
    durationMs: null,
    error: null,
    fieldOps: {},
    usage: null,
    reasoning: '',
  }
}

/**
 * 用量的展示口径：没有 usage 时统一返回「未知」，绝不回退成 0。
 * token 数可能合法为 0，但「没有收到事件」与「收到 0」由 usage 是否为 null 区分。
 */
export function formatUsageTokens(usage: TokenUsage | null): string {
  if (!usage) {
    return '未知'
  }
  const parts = [`输入 ${usage.tokensIn.toLocaleString('zh-CN')} token`]
  parts.push(`输出 ${usage.tokensOut.toLocaleString('zh-CN')} token`)
  if (usage.reasoningTokens !== undefined) {
    parts.push(`思考 ${usage.reasoningTokens.toLocaleString('zh-CN')} token`)
  }
  if (usage.cachedTokens !== undefined) {
    parts.push(`缓存命中 ${usage.cachedTokens.toLocaleString('zh-CN')} token`)
  }
  return parts.join(' · ')
}

/** 金额单位是人民币元；缺价格时显示「未知」。 */
export function formatUsageCost(costCny: number | undefined): string {
  if (costCny === undefined) {
    return '未知'
  }
  const formatted = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(costCny)
  return `¥${formatted}`
}

/* ---------- 试运行 ---------- */

export type TrialRunPhase = 'idle' | 'running' | 'done' | 'canceled' | 'failed'

export type TrialRunFinishReason = 'stop' | 'error' | 'aborted'

export interface TrialRunState {
  phase: TrialRunPhase
  /** 已经流出的正文。取消或失败时保留，绝不清空。 */
  output: string
  reasoning: string
  /** 收到 usage 事件前为 null，界面显示「未知」而不是 0。 */
  usage: TokenUsage | null
  durationMs: number | null
  finishReason: TrialRunFinishReason | null
  error: string | null
  modelLabel: string | null
}

export type TrialRunAction =
  | { type: 'start'; modelLabel: string }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'usage'; usage: TokenUsage }
  | {
      type: 'finish'
      durationMs: number
      finishReason: TrialRunFinishReason
    }
  | { type: 'cancel'; durationMs: number }
  | { type: 'fail'; message: string; durationMs: number }
  | { type: 'reset' }

export interface TrialRunPricing {
  inputCnyPerMillion?: number
  cachedInputCnyPerMillion?: number
  outputCnyPerMillion?: number
}

export interface TrialRunModelInfo {
  providerId: string
  modelId: string
  label: string
  pricing?: TrialRunPricing
}

export type TrialRunAvailabilityStatus =
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'error'

export interface TrialRunAvailability {
  status: TrialRunAvailabilityStatus
  available: boolean
  /** 不可用或探测失败时的中文原因。 */
  reason: string
  model: TrialRunModelInfo | null
}

export interface TrialRunEstimate {
  tokensIn: number
  tokensOut: number
  costCny?: number
}

export interface TrialRunHistoryItem {
  id: string
  status: string
  output: string
  reasoning: string | null
  latencyMs: number | null
  tokensIn: number
  tokensOut: number
  costCny: number
  createdAt: string
  errorCode: string | null
  errorMsg: string | null
}
