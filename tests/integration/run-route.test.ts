import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Run } from '@prisma/client'
import { GET, POST } from '@/app/api/run/route'
import {
  createInitialTrialRunState,
  parseTrialRunAvailability,
  trialRunReducer,
} from '@/components/studio/useTrialRun'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { parseSseStream, type SseMessage } from '@/lib/engine/sse'

const MOCK_FULL_OUTPUT =
  '这是 Mock 模型的试运行输出。变量已按表单填入提示词，接入方舟后会返回真实模型结果。'

const createdRequestIds: string[] = []

let prisma: ReturnType<typeof getPrisma> = null

function traceIdOf(requestId: string): string {
  return requestId.startsWith('trace_') ? requestId : `trace_${requestId}`
}

function makeRequest(body: unknown, signal?: AbortSignal): Request {
  return new Request('http://localhost/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
}

function makeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const requestId = overrides.requestId ?? `test-${randomUUID()}`
  if (typeof requestId === 'string' && !createdRequestIds.includes(requestId)) {
    createdRequestIds.push(requestId)
  }
  return {
    prompt: '主题：{{topic}}\n请写一段 60 字以内的介绍。',
    variables: [
      {
        name: 'topic',
        label: '主题',
        type: 'text',
        required: true,
        value: '秋季新品',
      },
    ],
    sessionKey: `draft-test-${randomUUID()}`,
    requestId,
    ...overrides,
  }
}

async function readMessages(
  body: ReadableStream<Uint8Array> | null,
): Promise<SseMessage[]> {
  if (!body) {
    throw new Error('响应没有事件流')
  }
  const messages: SseMessage[] = []
  for await (const message of parseSseStream(body)) {
    messages.push(message)
  }
  return messages
}

async function findRun(requestId: string): Promise<Run | null> {
  if (!prisma) {
    return null
  }
  return prisma.run.findUnique({ where: { requestId } })
}

async function waitForRun(
  requestId: string,
  predicate: (row: Run) => boolean,
  timeoutMs = 3000,
): Promise<Run | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = await findRun(requestId)
    if (row && predicate(row)) {
      return row
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return findRun(requestId)
}

async function waitForLlmCall(traceId: string): Promise<{
  stage: string
  status: string
} | null> {
  if (!prisma) {
    return null
  }
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const row = await prisma.llmCall.findFirst({
      where: { traceId },
      orderBy: { createdAt: 'desc' },
    })
    if (row) {
      return { stage: row.stage, status: row.status }
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return null
}

beforeAll(() => {
  vi.stubEnv('DATABASE_URL', 'file:../data/app.db')
  prisma = getPrisma()
  expect(prisma).not.toBeNull()
})

beforeEach(() => {
  vi.stubEnv('ARK_API_KEY', '')
  vi.stubEnv('MOCK_LLM_FAULT', 'valid')
})

afterAll(async () => {
  if (prisma && createdRequestIds.length > 0) {
    const traceIds = createdRequestIds.map(traceIdOf)
    // LlmCall 是 fire-and-forget 写入，先给账本一点收尾时间再清理。
    await new Promise((resolve) => setTimeout(resolve, 150))
    await prisma.run.deleteMany({
      where: { requestId: { in: createdRequestIds } },
    })
    await prisma.llmCall.deleteMany({ where: { traceId: { in: traceIds } } })
  }
  await disconnectPrisma()
  vi.unstubAllEnvs()
})

describe('试运行路由的可用性与拒绝', () => {
  it('注入可用 Mock 时 GET 报告可用并带回模型信息', async () => {
    const response = await GET(
      new Request('http://localhost/api/run?sessionKey=draft-test'),
    )
    expect(response.status).toBe(200)
    const payload: unknown = await response.json()
    const parsed = parseTrialRunAvailability(payload)
    expect(parsed).not.toBeNull()
    expect(parsed?.availability.available).toBe(true)
    expect(parsed?.availability.model?.label).toContain('Mock')
    expect(parsed?.availability.model?.providerId).toBe('mock')
  })

  it('没有 Key 且没有注入 Mock 时禁用并说明原因，不伪造输出', async () => {
    vi.stubEnv('MOCK_LLM_FAULT', '')
    const availability = await GET(new Request('http://localhost/api/run'))
    const payload: unknown = await availability.json()
    const parsed = parseTrialRunAvailability(payload)
    expect(parsed?.availability.available).toBe(false)
    expect(parsed?.availability.reason).toContain('ARK_API_KEY')

    const response = await POST(makeRequest(makeBody()))
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body: unknown = await response.json()
    expect(body).toMatchObject({ code: 'NO_MODEL', retryable: false })
  })

  it('必填变量缺失时服务端也拒绝，不发起模型调用', async () => {
    const body = makeBody()
    const response = await POST(
      makeRequest({
        ...body,
        variables: [
          {
            name: 'topic',
            label: '主题',
            type: 'text',
            required: true,
            value: '   ',
          },
        ],
      }),
    )
    expect(response.status).toBe(400)
    const payload: unknown = await response.json()
    expect(payload).toMatchObject({ code: 'INVALID_VARIABLES' })
    const row = await findRun(String(body.requestId))
    expect(row).toBeNull()
  })
})

describe('试运行路由的流式输出与落库', () => {
  it('SSE 事件满足协议，输出完整，运行与账本都写入数据库', async () => {
    const body = makeBody()
    const requestId = String(body.requestId)
    const sessionKey = String(body.sessionKey)

    const response = await POST(makeRequest(body))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    )
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(response.headers.get('x-accel-buffering')).toBe('no')

    const messages = await readMessages(response.body)
    expect(messages[0]?.event).toBe('stage')
    if (messages[0]?.event === 'stage') {
      expect(messages[0].data.status).toBe('start')
      expect(messages[0].data.label).toBe('正在试运行')
    }

    const deltas = messages.filter((message) => message.event === 'delta')
    const output = deltas
      .map((message) => (message.event === 'delta' ? message.data.text : ''))
      .join('')
    expect(output).toBe(MOCK_FULL_OUTPUT)
    expect(deltas.length).toBeGreaterThan(1)

    const usageEvents = messages.filter((message) => message.event === 'usage')
    expect(usageEvents.length).toBeGreaterThan(1)
    const lastUsage = usageEvents.at(-1)
    expect(lastUsage?.event).toBe('usage')
    if (lastUsage?.event === 'usage') {
      expect(lastUsage.data.tokensIn).toBe(48)
      expect(lastUsage.data.tokensOut).toBe(26)
      expect(lastUsage.data.costCny).toBe(0)
      expect(lastUsage.data.model).toBe('mock')
    }

    const done = messages.at(-1)
    expect(done?.event).toBe('done')
    if (done?.event === 'done') {
      expect(done.data.finishReason).toBe('stop')
      expect(done.data.durationMs).toBeGreaterThanOrEqual(0)
    }
    expect(messages.some((message) => message.event === 'error')).toBe(false)

    // 把同一条 SSE 流喂给客户端 reducer，确认界面状态与落库一致。
    let ui = trialRunReducer(createInitialTrialRunState(), {
      type: 'start',
      modelLabel: 'Mock 模型 · valid',
    })
    for (const message of messages) {
      if (message.event === 'delta') {
        ui = trialRunReducer(ui, { type: 'delta', text: message.data.text })
      } else if (message.event === 'usage') {
        ui = trialRunReducer(ui, {
          type: 'usage',
          usage: {
            tokensIn: message.data.tokensIn,
            tokensOut: message.data.tokensOut,
            ...(message.data.costCny !== undefined
              ? { costCny: message.data.costCny }
              : {}),
          },
        })
      } else if (message.event === 'done') {
        ui = trialRunReducer(ui, {
          type: 'finish',
          durationMs: message.data.durationMs,
          finishReason: message.data.finishReason,
        })
      }
    }
    expect(ui.phase).toBe('done')
    expect(ui.output).toBe(MOCK_FULL_OUTPUT)
    expect(ui.usage?.tokensOut).toBe(26)

    const row = await waitForRun(requestId, (value) => value.status === 'succeeded')
    expect(row).not.toBeNull()
    expect(row?.status).toBe('succeeded')
    expect(row?.output).toBe(MOCK_FULL_OUTPUT)
    expect(row?.sessionKey).toBe(sessionKey)
    expect(row?.versionId).toBeNull()
    expect(row?.modelId).toBe('mock')
    expect(row?.variablesJson).toBe(JSON.stringify({ topic: '秋季新品' }))
    expect(row?.tokensIn).toBe(48)
    expect(row?.tokensOut).toBe(26)
    expect(row?.costCny).toBe(0)
    expect(row?.finishReason).toBe('stop')
    expect(row?.errorCode).toBeNull()
    expect(row?.traceId).toBe(traceIdOf(requestId))
    expect(row?.requestId).toBe(requestId)

    const call = await waitForLlmCall(traceIdOf(requestId))
    expect(call).toEqual({ stage: 'run', status: 'succeeded' })
  })

  it('上游模型报错时落库 failed 并记录错误码', async () => {
    vi.stubEnv('MOCK_LLM_FAULT', 'rate_limited')
    const body = makeBody()
    const requestId = String(body.requestId)

    const response = await POST(makeRequest(body))
    expect(response.status).toBe(200)
    const messages = await readMessages(response.body)
    const error = messages.find((message) => message.event === 'error')
    expect(error?.event).toBe('error')
    if (error?.event === 'error') {
      expect(error.data.code).toBe('LLM_RATE_LIMITED')
      expect(error.data.message).toContain('限流')
    }
    const done = messages.at(-1)
    expect(done?.event).toBe('done')
    if (done?.event === 'done') {
      expect(done.data.finishReason).toBe('error')
    }

    const row = await waitForRun(requestId, (value) => value.status === 'failed')
    expect(row).not.toBeNull()
    expect(row?.status).toBe('failed')
    expect(row?.errorCode).toBe('LLM_RATE_LIMITED')
    expect(row?.errorMsg).toContain('限流')
    expect(row?.output).toBe('')
  })

  it('中途取消时保留已输出部分，落库状态为 canceled', async () => {
    const body = makeBody()
    const requestId = String(body.requestId)
    const controller = new AbortController()
    const response = await POST(makeRequest(body, controller.signal))
    expect(response.status).toBe(200)
    if (!response.body) {
      throw new Error('响应没有事件流')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let deltas = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        text += decoder.decode(value, { stream: true })
        deltas = (text.match(/event: delta/g) ?? []).length
        if (deltas >= 1) {
          controller.abort()
          break
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }

    expect(deltas).toBeGreaterThanOrEqual(1)
    const row = await waitForRun(
      requestId,
      (value) => value.status === 'canceled',
    )
    expect(row).not.toBeNull()
    expect(row?.status).toBe('canceled')
    expect(row?.errorCode).toBe('CANCELED')
    expect((row?.output.length ?? 0)).toBeGreaterThan(0)
    expect((row?.output.length ?? 0)).toBeLessThan(MOCK_FULL_OUTPUT.length)
    expect(MOCK_FULL_OUTPUT.startsWith(row?.output ?? '')).toBe(true)
  })
})
