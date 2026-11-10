import { z } from 'zod'
import {
  ComposeInputError,
  MAX_REQUIREMENT_LENGTH,
  composePrompt,
} from '@/lib/engine/compose'
import { renderFieldSegments } from '@/lib/engine/render'
import {
  SSE_HEADERS,
  encodeSseEvent,
  isFieldKey,
  type SseMessage,
} from '@/lib/engine/sse'
import {
  FIELD_KEYS,
  FIELD_LABELS,
  OUTPUT_FORMATS,
  PromptPilotSchemaV1,
  createSkeletonSchema,
  type FieldKey,
  type OutputFormat,
  type PromptSchema,
} from '@/lib/engine/schema'
import {
  LlmError,
  createLlmError,
  describeLengthCause,
  errorCodeForKind,
} from '@/lib/llm/errors'
import {
  DEFAULT_GENERATE_MODEL_CONFIG_ID,
  getGenerateProvider,
  getModelConfig,
} from '@/lib/llm/registry'
import {
  instrumentProvider,
  resolveTraceId,
  type LlmCallContext,
} from '@/lib/llm/ledger'
import {
  parseJsonLoose,
  runStructuredOutcome,
  type StructuredAttempt,
  type StructuredFallback,
} from '@/lib/llm/structured'
import {
  StreamingJsonParser,
  type JsonPathSegment,
  type StreamingJsonEvent,
} from '@/lib/llm/streaming-json'
import type { ChatRequest, LLMProvider, TokenUsage } from '@/lib/llm/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fieldKeySchema = z.custom<FieldKey>((value) => isFieldKey(value), {
  message: '未知字段',
})

const requestSchema = z.object({
  input: z
    .string()
    .trim()
    .min(2, '需求至少需要 2 个字符。')
    .max(MAX_REQUIREMENT_LENGTH, `需求不能超过 ${MAX_REQUIREMENT_LENGTH} 个字符。`),
  fields: z
    .array(fieldKeySchema)
    .min(1, '至少选择一个字段。')
    .optional(),
  /** 客户端幂等键；缺省时服务端为本次请求生成 traceId。 */
  requestId: z.string().trim().max(128).optional(),
})

interface FetchAttemptCounter {
  fetch: typeof globalThis.fetch
  count: () => number
}

/**
 * 统计本次请求实际发出的 HTTP 次数，用于把 provider 内部 withRetry 的
 * 重试次数落到 LlmCall.attempts。provider 不暴露 attempts，只能在
 * createProvider 注入的 fetch 上计数，不修改适配层。
 */
function createFetchAttemptCounter(): FetchAttemptCounter {
  let count = 0
  const countedFetch: typeof globalThis.fetch = (input, init) => {
    count += 1
    return globalThis.fetch(input, init)
  }
  return { fetch: countedFetch, count: () => count }
}

interface ProviderIdentity {
  provider: string
  modelId: string
  contextWindow?: number
}

/** 从 provider.id 反查模型配置；Mock 故障画像复用 mock 配置。 */
function describeProvider(provider: LLMProvider): ProviderIdentity {
  const config =
    getModelConfig(provider.id) ??
    (provider.id.startsWith('mock') ? getModelConfig('mock') : undefined)
  const contextWindow = config?.contextWindow
  return {
    provider: config?.provider ?? provider.id,
    modelId: config?.modelId ?? provider.id,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
  }
}

function jsonError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  detail?: unknown,
): Response {
  return new Response(JSON.stringify({ code, message, detail, retryable }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/** 真实模型生成时使用的系统提示词。要求只输出 PromptPilot Schema v1 的 JSON。 */
const MODEL_COMPOSE_SYSTEM_PROMPT = `你是 PromptPilot 的提示词架构师。把用户的一句话需求扩写成一份可直接使用的高质量提示词。
严格只输出一个 JSON 对象，结构必须符合 PromptPilot Schema v1：
{
  "schemaVersion": "pp-schema-v1",
  "meta": { "title": "...", "taskType": "qa|writing|coding|analysis|extraction|conversation|planning|transformation|other", "language": "zh|en|auto", "mode": "generate|improve", "templateId": "ark-compose-v1" },
  "assumptions": [{ "path": "...", "label": "...", "value": "...", "candidates": ["..."], "source": "default|inferred|user" }],
  "role": { "persona": "...", "expertise": "...", "stance": "..." },
  "objective": { "goal": "...", "successCriteria": ["..."], "nonGoals": ["..."] },
  "context": { "background": "...", "audience": "...", "knownFacts": ["..."], "missingInputPolicy": "..." },
  "input": { "variables": [] },
  "constraints": {
    "must": ["..."],
    "mustNot": ["..."],
    "boundaries": { "scopeIn": ["..."], "scopeOut": ["..."], "knowledgePolicy": "...", "ambiguityPolicy": "...", "formatBoundary": "...", "safetyBoundary": "..." },
    "priority": ["..."]
  },
  "output": { "format": "markdown|json|yaml|table|plain|code|xml", "sections": ["..."], "length": "...", "language": "...", "tone": "..." },
  "examples": { "items": [], "negative": [{ "input": "...", "badOutput": "...", "why": "..." }] },
  "selfCheck": { "checklist": ["..."], "onFail": "..." }
}
硬性要求：
- 只输出 JSON 本身，不要 Markdown 围栏、解释或前后缀。
- role / objective / context / input / constraints / output / examples / selfCheck 八个字段必须齐全。
- constraints.boundaries 六项必须具体、可核对，不能留空字符串。
- 所有内容使用输出语言；需求是中文时使用中文。
- 不编造需求中没有的事实；不确定的信息写进 assumptions 与 context.missingInputPolicy。
- meta.title 为 2 到 28 个字符，meta.templateId 固定为 "ark-compose-v1"。
- 输出只包含提示词本身，不包含对用户的对话式回复。`

/** 生成 PromptPilot Schema v1 的 JSON Schema，去掉方舟不一定认的 $schema 声明。 */
function promptPilotJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(PromptPilotSchemaV1) as Record<string, unknown>
  const schema = { ...generated }
  delete schema.$schema
  return schema
}

function buildModelChatRequest(input: string): ChatRequest {
  return {
    modelConfigId: DEFAULT_GENERATE_MODEL_CONFIG_ID,
    messages: [
      { role: 'system', content: MODEL_COMPOSE_SYSTEM_PROMPT },
      { role: 'user', content: `用户需求：\n${input}` },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    // 提示词优化是结构化改写，不是多步推理；显式关闭思维链。
    thinking: 'off',
    jsonSchema: {
      name: 'promptpilot_schema_v1',
      schema: promptPilotJsonSchema(),
      // 先按严格模式探测；方舟若拒绝 beta 的 strict 关键字，
      // runStructuredOutcome 会自动降级到 json_object，不把 400 抛给用户。
      strict: true,
    },
  }
}

/** 把尝试链写成一句可核对的话，用于最终故障提示。 */
function describeAttemptedChain(attempts: readonly StructuredAttempt[]): string {
  const failedLevels = new Set(
    attempts
      .filter(
        (attempt) =>
          attempt.status === 'failed' || attempt.status === 'degraded',
      )
      .map((attempt) => attempt.level),
  )
  const parts: string[] = []
  if (failedLevels.has('json_schema')) {
    parts.push('严格 JSON 模式')
  }
  if (failedLevels.has('json_object')) {
    parts.push('JSON 模式')
  }
  if (failedLevels.has('loose_parse')) {
    parts.push('宽容解析')
  }
  const repairs = attempts.filter(
    (attempt) => attempt.level === 'repair' && attempt.status === 'failed',
  ).length
  if (repairs > 0) {
    parts.push(`${repairs} 次修复`)
  }
  return parts.join('、')
}

function firstIssueLine(issues: string | undefined): string | undefined {
  if (!issues) {
    return undefined
  }
  const line = issues
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
  return line?.replace(/^-\s*/, '')
}

function truncationReason(fallback: StructuredFallback): string {
  if (!fallback.lengthCause) {
    return ''
  }
  return `模型输出被截断，${describeLengthCause(fallback.lengthCause)}`
}

/**
 * 纯文本降级的三段式提示：发生了什么 / 为什么 / 怎么办。
 * 不出现感叹号与 em dash，避免界面语气失控。
 */
function structuredFallbackNotice(
  fallback: StructuredFallback,
  fieldLabel: string,
): string {
  const chars = Array.from(fallback.text).length
  const what =
    chars > 0
      ? `发生了什么：结构化生成失败，已降级为纯文本，保留的 ${chars} 个字符已写入「${fieldLabel}」字段。`
      : '发生了什么：结构化生成失败，已降级为纯文本，但没有可保留的内容。'

  const chain = describeAttemptedChain(fallback.attempts)
  const chainPrefix = chain ? `系统依次尝试了${chain}，均未通过。` : ''
  const issueLine = firstIssueLine(fallback.lastIssues)
  const why = fallback.lengthCause
    ? `为什么：${truncationReason(fallback)}`
    : `为什么：${chainPrefix}模型输出不符合 PromptPilot Schema${
        issueLine ? `，最后一次校验错误是 ${issueLine}` : ''
      }。`

  const how = fallback.lengthCause
    ? '怎么办：按上面的建议调整输出上限后点击“重试未生成字段”；已保留的内容可以先手动整理。'
    : '怎么办：点击“重试未生成字段”重新生成，或先用已保留的内容手动整理；反复失败时请换用支持 JSON 输出的模型。'

  return `${what}${why}${how}`
}

/** 统一清掉感叹号与 em dash，保证所有用户可见提示的语气与格式一致。 */
function sanitizeNotice(text: string): string {
  return text.replace(/[!！]/g, '。').replace(/—+/g, '，')
}

/** provider 层错误（限流、额度、认证等）的三段式提示。 */
function providerFailureNotice(error: LlmError): string {
  const detail = error.code ? `（${error.code}）` : ''
  switch (error.kind) {
    case 'rate_limited':
      return `发生了什么：模型调用被限流${detail}。为什么：当前请求频率超过账号或模型的限流阈值。怎么办：等待片刻后点击重试，持续失败时请降低并发生成频率或提升配额。`
    case 'quota_exceeded':
      return `发生了什么：模型调用失败，额度已用尽${detail}。为什么：当前账号的调用额度不足或已到期。怎么办：充值或调整配额后点击重试。`
    case 'overloaded':
      return `发生了什么：模型服务繁忙${detail}。为什么：当前时段请求量过高，服务暂时无法承接。怎么办：稍等片刻后点击重试，持续失败时请放缓生成节奏。`
    case 'auth':
      return `发生了什么：模型认证失败${detail}。为什么：ARK_API_KEY 缺失、错误或已过期。怎么办：在设置页检查密钥后重新生成。`
    case 'forbidden':
      return `发生了什么：无权访问该模型${detail}。为什么：模型未开通或账号欠费。怎么办：确认模型已开通并结清欠费后重试。`
    case 'content_filter':
      return `发生了什么：输入或输出触发内容安全策略${detail}。为什么：内容命中平台安全规则。怎么办：改写需求中可能敏感的表述后重试。`
    case 'network':
      return `发生了什么：无法连接模型服务${detail}。为什么：网络不通或端点配置错误。怎么办：检查网络与端点配置后重试。`
    case 'server':
      return `发生了什么：模型服务端错误${detail}。为什么：服务端出现临时故障。怎么办：稍后点击重试。`
    case 'invalid_input':
      return `发生了什么：模型请求参数不合法${detail}。为什么：当前模型不接受本次请求的某个参数。怎么办：换用支持结构化输出的模型，或去掉相关参数后重试。`
    case 'invalid_output':
      return `发生了什么：模型没有返回可用内容${detail}。为什么：模型输出为空或不符合协议。怎么办：点击重试，反复失败时请换用其他模型。`
    case 'aborted':
      return '请求已取消。'
    default:
      return `发生了什么：模型调用失败${detail}。为什么：${error.message}。怎么办：稍后点击重试，持续失败时请检查服务日志。`
  }
}

interface ProviderStreamOptions {
  request: Request
  provider: LLMProvider
  input: string
  selected: FieldKey[]
  startedAt: number
}

function isStreamField(value: JsonPathSegment | undefined): value is FieldKey {
  return typeof value === 'string' && isFieldKey(value)
}

function pathToString(path: readonly JsonPathSegment[]): string {
  return path.map((segment) => String(segment)).join('.')
}

/** 数组对象内部的叶子（例如 examples.items.0.input）等整个对象闭合再处理。 */
function hasNumericInternal(path: readonly JsonPathSegment[]): boolean {
  return path.some(
    (segment, index) => typeof segment === 'number' && index < path.length - 1,
  )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOutputFormat(value: unknown): value is OutputFormat {
  return (
    typeof value === 'string' &&
    (OUTPUT_FORMATS as readonly string[]).includes(value)
  )
}

/** 把增量解析出来的值写进 partial 树；数组用数字下标表示。 */
function setStreamValue(
  root: Record<string, unknown>,
  path: readonly JsonPathSegment[],
  value: unknown,
): void {
  if (path.length === 0) {
    return
  }

  let node: Record<string, unknown> | unknown[] = root
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const next = path[index + 1]
    if (segment === undefined || next === undefined) {
      return
    }

    if (typeof segment === 'number') {
      if (!Array.isArray(node) || !(segment in node)) {
        return
      }
      const current: unknown = node[segment]
      if (isPlainRecord(current) || Array.isArray(current)) {
        node = current
      }
      continue
    }

    if (Array.isArray(node)) {
      return
    }
    if (node[segment] === undefined) {
      node[segment] = typeof next === 'number' ? [] : {}
    }
    const current: unknown = node[segment]
    if (!isPlainRecord(current) && !Array.isArray(current)) {
      return
    }
    node = current
  }

  const last = path[path.length - 1]
  if (last === undefined) {
    return
  }
  if (Array.isArray(node)) {
    if (typeof last === 'number') {
      node[last] = value
    }
    return
  }
  if (typeof last === 'string') {
    node[last] = value
  }
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** 用增量数据覆盖骨架；只覆盖已经到达的键，未到达的保留骨架默认值。 */
function mergeStreamValue(base: unknown, extra: unknown): unknown {
  if (extra === undefined) {
    return base
  }
  if (Array.isArray(base) && Array.isArray(extra)) {
    return extra.map((item) => mergeStreamValue(undefined, item))
  }
  if (isPlainRecord(base) && isPlainRecord(extra)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(extra)) {
      if (UNSAFE_KEYS.has(key)) {
        continue
      }
      merged[key] = mergeStreamValue(base[key], value)
    }
    return merged
  }
  return extra
}

/** 整段解析的本地一级：宽容解析加 Zod 校验，不额外调用模型。 */
function parseWholeOutput(raw: string): PromptSchema | null {
  const parsed = parseJsonLoose(raw)
  if (parsed === undefined) {
    return null
  }
  const checked = PromptPilotSchemaV1.safeParse(parsed)
  return checked.success ? checked.data : null
}

/** 有 Key 的分支：消费 provider.stream()，边解析边把字段增量吐给前端。 */
function streamFromProvider(options: ProviderStreamOptions): Response {
  const { request, provider, input, selected, startedAt } = options
  const modelConfig = getModelConfig(DEFAULT_GENERATE_MODEL_CONFIG_ID)
  const contextWindow = modelConfig?.contextWindow
  const modelId = modelConfig?.modelId
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) {
          return
        }
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端可能已经断开
        }
      }

      const enqueue = (message: SseMessage) => {
        if (closed || request.signal.aborted) {
          return
        }
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(message)))
        } catch {
          closed = true
        }
      }

      const onAbort = () => {
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端已断开
        }
      }
      request.signal.addEventListener('abort', onAbort, { once: true })

      let stageOpen = false
      const closeStage = (label: string) => {
        if (!stageOpen) {
          return
        }
        stageOpen = false
        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'done', label },
        })
      }

      /* ---------- 流式生成状态 ---------- */
      const parser = new StreamingJsonParser()
      const skeleton = createSkeletonSchema('生成中')
      const partial: Record<string, unknown> = {}
      const closedPaths = new Set<string>()
      const descendantAncestors = new Set<string>()
      const emittedText = new Map<FieldKey, string>()
      let openField: FieldKey | null = null
      let usage: TokenUsage | undefined
      let usageEmitted = false
      let raw = ''

      /** 记下已闭合的 JSON 路径；同时记录祖先，供「数组头已可渲染」判断。 */
      const markClosed = (path: readonly JsonPathSegment[]) => {
        if (path.length === 0) {
          return
        }
        closedPaths.add(pathToString(path))
        for (let index = 1; index < path.length; index += 1) {
          descendantAncestors.add(pathToString(path.slice(0, index)))
        }
      }

      /**
       * 一个渲染片段是否已经稳定：路径本身闭合、祖先闭合，
       * 或者它下面已有闭合的子路径（数组头在首项到达后即可先出）。
       */
      const isSettled = (segmentPath: string): boolean => {
        if (closedPaths.has(segmentPath)) {
          return true
        }
        if (descendantAncestors.has(segmentPath)) {
          return true
        }
        const parts = segmentPath.split('.')
        for (let index = 1; index < parts.length; index += 1) {
          if (closedPaths.has(parts.slice(0, index).join('.'))) {
            return true
          }
        }
        return false
      }

      /** 按 renderFieldSegments 的顺序，取最长的连续稳定片段前缀。 */
      const renderStableSegments = (
        field: FieldKey,
      ): { path: string; text: string }[] => {
        const schema = mergeStreamValue(skeleton, partial) as PromptSchema
        const segments: { path: string; text: string }[] = []
        for (const segment of renderFieldSegments(schema, field)) {
          if (!isSettled(segment.path)) {
            break
          }
          segments.push({ path: segment.path, text: segment.text })
        }
        return segments
      }

      const openFieldFor = (field: FieldKey) => {
        if (openField === field) {
          return
        }
        if (openField !== null) {
          enqueue({ event: 'field', data: { path: openField, status: 'done' } })
        }
        enqueue({ event: 'field', data: { path: field, status: 'start' } })
        openField = field
      }

      const closeOpenField = () => {
        if (openField === null) {
          return
        }
        const field = openField
        openField = null
        enqueue({ event: 'field', data: { path: field, status: 'done' } })
      }

      /** 从片段序列里切掉已经流出的字符，保持每段自己的点号路径。 */
      const sliceSegments = (
        segments: readonly { path: string; text: string }[],
        skipChars: number,
      ): { path: string; text: string }[] => {
        let remaining = skipChars
        const pieces: { path: string; text: string }[] = []
        for (const segment of segments) {
          if (remaining >= segment.text.length) {
            remaining -= segment.text.length
            continue
          }
          const text =
            remaining > 0 ? segment.text.slice(remaining) : segment.text
          remaining = 0
          if (text.length > 0) {
            pieces.push({ path: segment.path, text })
          }
        }
        return pieces
      }

      /** 按片段逐条发 delta，路径与离线路径的 role.persona 风格一致。 */
      const emitSegments = (
        field: FieldKey,
        pieces: readonly { path: string; text: string }[],
      ) => {
        if (pieces.length === 0) {
          return
        }
        openFieldFor(field)
        for (const piece of pieces) {
          enqueue({ event: 'delta', data: { path: piece.path, text: piece.text } })
        }
      }

      /** 纯文本降级没有结构化路径，直接挂到字段路径上。 */
      const emitFieldText = (field: FieldKey, text: string) => {
        if (text.length === 0) {
          return
        }
        openFieldFor(field)
        enqueue({ event: 'delta', data: { path: field, text } })
        emittedText.set(field, (emittedText.get(field) ?? '') + text)
      }

      /**
       * 每次有字段值闭合就重渲染该字段，只追加「稳定前缀」超出的部分。
       * 这样既保持 renderFieldSegments 的顺序，也不会把未闭合的占位内容提前吐出。
       */
      const refreshField = (field: FieldKey) => {
        const segments = renderStableSegments(field)
        const stable = segments.map((segment) => segment.text).join('')
        const already = emittedText.get(field) ?? ''
        if (stable.length <= already.length || !stable.startsWith(already)) {
          return
        }
        emitSegments(field, sliceSegments(segments, already.length))
        emittedText.set(field, stable)
      }

      const handleEvent = (event: StreamingJsonEvent) => {
        const head = event.path[0]
        if (!isStreamField(head)) {
          return
        }
        const field = head

        if (event.kind === 'value') {
          // 数组对象内部的叶子要等整个对象闭合，避免渲染出半截对象。
          if (event.path.length < 2 || hasNumericInternal(event.path)) {
            return
          }
          if (event.value === null) {
            return
          }
          if (
            event.path.length === 2 &&
            event.path[0] === 'output' &&
            event.path[1] === 'format' &&
            !isOutputFormat(event.value)
          ) {
            return
          }
          setStreamValue(partial, event.path, event.value)
          markClosed(event.path)
          refreshField(field)
          return
        }

        if (event.path.length === 0) {
          return
        }
        // 输出格式不在枚举内时不要用骨架默认值冒充模型结果；
        // 交给整体解析判断，失败后走兜底链。
        if (
          event.path.length === 1 &&
          field === 'output' &&
          isPlainRecord(event.value) &&
          event.value.format !== undefined &&
          !isOutputFormat(event.value.format)
        ) {
          return
        }
        setStreamValue(partial, event.path, event.value)
        markClosed(event.path)
        refreshField(field)
        if (event.path.length === 1 && openField === field) {
          closeOpenField()
        }
      }

      const emitUsage = (value: TokenUsage | undefined) => {
        if (!value || usageEmitted) {
          return
        }
        const hasDetail =
          value.costCny !== undefined ||
          value.cachedTokens !== undefined ||
          value.reasoningTokens !== undefined
        if (!hasDetail && value.tokensIn === 0 && value.tokensOut === 0) {
          // 完全拿不到用量时不发 usage，界面会显示「未知」而不是 0。
          return
        }
        usageEmitted = true
        enqueue({
          event: 'usage',
          data: {
            tokensIn: value.tokensIn,
            tokensOut: value.tokensOut,
            ...(value.cachedTokens !== undefined
              ? { cachedTokens: value.cachedTokens }
              : {}),
            ...(value.reasoningTokens !== undefined
              ? { reasoningTokens: value.reasoningTokens }
              : {}),
            ...(value.costCny !== undefined ? { costCny: value.costCny } : {}),
            ...(modelId ? { model: modelId } : {}),
          },
        })
      }

      /**
       * 收口结构化结果。
       * 已流出的内容视为前缀：只有最终渲染以它为前缀时才补差值，
       * 否则保留已流出的内容，绝不重放整段造成重复。
       */
      const finalizeStructured = (
        schema: PromptSchema,
        usageToShow: TokenUsage | undefined,
      ) => {
        const plans = selected.map((field) => ({
          field,
          text: renderFieldSegments(schema, field)
            .map((segment) => segment.text)
            .join(''),
        }))

        for (const plan of plans) {
          const already = emittedText.get(plan.field) ?? ''
          if (
            plan.text.length > already.length &&
            plan.text.startsWith(already)
          ) {
            const segments = renderFieldSegments(schema, plan.field).map(
              (segment) => ({ path: segment.path, text: segment.text }),
            )
            emitSegments(plan.field, sliceSegments(segments, already.length))
            emittedText.set(plan.field, plan.text)
          }
          if (openField === plan.field) {
            closeOpenField()
          }
        }
        closeOpenField()
        emitUsage(usageToShow)
        closeStage('结构生成完成')
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'stop',
            title: schema.meta.title,
            assumptions: schema.assumptions,
          },
        })
      }

      /** 纯文本降级：优先写进还没有流式内容的字段，绝不清空已流出内容。 */
      const finalizeFallbackText = (fallback: StructuredFallback) => {
        const first = selected[0] ?? 'role'
        const target =
          selected.find(
            (field) => (emittedText.get(field) ?? '').length === 0,
          ) ?? first
        const fieldLabel = FIELD_LABELS[target]

        if (fallback.text.length > 0) {
          emitFieldText(target, fallback.text)
        }
        closeOpenField()
        closeStage('结构化生成失败，已降级为纯文本')
        enqueue({
          event: 'error',
          data: {
            code: 'LLM_STRUCTURED_FALLBACK',
            message: sanitizeNotice(structuredFallbackNotice(fallback, fieldLabel)),
            retryable: true,
            attempt: 1,
            ...(fallback.text.length > 0 ? { field: target } : {}),
          },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'error',
          },
        })
      }

      try {
        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'start', label: '正在调用模型' },
        })
        stageOpen = true

        const chatRequest: ChatRequest = {
          ...buildModelChatRequest(input),
          signal: request.signal,
        }

        let streamError: unknown = null
        try {
          for await (const chunk of provider.stream(chatRequest)) {
            if (closed || request.signal.aborted) {
              return
            }
            if (chunk.reasoningDelta !== undefined) {
              enqueue({
                event: 'reasoning',
                data: { text: chunk.reasoningDelta },
              })
            }
            if (chunk.usage !== undefined) {
              usage = chunk.usage
            }
            if (chunk.delta.length === 0) {
              continue
            }
            raw += chunk.delta
            if (parser.failed) {
              continue
            }
            for (const event of parser.push(chunk.delta)) {
              handleEvent(event)
            }
          }
        } catch (error) {
          streamError = error
        }

        if (closed || request.signal.aborted) {
          return
        }

        // 第一级：整段严格解析；失败后退到宽容解析；都不额外调用模型。
        let recovered: PromptSchema | null = null
        const finished = parser.finish()
        if (finished.ok) {
          const checked = PromptPilotSchemaV1.safeParse(finished.value)
          if (checked.success) {
            recovered = checked.data
          }
        }
        if (!recovered) {
          recovered = parseWholeOutput(raw)
        }

        if (recovered) {
          finalizeStructured(recovered, usage)
          return
        }

        if (streamError !== null && !(streamError instanceof LlmError)) {
          console.warn(
            '[generate] 流式生成中断，回退到整体解析：',
            streamError instanceof Error ? streamError.message : '未知错误',
          )
        }

        // 第二级：复用现有兜底链（json_object、修复重试、纯文本降级）。
        const outcome = await runStructuredOutcome(
          provider,
          chatRequest,
          PromptPilotSchemaV1,
          {
            maxRepairAttempts: 2,
            fallbackToText: true,
            ...(contextWindow !== undefined ? { contextWindow } : {}),
          },
        )

        if (outcome.kind === 'structured') {
          finalizeStructured(outcome.data, undefined)
          return
        }
        finalizeFallbackText(outcome)
      } catch (error) {
        const llmError =
          error instanceof LlmError
            ? error
            : createLlmError(
                'unknown',
                error instanceof Error ? error.message : '模型调用失败。',
                { cause: error },
              )
        closeOpenField()
        closeStage('生成失败')
        enqueue({
          event: 'error',
          data: {
            code: errorCodeForKind(llmError.kind),
            message:
              llmError.kind === 'aborted'
                ? '请求已取消。'
                : sanitizeNotice(providerFailureNotice(llmError)),
            retryable: llmError.retryable,
            attempt: 1,
          },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'error',
          },
        })
      } finally {
        request.signal.removeEventListener('abort', onAbort)
        close()
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { ...SSE_HEADERS },
  })
}

/** 按字段粒度生成 SSE。`?fast=1` 跳过人工延迟，供集成测试与本地调试使用。 */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', '请求体不是合法 JSON。', false)
  }

  const parsed = requestSchema.safeParse(payload)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return jsonError(
      400,
      'INVALID_INPUT',
      firstIssue?.message ?? '请求参数不合法。',
      true,
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }

  const requested = parsed.data.fields
  const selected: FieldKey[] = requested
    ? FIELD_KEYS.filter((field) => requested.includes(field))
    : [...FIELD_KEYS]

  // provider 选择：配置了 ARK_API_KEY 就构建方舟 provider 走真实模型；
  // 没有 Key 时 getGenerateProvider 返回 null，继续走下面的离线 heuristic composer。
  const fetchCounter = createFetchAttemptCounter()
  const provider = getGenerateProvider(process.env, {
    fetch: fetchCounter.fetch,
  })
  if (provider) {
    const identity = describeProvider(provider)
    const ledgerContext: LlmCallContext = {
      traceId: resolveTraceId(
        parsed.data.requestId ?? request.headers.get('x-request-id'),
      ),
      stage: 'compose',
      provider: identity.provider,
      modelId: identity.modelId,
      // 与 buildModelChatRequest 里的 thinking: 'off' 保持一致。
      thinking: 'off',
      ...(identity.contextWindow !== undefined
        ? { contextWindow: identity.contextWindow }
        : {}),
      fetchAttempts: fetchCounter.count,
    }
    return streamFromProvider({
      request,
      provider: instrumentProvider(provider, ledgerContext),
      input: parsed.data.input,
      selected,
      startedAt: Date.now(),
    })
  }

  let schema: PromptSchema
  try {
    schema = composePrompt(parsed.data.input)
  } catch (error) {
    if (error instanceof ComposeInputError) {
      return jsonError(400, error.code, error.message, true)
    }
    return jsonError(500, 'COMPOSE_FAILED', '生成结构化内容时出错。', true)
  }

  const fast = new URL(request.url).searchParams.get('fast') === '1'
  const startedAt = Date.now()
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) {
          return
        }
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端可能已经断开，关闭失败不需要再处理
        }
      }

      const enqueue = (message: SseMessage) => {
        if (closed || request.signal.aborted) {
          return
        }
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(message)))
        } catch {
          closed = true
        }
      }

      const wait = (ms: number): Promise<boolean> =>
        new Promise((resolve) => {
          if (request.signal.aborted) {
            resolve(false)
            return
          }
          if (ms <= 0) {
            resolve(true)
            return
          }

          let timer: ReturnType<typeof setTimeout> | undefined
          const onAbort = () => {
            if (timer) {
              clearTimeout(timer)
              timer = undefined
            }
            resolve(false)
          }
          request.signal.addEventListener('abort', onAbort, { once: true })
          timer = setTimeout(() => {
            request.signal.removeEventListener('abort', onAbort)
            timer = undefined
            resolve(true)
          }, ms)
        })

      const onAbort = () => {
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端已断开
        }
      }
      request.signal.addEventListener('abort', onAbort, { once: true })

      try {
        const plans = selected.map((field) => ({
          field,
          segments: renderFieldSegments(schema, field),
        }))

        const totalChars = plans.reduce(
          (total, plan) =>
            total +
            plan.segments.reduce(
              (count, segment) => count + Array.from(segment.text).length,
              0,
            ),
          0,
        )
        // 把整次生成控制在约 9 秒：短文档慢一点，长文档快一点，始终低于验收的 20 秒。
        const charDelay =
          fast || totalChars === 0
            ? 0
            : Math.min(8, Math.max(2, Math.round(9000 / totalChars)))
        const stageDelay = fast ? 0 : 120
        const fieldGap = fast ? 0 : 60

        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'start', label: '正在生成结构' },
        })
        if (!(await wait(stageDelay))) {
          return
        }

        for (const [index, plan] of plans.entries()) {
          enqueue({ event: 'field', data: { path: plan.field, status: 'start' } })

          for (const segment of plan.segments) {
            for (const char of segment.text) {
              enqueue({
                event: 'delta',
                data: { path: segment.path, text: char },
              })
              if (charDelay > 0 && !(await wait(charDelay))) {
                return
              }
            }
          }

          enqueue({ event: 'field', data: { path: plan.field, status: 'done' } })

          if (index < plans.length - 1 && fieldGap > 0) {
            if (!(await wait(fieldGap))) {
              return
            }
          }
        }

        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'done', label: '结构生成完成' },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'stop',
            title: schema.meta.title,
            assumptions: schema.assumptions,
          },
        })
      } catch {
        enqueue({
          event: 'error',
          data: {
            code: 'STREAM_FAILED',
            message: '生成过程中断，已保留已完成内容。',
            retryable: true,
            attempt: 1,
          },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'error',
            title: schema.meta.title,
            assumptions: schema.assumptions,
          },
        })
      } finally {
        request.signal.removeEventListener('abort', onAbort)
        close()
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { ...SSE_HEADERS },
  })
}
