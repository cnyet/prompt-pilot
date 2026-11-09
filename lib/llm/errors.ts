import { APIConnectionError, APIError, APIUserAbortError } from 'openai'
import { isRetryable, type ErrorKind, type LlmErrorShape, type TokenUsage } from './types'

/**
 * 方舟错误码分级与重试策略。
 *
 * 这一层只依赖厂商无关的 ErrorKind；具体 HTTP 状态码与方舟错误码
 * 的映射留在本文件内部，业务层只看到 LlmError.kind / retryable。
 */

export class LlmError extends Error implements LlmErrorShape {
  readonly kind: ErrorKind
  readonly code?: string
  readonly retryable: boolean
  override readonly cause?: unknown

  constructor(shape: LlmErrorShape) {
    super(shape.message)
    this.name = 'LlmError'
    this.kind = shape.kind
    this.code = shape.code
    this.retryable = shape.retryable
    this.cause = shape.cause
  }
}

export function createLlmError(
  kind: ErrorKind,
  message: string,
  options: { code?: string; cause?: unknown } = {},
): LlmError {
  return new LlmError({
    kind,
    message,
    retryable: isRetryable(kind),
    code: options.code,
    cause: options.cause,
  })
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** 从 OpenAI SDK 的 APIError 里尽量取出方舟错误码。 */
function extractErrorCode(error: APIError): string | undefined {
  const direct = readString(error.code) ?? readString(error.type)
  if (direct) {
    return direct
  }

  const body = error.error
  if (typeof body !== 'object' || body === null) {
    return undefined
  }
  const record = body as Record<string, unknown>
  const nested = record.error
  if (typeof nested === 'object' && nested !== null) {
    const nestedRecord = nested as Record<string, unknown>
    return readString(nestedRecord.code) ?? readString(nestedRecord.type)
  }
  return readString(record.code) ?? readString(record.type)
}

function isSensitiveContentCode(code: string | undefined): boolean {
  return Boolean(
    code &&
      (code.includes('InputTextSensitiveContentDetected') ||
        code.includes('OutputTextSensitiveContentDetected')),
  )
}

function isQuotaExceededCode(code: string | undefined): boolean {
  return Boolean(code && code.includes('QuotaExceeded'))
}

function isOverloadedCode(code: string | undefined): boolean {
  return Boolean(
    code &&
      (code.includes('ServerOverloaded') ||
        code.includes('RequestBurstTooFast') ||
        code.includes('ModelLoading') ||
        code.includes('NoAvailableService')),
  )
}

/** 按 HTTP 状态与方舟错误码分级。401/403/400 不重试，429/5xx 视具体码而定。 */
export function classifyHttpError(
  status: number | undefined,
  code: string | undefined,
  message: string,
  cause?: unknown,
): LlmError {
  const kind: ErrorKind =
    status === 401
      ? 'auth'
      : status === 403
        ? 'forbidden'
        : status === 400 || status === 404 || status === 422
          ? isSensitiveContentCode(code)
            ? 'content_filter'
            : 'invalid_input'
          : status === 429
            ? isQuotaExceededCode(code)
              ? 'quota_exceeded'
              : isOverloadedCode(code)
                ? 'overloaded'
                : 'rate_limited'
            : status !== undefined && status >= 500
              ? 'server'
              : 'unknown'

  return new LlmError({
    kind,
    code,
    message: userMessageFor(kind, code, message),
    retryable: isRetryable(kind),
    cause,
  })
}

/** 把任意异常收敛成 LlmError；中止信号优先于其他判断。 */
export function classifyError(error: unknown, signal?: AbortSignal): LlmError {
  if (error instanceof LlmError) {
    return error
  }
  if (signal?.aborted) {
    return createLlmError('aborted', '请求已取消。', { cause: error })
  }
  if (error instanceof APIUserAbortError) {
    return createLlmError('aborted', '请求已取消。', { cause: error })
  }
  if (error instanceof APIConnectionError) {
    return createLlmError('network', '无法连接方舟，请检查网络与端点配置。', {
      cause: error,
    })
  }
  if (error instanceof APIError) {
    return classifyHttpError(
      error.status,
      extractErrorCode(error),
      error.message,
      error,
    )
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return createLlmError('aborted', '请求已取消。', { cause: error })
  }

  const message = error instanceof Error ? error.message : String(error)
  return createLlmError('unknown', `模型调用失败：${message}`, { cause: error })
}

/** 给用户看的中文文案；原始错误码与厂商消息保留在 code / cause 里。 */
export function userMessageFor(
  kind: ErrorKind,
  code: string | undefined,
  raw: string,
): string {
  const suffix = code ? `（${code}）` : ''
  switch (kind) {
    case 'auth':
      return `认证失败${suffix}：请检查 ARK_API_KEY 是否正确、是否已过期。`
    case 'forbidden':
      return `无权访问该模型${suffix}：请确认模型已开通、账号未欠费。原始信息：${raw}`
    case 'invalid_input':
      return `请求参数不合法${suffix}：${raw}`
    case 'content_filter':
      return `输入或输出触发内容安全策略${suffix}：请改写输入后重试。`
    case 'rate_limited':
      return `请求被限流${suffix}：正在退避重试；持续失败请降低并发或提升配额。`
    case 'quota_exceeded':
      return `额度已用尽${suffix}：请充值或调整配额后重试。`
    case 'overloaded':
      return `服务繁忙${suffix}：请稍后重试；持续失败请放缓流量增长速度。`
    case 'server':
      return `方舟服务端错误${suffix}：可稍后重试。原始信息：${raw}`
    case 'network':
      return `网络错误${suffix}：无法连接方舟，请检查网络与端点配置。`
    case 'aborted':
      return '请求已取消。'
    case 'invalid_output':
      return `模型输出不合法${suffix}：${raw}`
    default:
      return `模型调用失败${suffix}：${raw}`
  }
}

/** SSE error 事件使用的稳定错误码，前端按这个码决定文案与是否重试。 */
export function errorCodeForKind(kind: ErrorKind): string {
  switch (kind) {
    case 'auth':
      return 'LLM_AUTH'
    case 'forbidden':
      return 'LLM_FORBIDDEN'
    case 'invalid_input':
      return 'LLM_INVALID_INPUT'
    case 'content_filter':
      return 'LLM_CONTENT_FILTER'
    case 'rate_limited':
      return 'LLM_RATE_LIMITED'
    case 'quota_exceeded':
      return 'LLM_QUOTA_EXCEEDED'
    case 'overloaded':
      return 'LLM_OVERLOADED'
    case 'server':
      return 'LLM_SERVER'
    case 'network':
      return 'LLM_NETWORK'
    case 'aborted':
      return 'LLM_ABORTED'
    case 'invalid_output':
      return 'LLM_INVALID_OUTPUT'
    default:
      return 'LLM_UNKNOWN'
  }
}

/* ---------- finish_reason = "length" 的成因 ---------- */

export type LengthCause =
  | 'max_tokens'
  | 'max_completion_tokens'
  | 'context_window'
  | 'unknown'

export interface LengthCauseInput {
  maxTokens?: number
  maxCompletionTokens?: number
  usage?: Pick<TokenUsage, 'tokensIn' | 'tokensOut' | 'reasoningTokens'>
  contextWindow?: number
}

/**
 * 区分 length 的三种成因。
 *
 * 方舟不在响应里直接给出原因，只能靠「用量是否顶到某个上限」反推：
 * - max_tokens 不包含思维链，所以用「输出 token - 思维链 token」比较；
 * - max_completion_tokens 包含思维链，直接比输出 token；
 * - 两者都没顶到、但输入加输出接近上下文窗口，才归因到上下文窗口。
 *
 * 拿不到 usage、或三项都对不上时返回 unknown，不猜。
 */
export function classifyLengthCause(input: LengthCauseInput): LengthCause {
  const usage = input.usage
  if (!usage) {
    return 'unknown'
  }

  const reasoning = Math.max(0, usage.reasoningTokens ?? 0)
  const visibleOutput = Math.max(0, usage.tokensOut - reasoning)

  if (
    input.maxTokens !== undefined &&
    input.maxTokens > 0 &&
    visibleOutput >= input.maxTokens
  ) {
    return 'max_tokens'
  }
  if (
    input.maxCompletionTokens !== undefined &&
    input.maxCompletionTokens > 0 &&
    usage.tokensOut >= input.maxCompletionTokens
  ) {
    return 'max_completion_tokens'
  }
  if (
    input.contextWindow !== undefined &&
    input.contextWindow > 0 &&
    usage.tokensIn + usage.tokensOut >= input.contextWindow
  ) {
    return 'context_window'
  }

  return 'unknown'
}

/** 日志与错误提示共用的一句话，确保三种成因口径一致。 */
export function describeLengthCause(cause: LengthCause): string {
  switch (cause) {
    case 'max_tokens':
      return '输出达到 max_tokens 上限（不含思维链），可调大 maxTokens 后重试。'
    case 'max_completion_tokens':
      return '输出达到 max_completion_tokens 上限（含思维链），可调大 maxCompletionTokens 后重试。'
    case 'context_window':
      return '输入加输出达到模型上下文窗口上限，请缩短输入或换用长上下文模型。'
    default:
      return '输出被截断，但无法从响应中判断是哪个上限导致（usage 缺失或未达已知上限）。'
  }
}

/* ---------- 退避重试 ---------- */

export interface RetryOptions {
  /** 总尝试次数，默认 3。 */
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

export function backoffDelay(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'random'> = {},
): number {
  const base = options.baseDelayMs ?? 500
  const max = options.maxDelayMs ?? 8_000
  const random = options.random ?? Math.random
  const exponential = Math.min(max, base * 2 ** Math.max(0, attempt - 1))
  // 加 20% 抖动，避免同一时刻的多个请求一起重试；抖动后再夹一次上限。
  return Math.min(max, Math.round(exponential * (0.8 + random() * 0.4)))
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * 只对可重试错误做指数退避。
 * 401/403/400/QuotaExceeded 在 classifyError 后 retryable=false，会直接抛出。
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  classify: (error: unknown) => LlmError,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const sleep = options.sleep ?? defaultSleep

  let attempt = 1
  while (true) {
    try {
      return await operation(attempt)
    } catch (error) {
      const llmError = classify(error)
      if (!llmError.retryable || attempt >= maxAttempts) {
        throw llmError
      }
      await sleep(
        backoffDelay(attempt, {
          baseDelayMs: options.baseDelayMs,
          maxDelayMs: options.maxDelayMs,
          random: options.random,
        }),
      )
      attempt += 1
    }
  }
}
