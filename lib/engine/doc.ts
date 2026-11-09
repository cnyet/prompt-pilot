import type { PromptSchema } from './schema'

/**
 * 客户端文档状态模型（ARCHITECTURE.md 6.6）。
 *
 * 这一层只做纯函数：入参是文档，出参是新文档，没有 React、没有 IO、没有时钟。
 * React 层（components/studio/useGeneration.ts）只负责把 SSE 事件翻译成下面的
 * 动作，四条写入规则本身全部落在这里，因此可以脱离浏览器完整单测。
 *
 * 四条规则与函数的对应关系：
 * - R1 流式只写 pending          -> applyStreamDelta
 * - R2 字段级原子提交            -> commitField
 * - R3 用户编辑立即写 doc        -> applyUserEdit
 * - R4 补丁显式接受才写入        -> applyPatch
 *
 * 文档值取字段文本。渲染层已经把 PromptSchema 投影成可编辑文本，本工单的
 * 手改保护也以字段为粒度；结构化的 schema 留给导入与版本化路径。
 */

/** 撤销栈上限。工单要求至少 50 步，这里取 50 步，超出后丢弃最旧命令。 */
export const MAX_HISTORY_STEPS = 50

export type FieldOrigin = 'ai' | 'user' | 'patch' | 'import' | 'user_input'

export type DocFieldStatus =
  | 'idle'
  | 'streaming'
  | 'done'
  | 'partial'
  | 'failed'
  | 'suggested'
  | 'edited'

/** R2 跳过的 AI 内容。它不改 value，只挂在字段上等用户显式采纳。 */
export interface Suggestion {
  value: string
  origin: FieldOrigin
  seq: number
}

export interface FieldState {
  /** 字段路径。React 层传 FieldKey，未来补丁可以传 constraints.must 这类叶子路径。 */
  path: string
  /** 已提交的文档值。流式 delta 绝对不写这里。 */
  value: string
  origin: FieldOrigin
  /** 单调递增写入序号，冲突仲裁与建议排序的依据。 */
  seq: number
  /** AI 最后一次产出值，用于 diff 与恢复 AI 版本。 */
  aiBaseline: string | null
  /** 用户是否手改过。R2/R4 都看这个标记。 */
  dirty: boolean
  status: DocFieldStatus
  suggestion: Suggestion | null
  error?: string
}

export type CommandType =
  | 'ai-write'
  | 'ai-partial'
  | 'user-edit'
  | 'accept-suggestion'
  | 'patch'
  | 'field-rewrite'

/**
 * 命令式撤销栈的一条记录。
 *
 * 除工单要求的 type/path/before/after/origin/seq 外，额外保存 dirty、origin、
 * suggestion、aiBaseline 与 seq 的前后值。撤销要恢复的不只是文本，还有
 * "这一步是谁写的"，否则撤销后 dirty 标记会错，下一次流式提交又会覆盖用户输入。
 */
export interface Command {
  type: CommandType
  path: string
  before: string
  after: string
  origin: FieldOrigin
  seq: number
  beforeSeq: number
  afterSeq: number
  beforeDirty: boolean
  afterDirty: boolean
  beforeOrigin: FieldOrigin
  afterOrigin: FieldOrigin
  beforeSuggestion: Suggestion | null
  afterSuggestion: Suggestion | null
  beforeAiBaseline: string | null
  afterAiBaseline: string | null
  beforeStatus: DocFieldStatus
  afterStatus: DocFieldStatus
}

export interface PromptDoc {
  schema: PromptSchema | null
  fields: Record<string, FieldState>
  /** R1 的流式累积区，不属于文档，commit 时才搬到 fields。 */
  pending: Record<string, string>
  seq: number
  history: Command[]
  redo: Command[]
}

export interface FieldPatch {
  path: string
  value: string
}

export type PatchDecision = 'reject' | 'accept' | 'overwrite'

export type PatchOutcome = 'applied' | 'rejected' | 'conflict' | 'unknown-field'

export interface PatchResult {
  doc: PromptDoc
  outcome: PatchOutcome
}

function createField(path: string): FieldState {
  return {
    path,
    value: '',
    origin: 'ai',
    seq: 0,
    aiBaseline: null,
    dirty: false,
    status: 'idle',
    suggestion: null,
  }
}

export function createPromptDoc(
  paths: readonly string[],
  schema: PromptSchema | null = null,
): PromptDoc {
  const fields: Record<string, FieldState> = {}
  for (const path of paths) {
    fields[path] = createField(path)
  }
  return { schema, fields, pending: {}, seq: 0, history: [], redo: [] }
}

export function getFieldState(
  doc: PromptDoc,
  path: string,
): FieldState | undefined {
  return doc.fields[path]
}

export function pendingTextOf(doc: PromptDoc, path: string): string {
  return doc.pending[path] ?? ''
}

export function canUndo(doc: PromptDoc): boolean {
  return doc.history.length > 0
}

export function canRedo(doc: PromptDoc): boolean {
  return doc.redo.length > 0
}

function withField(doc: PromptDoc, path: string, field: FieldState): PromptDoc {
  return { ...doc, fields: { ...doc.fields, [path]: field } }
}

function withoutPending(doc: PromptDoc, path: string): PromptDoc {
  if (doc.pending[path] === undefined) {
    return doc
  }
  const pending = { ...doc.pending }
  delete pending[path]
  return { ...doc, pending }
}

function pushCommand(doc: PromptDoc, command: Command): PromptDoc {
  const history = [...doc.history, command]
  return {
    ...doc,
    history: history.slice(-MAX_HISTORY_STEPS),
    redo: [],
  }
}

function makeCommand(
  type: CommandType,
  origin: FieldOrigin,
  before: FieldState,
  after: FieldState,
  seq: number,
): Command {
  return {
    type,
    path: after.path,
    before: before.value,
    after: after.value,
    origin,
    seq,
    beforeSeq: before.seq,
    afterSeq: after.seq,
    beforeDirty: before.dirty,
    afterDirty: after.dirty,
    beforeOrigin: before.origin,
    afterOrigin: after.origin,
    beforeSuggestion: before.suggestion,
    afterSuggestion: after.suggestion,
    beforeAiBaseline: before.aiBaseline,
    afterAiBaseline: after.aiBaseline,
    beforeStatus: before.status,
    afterStatus: after.status,
  }
}

/**
 * R1：流式只写 pending。
 *
 * 即使字段已经 dirty，这里也只累积 pending。delta 永远不会碰 value，
 * 所以"用户正在打字时，后到的 delta 覆盖输入"在状态层不可能发生。
 */
export function applyStreamDelta(
  doc: PromptDoc,
  path: string,
  text: string,
): PromptDoc {
  const field = doc.fields[path]
  if (!field) {
    return doc
  }
  const previous = doc.pending[path] ?? ''
  return {
    ...doc,
    pending: { ...doc.pending, [path]: `${previous}${text}` },
    fields: {
      ...doc.fields,
      [path]: {
        ...field,
        // 用户手改过的字段继续保持"已手改"或"有新版本"的状态，
        // 不能被流式事件改回 streaming，否则界面会误导用户。
        status: field.dirty ? field.status : 'streaming',
        error: undefined,
      },
    },
  }
}

/** 标记字段开始接收流。用户手改过的字段不清空 value，也不清 dirty。 */
export function startField(doc: PromptDoc, path: string): PromptDoc {
  const field = doc.fields[path]
  if (!field) {
    return doc
  }
  return {
    ...doc,
    pending: { ...doc.pending, [path]: '' },
    fields: {
      ...doc.fields,
      [path]: {
        ...field,
        status: field.dirty ? 'edited' : 'streaming',
        // 新一轮生成会替换旧建议，避免用户采纳到上一轮的过期内容。
        suggestion: null,
        error: undefined,
      },
    },
  }
}

/**
 * R2：字段级原子提交。
 *
 * - dirty === false：pending 写入 doc，origin = 'ai'，记一条 AI 写入命令。
 * - dirty === true：不覆盖。pending 变成 suggestion，status = 'suggested'。
 */
export function commitField(
  doc: PromptDoc,
  path: string,
  finalStatus: 'done' | 'partial' = 'done',
): PromptDoc {
  const field = doc.fields[path]
  if (!field) {
    return doc
  }
  const pending = doc.pending[path] ?? ''
  const committed = pending.trimEnd()
  const cleared = withoutPending(doc, path)

  if (pending.length === 0) {
    if (field.dirty) {
      return withField(cleared, path, {
        ...field,
        status: field.suggestion ? 'suggested' : 'edited',
      })
    }
    return withField(cleared, path, { ...field, status: finalStatus })
  }

  if (field.dirty) {
    const seq = doc.seq + 1
    const suggestion: Suggestion = { value: committed, origin: 'ai', seq }
    return {
      ...withField(cleared, path, {
        ...field,
        status: 'suggested',
        suggestion,
        error: undefined,
      }),
      seq,
    }
  }

  const seq = doc.seq + 1
  const nextField: FieldState = {
    ...field,
    value: committed,
    origin: 'ai',
    seq,
    aiBaseline: committed,
    dirty: false,
    status: finalStatus,
    suggestion: null,
    error: undefined,
  }
  const nextDoc = { ...withField(cleared, path, nextField), seq }
  if (field.value === committed && field.status === finalStatus) {
    return nextDoc
  }
  const type: CommandType = finalStatus === 'done' ? 'ai-write' : 'ai-partial'
  return pushCommand(nextDoc, makeCommand(type, 'ai', field, nextField, seq))
}

/**
 * R3：用户编辑立即写 doc。
 *
 * 手改后 dirty = true，之后到达的 delta 只能进 pending，最终作为建议保留。
 */
export function applyUserEdit(
  doc: PromptDoc,
  path: string,
  value: string,
): PromptDoc {
  const field = doc.fields[path]
  if (!field || field.value === value) {
    return doc
  }
  const seq = doc.seq + 1
  const nextField: FieldState = {
    ...field,
    value,
    origin: 'user',
    seq,
    dirty: true,
    status: 'edited',
    error: undefined,
  }
  const nextDoc = { ...withField(doc, path, nextField), seq }
  return pushCommand(
    nextDoc,
    makeCommand('user-edit', 'user', field, nextField, seq),
  )
}

/** 用户显式采纳 AI 建议。值来自 AI，命令 origin 仍记为 'ai'，便于撤销栈区分。 */
export function acceptSuggestion(doc: PromptDoc, path: string): PromptDoc {
  const field = doc.fields[path]
  const suggestion = field?.suggestion
  if (!field || !suggestion) {
    return doc
  }
  const seq = doc.seq + 1
  const nextField: FieldState = {
    ...field,
    value: suggestion.value,
    origin: 'ai',
    seq,
    aiBaseline: suggestion.value,
    dirty: false,
    status: 'done',
    suggestion: null,
    error: undefined,
  }
  const nextDoc = { ...withField(doc, path, nextField), seq }
  return pushCommand(
    nextDoc,
    makeCommand('accept-suggestion', 'ai', field, nextField, seq),
  )
}

/**
 * 用户丢弃建议。文档值没变，所以不产生撤销命令，只清掉建议标记。
 */
export function discardSuggestion(doc: PromptDoc, path: string): PromptDoc {
  const field = doc.fields[path]
  if (!field || !field.suggestion) {
    return doc
  }
  const status: DocFieldStatus = field.value.trim().length === 0
    ? 'idle'
    : field.dirty
      ? 'edited'
      : 'done'
  return withField(doc, path, { ...field, suggestion: null, status })
}

/**
 * R4：补丁必须显式接受才写入。
 *
 * decision 默认 'reject'。目标字段 dirty 时，'accept' 返回 conflict 且不写入，
 * 只有 'overwrite'（界面上的"覆盖"）才生效。
 */
export function applyPatch(
  doc: PromptDoc,
  patch: FieldPatch,
  decision: PatchDecision = 'reject',
): PatchResult {
  const field = doc.fields[patch.path]
  if (!field) {
    return { doc, outcome: 'unknown-field' }
  }
  if (decision === 'reject') {
    return { doc, outcome: 'rejected' }
  }
  if (field.dirty && decision !== 'overwrite') {
    return { doc, outcome: 'conflict' }
  }
  if (field.value === patch.value) {
    return { doc, outcome: 'applied' }
  }

  const seq = doc.seq + 1
  const keptDirty = field.dirty && decision === 'overwrite'
  const nextField: FieldState = {
    ...field,
    value: patch.value,
    origin: 'patch',
    seq,
    aiBaseline: patch.value,
    dirty: keptDirty,
    status: keptDirty ? 'edited' : 'done',
    suggestion: null,
    error: undefined,
  }
  const nextDoc = { ...withField(doc, patch.path, nextField), seq }
  return {
    doc: pushCommand(
      nextDoc,
      makeCommand('patch', 'patch', field, nextField, seq),
    ),
    outcome: 'applied',
  }
}

/**
 * 用户显式请求的单字段重算（加长 / 缩短 / 更具体 / 重新生成）。
 *
 * 这不算违反 R2：R2 拒绝的是「未经用户同意的 AI 覆盖」。这里的写入由用户
 * 在某个字段块上主动点击触发，目标只有该字段。写完后 origin 回到 `ai`、
 * dirty 清零，来源标记重新出现；撤销栈仍保存前后文本与脏标记，可以回退。
 */
export function applyFieldRewrite(
  doc: PromptDoc,
  path: string,
  value: string,
): PromptDoc {
  const field = doc.fields[path]
  if (!field) {
    return doc
  }
  const committed = value.trimEnd()
  if (
    field.value === committed &&
    field.origin === 'ai' &&
    !field.dirty &&
    field.suggestion === null &&
    field.status === 'done'
  ) {
    return doc
  }

  const seq = doc.seq + 1
  const nextField: FieldState = {
    ...field,
    value: committed,
    origin: 'ai',
    seq,
    aiBaseline: committed,
    dirty: false,
    status: 'done',
    suggestion: null,
    error: undefined,
  }
  const nextDoc = { ...withField(doc, path, nextField), seq }
  return pushCommand(
    nextDoc,
    makeCommand('field-rewrite', 'ai', field, nextField, seq),
  )
}

function restoredStatus(
  status: DocFieldStatus,
  value: string,
  dirty: boolean,
  suggestion: Suggestion | null,
): DocFieldStatus {
  if (suggestion) {
    return 'suggested'
  }
  if (status === 'failed') {
    return 'failed'
  }
  if (value.trim().length === 0) {
    return 'idle'
  }
  if (dirty) {
    return 'edited'
  }
  if (status === 'done' || status === 'partial' || status === 'edited') {
    return status
  }
  // streaming 不是稳定的文档状态：撤销或重做落到这里时，流已经不在。
  return 'done'
}

function restoreSide(
  doc: PromptDoc,
  command: Command,
  side: 'before' | 'after',
): PromptDoc {
  const field = doc.fields[command.path]
  if (!field) {
    return doc
  }
  const before = side === 'before'
  const value = before ? command.before : command.after
  const dirty = before ? command.beforeDirty : command.afterDirty
  const origin = before ? command.beforeOrigin : command.afterOrigin
  const suggestion = before
    ? command.beforeSuggestion
    : command.afterSuggestion
  const status = before ? command.beforeStatus : command.afterStatus
  return withField(doc, command.path, {
    ...field,
    value,
    dirty,
    origin,
    seq: before ? command.beforeSeq : command.afterSeq,
    aiBaseline: before
      ? command.beforeAiBaseline
      : command.afterAiBaseline,
    suggestion,
    status: restoredStatus(status, value, dirty, suggestion),
    error: undefined,
  })
}

export function undo(doc: PromptDoc): PromptDoc {
  const command = doc.history[doc.history.length - 1]
  if (!command) {
    return doc
  }
  const restored = restoreSide(doc, command, 'before')
  const history = doc.history.slice(0, -1)
  const redo = [...doc.redo, command].slice(-MAX_HISTORY_STEPS)
  return { ...restored, history, redo }
}

export function redo(doc: PromptDoc): PromptDoc {
  const command = doc.redo[doc.redo.length - 1]
  if (!command) {
    return doc
  }
  const restored = restoreSide(doc, command, 'after')
  const redoStack = doc.redo.slice(0, -1)
  const history = [...doc.history, command].slice(-MAX_HISTORY_STEPS)
  return { ...restored, history, redo: redoStack }
}

/** 流失败时标记字段。用户手改过的字段保留自己的状态与文本，只记录错误。 */
export function failField(
  doc: PromptDoc,
  path: string,
  message: string,
): PromptDoc {
  const field = doc.fields[path]
  if (!field) {
    return doc
  }
  return withField(doc, path, {
    ...field,
    status: field.dirty ? field.status : 'failed',
    error: message,
  })
}
