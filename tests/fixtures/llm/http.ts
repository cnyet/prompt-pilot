import type { ChatChunk } from '@/lib/llm/types'

/**
 * LLM provider 单测的假 transport。
 *
 * 不用 mock 掉 OpenAI SDK，而是替换 fetch：这样请求体构造、SSE 解析、
 * usage 映射都走真实 SDK 路径，能覆盖「加了 include_usage 后末尾 chunk
 * choices 为空数组」这类真实坑。
 */

export interface CapturedRequest {
  url: string
  body: Record<string, unknown>
  headers: Headers
}

export type ScriptedHandler = (
  captured: CapturedRequest,
  callIndex: number,
) => Response | Promise<Response>

export interface ScriptedFetch {
  fetch: typeof globalThis.fetch
  calls: CapturedRequest[]
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function createScriptedFetch(handler: ScriptedHandler): ScriptedFetch {
  const calls: CapturedRequest[] = []

  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : undefined
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    let rawBody = ''
    if (typeof init?.body === 'string') {
      rawBody = init.body
    } else if (init?.body instanceof Uint8Array) {
      rawBody = new TextDecoder().decode(init.body)
    } else if (request) {
      rawBody = await request.clone().text()
    }

    let parsed: Record<string, unknown> = {}
    if (rawBody.length > 0) {
      try {
        parsed = toRecord(JSON.parse(rawBody))
      } catch {
        parsed = {}
      }
    }

    const captured: CapturedRequest = {
      url,
      body: parsed,
      headers: new Headers(init?.headers ?? request?.headers),
    }
    calls.push(captured)
    return handler(captured, calls.length - 1)
  }

  return { fetch: fetchImpl as typeof globalThis.fetch, calls }
}

export function chatChunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
): Record<string, unknown> {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1_700_000_000,
    model: 'test-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

export function usageOnlyChunk(usage: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1_700_000_000,
    model: 'test-model',
    choices: [],
    usage,
  }
}

export function sseResponse(chunks: readonly unknown[]): Response {
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}

export interface CompletionOptions {
  finishReason?: string | null
  reasoning?: string
  usage?: Record<string, unknown>
}

export function completionResponse(
  text: string,
  options: CompletionOptions = {},
): Response {
  const message: Record<string, unknown> = { role: 'assistant', content: text }
  if (options.reasoning) {
    message.reasoning_content = options.reasoning
  }
  const body = {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1_700_000_000,
    model: 'test-model',
    choices: [
      {
        index: 0,
        message,
        finish_reason: options.finishReason ?? 'stop',
      },
    ],
    usage: options.usage ?? {
      prompt_tokens: 10,
      completion_tokens: 4,
      total_tokens: 14,
    },
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message, type: 'test_error' } }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

export async function collectChunks(
  iterable: AsyncIterable<ChatChunk>,
): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}
