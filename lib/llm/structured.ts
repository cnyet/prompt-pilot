import type { ZodType } from 'zod'
import { LlmError, createLlmError } from './errors'
import type {
  ChatMessage,
  ChatRequest,
  LLMProvider,
  StructuredOptions,
} from './types'

/**
 * 结构化输出的健壮性链：
 *   json_schema（能走就走）→ json_object → 宽容解析 → Zod 校验 → 修复重试 → 纯文本降级。
 *
 * 方舟的 json_schema 仍是 beta，且 strict 对 required / additionalProperties 有要求，
 * 所以第一跳失败（400 参数类）时自动降级到 json_object，而不是把错误抛给用户。
 */

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

function summarizeIssues(error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '(root)'
      return `- ${path}: ${issue.message}`
    })
    .join('\n')
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

/** 在 provider 上执行结构化调用；失败最终抛 invalid_output（可重试）。 */
export async function runStructured<T>(
  provider: LLMProvider,
  req: ChatRequest,
  schema: ZodType<T>,
  opts: StructuredOptions = {},
): Promise<T> {
  const maxRepairAttempts = Math.max(0, opts.maxRepairAttempts ?? 2)
  const fallbackToText = opts.fallbackToText ?? true

  let messages: ChatMessage[] = [...req.messages]
  let mode: 'schema' | 'object' | 'text' = req.jsonSchema
    ? 'schema'
    : req.jsonObject
      ? 'object'
      : 'text'
  let repairs = 0
  let lastRaw = ''
  let lastIssues: string | undefined

  // 每轮最多一次调用；上限给 schema→object 降级与 text 降级留出余量。
  const maxCalls = maxRepairAttempts + 4
  for (let call = 0; call < maxCalls; call += 1) {
    if (mode === 'object') {
      messages = ensureJsonInstruction(messages)
    }

    const request: ChatRequest = {
      ...req,
      messages,
      jsonSchema: mode === 'schema' ? req.jsonSchema : undefined,
      jsonObject: mode === 'object' ? true : undefined,
    }

    let result
    try {
      result = await provider.chat(request)
    } catch (error) {
      if (
        mode === 'schema' &&
        error instanceof LlmError &&
        error.kind === 'invalid_input'
      ) {
        // json_schema 不被支持或 schema 关键字被拒绝，降级到 json_object。
        mode = 'object'
        continue
      }
      throw error
    }

    lastRaw = result.text
    const parsed = parseJsonLoose(result.text)
    if (parsed !== undefined) {
      const validation = schema.safeParse(parsed)
      if (validation.success) {
        return validation.data
      }
      lastIssues = summarizeIssues(validation.error)
    } else {
      lastIssues = '- (root): 输出不是可解析的 JSON'
    }

    if (repairs < maxRepairAttempts) {
      repairs += 1
      messages = [
        ...messages,
        { role: 'assistant', content: result.text },
        {
          role: 'user',
          content: `${REPAIR_SYSTEM_HINT}\n\n校验错误：\n${lastIssues}`,
        },
      ]
      continue
    }

    if (fallbackToText && mode !== 'text') {
      // 最后一跳：关掉 response_format，只靠提示词要求 JSON，再宽容解析一次。
      mode = 'text'
      messages = ensureJsonInstruction([
        ...messages,
        { role: 'assistant', content: lastRaw },
        {
          role: 'user',
          content: `请把上面的内容修正为合法 JSON 后重新输出，只输出 JSON 本身。\n\n校验错误：\n${lastIssues ?? ''}`,
        },
      ])
      continue
    }

    break
  }

  throw createLlmError(
    'invalid_output',
    `模型输出在 ${maxRepairAttempts} 次修复后仍不符合结构要求。${lastIssues ?? ''}`,
    {
      cause: {
        raw: lastRaw.slice(0, 4000),
        issues: lastIssues,
      },
    },
  )
}
