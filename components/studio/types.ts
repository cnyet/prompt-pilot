import { FIELD_KEYS, type Assumption, type FieldKey } from '@/lib/engine/schema'
import {
  createPromptDoc,
  type DocFieldStatus,
  type FieldOrigin,
  type PromptDoc,
  type Suggestion,
} from '@/lib/engine/doc'

export type FieldStatus = DocFieldStatus

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
  durationMs: number | null
  error: GenerationError | null
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
    durationMs: null,
    error: null,
  }
}
