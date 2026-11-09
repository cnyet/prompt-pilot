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
  PromptPilotSchemaV1,
  type FieldKey,
  type PromptSchema,
} from '@/lib/engine/schema'
import { LlmError, createLlmError, errorCodeForKind } from '@/lib/llm/errors'
import { DEFAULT_GENERATE_MODEL_CONFIG_ID, getGenerateProvider } from '@/lib/llm/registry'
import type { ChatRequest, LLMProvider } from '@/lib/llm/types'

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
})

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
      // 方舟 json_schema 仍是 beta，且默认值字段不满足 strict 的 required 要求。
      strict: false,
    },
  }
}

interface ProviderStreamOptions {
  request: Request
  provider: LLMProvider
  input: string
  selected: FieldKey[]
  startedAt: number
}

/** 有 Key 的分支：真实模型生成结构，再复用现有 SSE 逐字段输出。 */
function streamFromProvider(options: ProviderStreamOptions): Response {
  const { request, provider, input, selected, startedAt } = options
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

      try {
        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'start', label: '正在调用模型' },
        })

        const schema = await provider.structured(
          buildModelChatRequest(input),
          PromptPilotSchemaV1,
          { maxRepairAttempts: 2, fallbackToText: true },
        )

        const plans = selected.map((field) => ({
          field,
          segments: renderFieldSegments(schema, field),
        }))

        for (const plan of plans) {
          enqueue({ event: 'field', data: { path: plan.field, status: 'start' } })
          for (const segment of plan.segments) {
            enqueue({
              event: 'delta',
              data: { path: segment.path, text: segment.text },
            })
          }
          enqueue({ event: 'field', data: { path: plan.field, status: 'done' } })
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
      } catch (error) {
        const llmError =
          error instanceof LlmError
            ? error
            : createLlmError(
                'unknown',
                error instanceof Error ? error.message : '模型调用失败。',
                { cause: error },
              )
        enqueue({
          event: 'error',
          data: {
            code: errorCodeForKind(llmError.kind),
            message: llmError.message,
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
  const provider = getGenerateProvider()
  if (provider) {
    return streamFromProvider({
      request,
      provider,
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
