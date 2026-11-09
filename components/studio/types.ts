import { FIELD_KEYS, type Assumption, type FieldKey } from '@/lib/engine/schema'

export type FieldStatus = 'idle' | 'streaming' | 'done' | 'partial' | 'failed'

export interface FieldView {
  status: FieldStatus
  text: string
  /** 用户是否手改过。手改后不再显示 AI 来源圆点。 */
  dirty: boolean
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
  fields: FieldViewMap
  /** 当前这次请求实际排队的字段。单字段重试时，其余未生成字段不应显示骨架。 */
  scheduled: readonly FieldKey[]
  title: string
  assumptions: Assumption[]
  durationMs: number | null
  error: GenerationError | null
}

export function createEmptyFields(): FieldViewMap {
  return Object.fromEntries(
    FIELD_KEYS.map(
      (field) => [field, { status: 'idle', text: '', dirty: false }] as const,
    ),
  ) as FieldViewMap
}

export function createInitialState(): GenerationState {
  return {
    phase: 'idle',
    fields: createEmptyFields(),
    scheduled: [],
    title: '',
    assumptions: [],
    durationMs: null,
    error: null,
  }
}
