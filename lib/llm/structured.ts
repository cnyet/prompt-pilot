import type { ZodType } from 'zod'
import {
  LlmError,
  classifyLengthCause,
  createLlmError,
  type LengthCause,
} from './errors'
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  FinishReason,
  LLMProvider,
  StructuredOptions,
} from './types'

/**
 * 结构化输出的兜底链，严格按下面的顺序降级：
 *
 *   1. json_schema（strict，能力允许时）
 *   2. json_object
 *   3. 宽容解析（剥围栏、截取首尾括号、补未闭合括号、去尾随逗号）
 *   4. 把 Zod 的具体路径与信息喂回模型修复，最多 2 次
 *   5. 仍失败则保留已生成的原始内容，降级为纯文本
 *
 * 每一级都会记录 StructuredAttempt，并通过 onAttempt 暴露给路由与测试；
 * 本地解析与最终降级不占用真实模型调用序号。
 */

export type StructuredAttemptLevel =
  | 'json_schema'
  | 'json_object'
  | 'loose_parse'
  | 'repair'
  | 'text'

export type StructuredAttemptStatus = 'success' | 'failed' | 'skipped' | 'degraded'

export interface StructuredAttempt {
  level: StructuredAttemptLevel
  status: StructuredAttemptStatus
  /** 真实模型调用序号，从 1 开始；loose_parse 与 text 是本地处理，不占序号。 */
  call?: number
  /** 第几次修复，从 1 开始；仅 repair 级别有值。 */
  repair?: number
  /** 失败或被跳过时的原因，来自 Zod 校验或 provider 错误。 */
  reason?: string
}

export interface StructuredSuccess<T> {
  kind: 'structured'
  data: T
  attempts: readonly StructuredAttempt[]
  finishReason: FinishReason
  /** 仅当最后一次输出 finish_reason=length 时有值。 */
  lengthCause?: LengthCause
}

export interface StructuredFallback {
  kind: 'text'
  /** 保留的原始输出：取所有响应中最长的一段，解析失败也不丢内容。 */
  text: string
  attempts: readonly StructuredAttempt[]
  lastIssues?: string
  finishReason: FinishReason
  /** 仅当最后一次输出 finish_reason=length 时有值。 */
  lengthCause?: LengthCause
}

export type StructuredOutcome<T> = StructuredSuccess<T> | StructuredFallback

export interface StructuredRunOptions extends StructuredOptions {
  /** 用于判断 length 是否由上下文窗口耗尽导致；未知时不要传。 */
  contextWindow?: number
  /** 每次尝试后回调，供路由与测试观察降级链走到哪一级。 */
  onAttempt?: (attempt: StructuredAttempt) => void
}

/** 去掉 Markdown 代码围栏；容忍 ```json / ```JSON / 裸 ```。 */
function stripCodeFence(input: string): string {
  const fenced = input.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)
  if (fenced && typeof fenced[1] === 'string') {
    return fenced[1]
  }
  return input
}

/** 截取首个 { 或 [ 到末个 } 或 ]；没有闭合符时截到结尾，交给后面的补全。 */
function sliceJsonCandidate(input: string): string {
  const text = input.trim()
  const starts = [text.indexOf('{'), text.indexOf('[')].filter((index) => index >= 0)
  if (starts.length === 0) {
    return text
  }
  const start = Math.min(...starts)
  const lastObject = text.lastIndexOf('}')
  const lastArray = text.lastIndexOf(']')
  const end = Math.max(lastObject, lastArray)
  if (end > start) {
    return text.slice(start, end + 1)
  }
  return text.slice(start)
}

function stripTrailingCommas(input: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char === undefined) {
      continue
    }
    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === ',') {
      let cursor = index + 1
      while (cursor < input.length && /\s/u.test(input[cursor] ?? '')) {
        cursor += 1
      }
      const next = input[cursor]
      if (next === '}' || next === ']') {
        continue
      }
    }
    result += char
  }

  return result
}

/** 补全未闭合的括号；不匹配的闭合符直接丢弃，避免整段解析失败。 */
function closeUnbalanced(input: string): string {
  const stack: string[] = []
  let result = ''
  let inString = false
  let escaped = false

  for (const char of input) {
    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === '{' || char === '[') {
      stack.push(char)
      result += char
      continue
    }
    if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '['
      if (stack[stack.length - 1] === expected) {
        stack.pop()
        result += char
      }
      continue
    }
    result += char
  }

  if (inString) {
    result += '"'
  }
  while (stack.length > 0) {
    result += stack.pop() === '{' ? '}' : ']'
  }
  return result
}

/**
 * 宽容解析：先直接 parse，失败后依次剥围栏、截取、去尾逗号、补括号、
 * 在完全没有双引号时把单引号换成双引号、把 Python 字面量换成 JSON 字面量。
 * 返回 undefined 表示实在解析不出来，由调用方走修复重试。
 */
export function parseJsonLoose(input: string): unknown {
  const attempts: string[] = []
  const trimmed = input.trim()
  attempts.push(trimmed)

  const withoutFence = stripCodeFence(trimmed).trim()
  attempts.push(withoutFence)

  const sliced = sliceJsonCandidate(withoutFence)
  attempts.push(sliced)

  let normalized = stripTrailingCommas(sliced)
  normalized = normalized
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
  if (!normalized.includes('"')) {
    normalized = normalized.replace(/'/g, '"')
  }
  attempts.push(normalized)
  attempts.push(closeUnbalanced(normalized))

  for (const candidate of attempts) {
    if (!candidate) {
      continue
    }
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // 试下一种修复方式
    }
  }
  return undefined
}

/** 严格解析：只接受完整合法的 JSON，宽容修复不参与这一级。 */
function parseStrictJson(input: string): unknown {
  const text = input.trim()
  if (text.length === 0) {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

interface IssueLike {
  path: readonly PropertyKey[]
  message: string
  code?: string
}

/** 把 Zod 错误压成「路径: 信息（错误码）」的多行文本，直接作为修复反馈。 */
function summarizeIssues(error: { issues: readonly IssueLike[] }): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '(root)'
      const code = issue.code ? ` (${issue.code})` : ''
      return `- ${path}: ${issue.message}${code}`
    })
    .join('\n')
}

function firstLine(text: string | undefined): string | undefined {
  if (!text) {
    return undefined
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
}

/** 捕获到的一段模型输出；长度成因跟着这段输出走，避免混合场景误报。 */
interface CapturedOutput {
  text: string
  finishReason: FinishReason
  lengthCause?: LengthCause
}

/** 所有响应里最长的一段原始文本；纯文本降级用它保住已生成的内容。 */
function pickPreservedOutput(
  outputs: readonly CapturedOutput[],
): CapturedOutput | undefined {
  let best: CapturedOutput | undefined
  let bestLength = 0
  for (const output of outputs) {
    const text = output.text.trim()
    const length = Array.from(text).length
    if (length > bestLength) {
      best = { ...output, text }
      bestLength = length
    }
  }
  return best
}

function ensureJsonInstruction(messages: readonly ChatMessage[]): ChatMessage[] {
  const hasJsonWord = messages.some((message) =>
    message.content.toLowerCase().includes('json'),
  )
  if (hasJsonWord) {
    return [...messages]
  }
  return [
    {
      role: 'system',
      content: '只输出合法 JSON，不要输出 JSON 之外的任何文字。',
    },
    ...messages,
  ]
}

const REPAIR_SYSTEM_HINT =
  '你上一次的输出没有通过结构校验。请只输出修正后的 JSON，不要解释，也不要使用 Markdown 代码围栏。'

function repairFeedback(issues: string | undefined): string {
  return `${REPAIR_SYSTEM_HINT}\n\n校验错误：\n${
    issues ?? '- (root): 输出不是可解析的 JSON'
  }`
}

const LEVEL_LABELS: Readonly<Record<StructuredAttemptLevel, string>> = {
  json_schema: 'json_schema 严格模式',
  json_object: 'json_object 模式',
  loose_parse: '宽容解析',
  repair: '修复重试',
  text: '纯文本降级',
}

function logAttempt(attempt: StructuredAttempt): void {
  const label = LEVEL_LABELS[attempt.level]
  const suffix = attempt.repair === undefined ? '' : ` 第 ${attempt.repair} 次`
  const reason = attempt.reason ? `：${attempt.reason}` : ''
  if (attempt.status === 'failed' || attempt.status === 'degraded') {
    console.warn(`[llm][structured] ${label}${suffix} ${attempt.status}${reason}`)
  } else {
    console.info(`[llm][structured] ${label}${suffix} ${attempt.status}${reason}`)
  }
}

/**
 * 执行完整的兜底链并返回结构化结果或纯文本降级结果。
 *
 * `fallbackToText: false` 时不会返回纯文本，而是抛 invalid_output；
 * 其余情况最终一定会返回一个用户可用的结果。
 */
export async function runStructuredOutcome<T>(
  provider: LLMProvider,
  req: ChatRequest,
  schema: ZodType<T>,
  opts: StructuredRunOptions = {},
): Promise<StructuredOutcome<T>> {
  // 产品口径是硬上限 2 次：即使调用方传了更大的值也不放行。
  const maxRepairAttempts = Math.min(
    2,
    Math.max(0, opts.maxRepairAttempts ?? 2),
  )
  const fallbackToText = opts.fallbackToText ?? true
  const attempts: StructuredAttempt[] = []
  const raws: CapturedOutput[] = []

  let callCount = 0
  let lastRaw = ''
  let lastIssues: string | undefined
  let lastProviderError: LlmError | undefined
  let finishReason: FinishReason = null
  let lastCallLengthCause: LengthCause | undefined

  const record = (attempt: StructuredAttempt): void => {
    attempts.push(attempt)
    logAttempt(attempt)
    opts.onAttempt?.(attempt)
  }

  const runChat = async (request: ChatRequest): Promise<ChatResult> => {
    callCount += 1
    const result = await provider.chat(request)
    if (result.finishReason !== null) {
      finishReason = result.finishReason
    }
    lastRaw = result.text
    lastCallLengthCause = undefined
    if (result.finishReason === 'length') {
      lastCallLengthCause = classifyLengthCause({
        ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
        ...(request.maxCompletionTokens !== undefined
          ? { maxCompletionTokens: request.maxCompletionTokens }
          : {}),
        usage: result.usage,
        ...(opts.contextWindow !== undefined
          ? { contextWindow: opts.contextWindow }
          : {}),
      })
    }
    if (result.text.trim().length > 0) {
      raws.push({
        text: result.text,
        finishReason: result.finishReason,
        ...(lastCallLengthCause !== undefined
          ? { lengthCause: lastCallLengthCause }
          : {}),
      })
    }
    return result
  }

  const validate = (
    parsed: unknown,
  ): { ok: true; data: T } | { ok: false; issues: string } => {
    const validation = schema.safeParse(parsed)
    if (validation.success) {
      return { ok: true, data: validation.data }
    }
    return { ok: false, issues: summarizeIssues(validation.error) }
  }

  const structuredResult = (
    data: T,
    output?: CapturedOutput,
  ): StructuredSuccess<T> => {
    const cause = output ? output.lengthCause : lastCallLengthCause
    return {
      kind: 'structured',
      data,
      attempts,
      finishReason: output ? output.finishReason : finishReason,
      ...(cause !== undefined ? { lengthCause: cause } : {}),
    }
  }

  /* ---------- 第 1 级：json_schema 严格模式 ---------- */
  if (req.jsonSchema) {
    const strictSchema = {
      ...req.jsonSchema,
      strict: req.jsonSchema.strict ?? true,
    }
    try {
      const result = await runChat({
        ...req,
        messages: [...req.messages],
        jsonSchema: strictSchema,
        jsonObject: undefined,
      })
      const parsed = parseStrictJson(result.text)
      if (parsed === undefined) {
        lastIssues = '- (root): 输出不是可解析的 JSON'
        record({
          level: 'json_schema',
          status: 'failed',
          call: callCount,
          reason: firstLine(lastIssues),
        })
      } else {
        const checked = validate(parsed)
        if (checked.ok) {
          record({ level: 'json_schema', status: 'success', call: callCount })
          return structuredResult(checked.data)
        }
        lastIssues = checked.issues
        record({
          level: 'json_schema',
          status: 'failed',
          call: callCount,
          reason: firstLine(lastIssues),
        })
      }
    } catch (error) {
      if (
        error instanceof LlmError &&
        (error.kind === 'invalid_input' || error.kind === 'invalid_output')
      ) {
        lastIssues = error.message
        lastProviderError = error
        record({
          level: 'json_schema',
          status: 'failed',
          call: callCount,
          reason: error.message,
        })
      } else {
        throw error
      }
    }
  } else {
    record({
      level: 'json_schema',
      status: 'skipped',
      reason: '请求未启用 json_schema',
    })
  }

  /* ---------- 第 2 级：json_object ---------- */
  const objectMessages = ensureJsonInstruction(req.messages)
  try {
    const result = await runChat({
      ...req,
      messages: objectMessages,
      jsonSchema: undefined,
      jsonObject: true,
    })
    const parsed = parseStrictJson(result.text)
    if (parsed === undefined) {
      lastIssues = '- (root): 输出不是可解析的 JSON'
      record({
        level: 'json_object',
        status: 'failed',
        call: callCount,
        reason: firstLine(lastIssues),
      })
    } else {
      const checked = validate(parsed)
      if (checked.ok) {
        record({ level: 'json_object', status: 'success', call: callCount })
        return structuredResult(checked.data)
      }
      lastIssues = checked.issues
      record({
        level: 'json_object',
        status: 'failed',
        call: callCount,
        reason: firstLine(lastIssues),
      })
    }
  } catch (error) {
    if (
      error instanceof LlmError &&
      (error.kind === 'invalid_input' || error.kind === 'invalid_output')
    ) {
      lastIssues = error.message
      lastProviderError = error
      record({
        level: 'json_object',
        status: 'failed',
        call: callCount,
        reason: error.message,
      })
    } else {
      throw error
    }
  }

  /* ---------- 第 3 级：宽容解析 ---------- */
  if (raws.length === 0) {
    record({
      level: 'loose_parse',
      status: 'skipped',
      reason: '没有可供宽容解析的原始输出',
    })
  } else {
    let looseIssues: string | undefined
    for (const raw of raws) {
      const parsed = parseJsonLoose(raw.text)
      if (parsed === undefined) {
        looseIssues = '- (root): 宽容解析后仍不是合法 JSON'
        continue
      }
      const checked = validate(parsed)
      if (checked.ok) {
        record({ level: 'loose_parse', status: 'success' })
        return structuredResult(checked.data, raw)
      }
      looseIssues = checked.issues
    }
    if (looseIssues !== undefined) {
      lastIssues = looseIssues
    }
    record({
      level: 'loose_parse',
      status: 'failed',
      reason: firstLine(lastIssues),
    })
  }

  /* ---------- 第 4 级：把 Zod 错误喂回模型，最多 2 次 ---------- */
  if (maxRepairAttempts === 0) {
    record({
      level: 'repair',
      status: 'skipped',
      reason: 'maxRepairAttempts 为 0',
    })
  } else {
    const repairMessages = [...objectMessages]
    if (lastRaw.trim().length > 0) {
      repairMessages.push({ role: 'assistant', content: lastRaw })
    }
    // json_object 若被模型拒绝，后续修复退回纯提示词模式，避免重复撞同一个 400。
    let useJsonObject = true

    for (let repair = 1; repair <= maxRepairAttempts; repair += 1) {
      repairMessages.push({ role: 'user', content: repairFeedback(lastIssues) })
      try {
        const result = await runChat({
          ...req,
          messages: [...repairMessages],
          jsonSchema: undefined,
          jsonObject: useJsonObject ? true : undefined,
        })
        repairMessages.push({ role: 'assistant', content: result.text })
        let parsed = parseStrictJson(result.text)
        if (parsed === undefined) {
          parsed = parseJsonLoose(result.text)
        }
        if (parsed === undefined) {
          lastIssues = '- (root): 输出不是可解析的 JSON'
        } else {
          const checked = validate(parsed)
          if (checked.ok) {
            record({
              level: 'repair',
              status: 'success',
              call: callCount,
              repair,
            })
            return structuredResult(checked.data)
          }
          lastIssues = checked.issues
        }
        record({
          level: 'repair',
          status: 'failed',
          call: callCount,
          repair,
          reason: firstLine(lastIssues),
        })
      } catch (error) {
        if (
          error instanceof LlmError &&
          (error.kind === 'invalid_input' || error.kind === 'invalid_output')
        ) {
          if (error.kind === 'invalid_input') {
            useJsonObject = false
          }
          lastIssues = error.message
          lastProviderError = error
          record({
            level: 'repair',
            status: 'failed',
            call: callCount,
            repair,
            reason: error.message,
          })
        } else {
          throw error
        }
      }
    }
  }

  // 全程没有拿到任何模型内容，且失败原因是请求参数类错误时，
  // 直接抛出原始错误，避免把「参数不合法」伪装成「纯文本降级」。
  if (raws.length === 0 && lastProviderError?.kind === 'invalid_input') {
    throw lastProviderError
  }

  /* ---------- 第 5 级：纯文本降级，保留已生成内容 ---------- */
  const preserved = pickPreservedOutput(raws)
  const text = preserved?.text ?? ''
  record({
    level: 'text',
    status: text.length > 0 ? 'degraded' : 'failed',
    reason:
      text.length > 0
        ? `保留 ${Array.from(text).length} 个字符的原始输出`
        : '所有响应都没有可保留的文本',
  })

  if (!fallbackToText) {
    throw createLlmError(
      'invalid_output',
      `模型输出在 ${maxRepairAttempts} 次修复后仍不符合结构要求。${
        lastIssues ?? ''
      }`,
      {
        cause: {
          raw: lastRaw.slice(0, 4000),
          issues: lastIssues,
          attempts: [...attempts],
          ...(preserved?.lengthCause !== undefined
            ? { lengthCause: preserved.lengthCause }
            : {}),
        },
      },
    )
  }

  return {
    kind: 'text',
    text,
    attempts,
    ...(lastIssues !== undefined ? { lastIssues } : {}),
    finishReason: preserved?.finishReason ?? finishReason,
    ...(preserved?.lengthCause !== undefined
      ? { lengthCause: preserved.lengthCause }
      : {}),
  }
}

/** 在 provider 上执行结构化调用；失败最终抛 invalid_output（可重试）。 */
export async function runStructured<T>(
  provider: LLMProvider,
  req: ChatRequest,
  schema: ZodType<T>,
  opts: StructuredOptions = {},
): Promise<T> {
  const outcome = await runStructuredOutcome(provider, req, schema, opts)
  if (outcome.kind === 'structured') {
    return outcome.data
  }

  const maxRepairAttempts = Math.min(
    2,
    Math.max(0, opts.maxRepairAttempts ?? 2),
  )
  throw createLlmError(
    'invalid_output',
    `模型输出在 ${maxRepairAttempts} 次修复后仍不符合结构要求。${
      outcome.lastIssues ?? ''
    }`,
    {
      cause: {
        raw: outcome.text.slice(0, 4000),
        issues: outcome.lastIssues,
        attempts: outcome.attempts,
        ...(outcome.lengthCause !== undefined
          ? { lengthCause: outcome.lengthCause }
          : {}),
        fallbackText: outcome.text,
      },
    },
  )
}
