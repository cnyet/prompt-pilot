import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/generate/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { META_SEPARATOR } from '@/lib/engine/prompts/meta'
import { parseSseStreamV3, type SseV3Message } from '@/lib/engine/sse-v3'

// /api/generate 首轮 SSE 路由。只走 mock provider，不触网；数据在隔离的 data/test.db。

let prisma: ReturnType<typeof getPrisma> = null
const savedFault = process.env.MOCK_LLM_FAULT

function makeRequest(body: unknown, signal?: AbortSignal): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
}

async function collect(response: Response): Promise<SseV3Message[]> {
  if (!response.body) throw new Error('响应没有事件流')
  const messages: SseV3Message[] = []
  for await (const message of parseSseStreamV3(response.body)) {
    messages.push(message)
  }
  return messages
}

function doneOf(messages: SseV3Message[]) {
  const done = messages.find((m) => m.event === 'done')
  if (!done || done.event !== 'done') throw new Error('缺少 done 事件')
  return done.data
}

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  delete process.env.MOCK_LLM_FAULT
  await prisma!.promptRecord.deleteMany({})
})

afterEach(() => {
  if (savedFault === undefined) delete process.env.MOCK_LLM_FAULT
  else process.env.MOCK_LLM_FAULT = savedFault
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('正常流', () => {
  it('收齐 start/delta/meta/usage/done，记录 completed，正文不含元数据分隔符', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const response = await POST(
      makeRequest({ mode: 'generate', sourceInput: '帮我写个周报', requestId: randomUUID() }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const messages = await collect(response)
    const names = messages.map((m) => m.event)
    expect(names[0]).toBe('start')
    expect(names).toContain('delta')
    expect(names).toContain('meta')
    expect(names).toContain('usage')
    expect(names[names.length - 1]).toBe('done')

    const done = doneOf(messages)
    expect(done.status).toBe('completed')
    const deltaText = messages
      .filter((m) => m.event === 'delta')
      .map((m) => (m.event === 'delta' ? m.data.text : ''))
      .join('')
    expect(deltaText.length).toBeGreaterThan(0)
    expect(JSON.stringify(messages)).not.toContain(META_SEPARATOR)

    const record = await prisma!.promptRecord.findUnique({ where: { id: done.recordId } })
    expect(record?.status).toBe('completed')
    expect(record?.iterationCount).toBe(1)
    expect(record?.latestOutput).toBe(deltaText)
    expect(record?.latestOutput).not.toContain(META_SEPARATOR)
  })

  it('优化模式忽略 targetType，记录存 text', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const messages = await collect(
      await POST(
        makeRequest({ mode: 'optimize', sourceInput: '写周报', targetType: 'image' }),
      ),
    )
    const done = doneOf(messages)
    const record = await prisma!.promptRecord.findUnique({ where: { id: done.recordId } })
    expect(record?.mode).toBe('optimize')
    expect(record?.targetType).toBe('text')
  })
})

describe('幂等', () => {
  it('并发双发同 requestId 只产生 1 条记录与 1 条迭代', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const requestId = randomUUID()
    const body = { mode: 'generate', sourceInput: '双击测试', requestId }
    const [a, b] = await Promise.all([
      POST(makeRequest(body)).then(collect),
      POST(makeRequest(body)).then(collect),
    ])
    expect(doneOf(a).recordId).toBe(doneOf(b).recordId)
    expect(await prisma!.promptRecord.count()).toBe(1)
    expect(await prisma!.promptIteration.count()).toBe(1)
  })

  it('同 requestId 跨进程重发（LRU 已清空）：P2002 清掉新记录并重放到原迭代', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const requestId = randomUUID()
    const body = { mode: 'generate', sourceInput: '重放清理测试', requestId }
    const first = doneOf(await collect(await POST(makeRequest(body))))

    vi.resetModules()
    const fresh = await import('@/app/api/generate/route')
    const replay = await collect(await fresh.POST(makeRequest(body)))
    const second = doneOf(replay)

    expect(second.iterationId).toBe(first.iterationId)
    expect(second.recordId).toBe(first.recordId)
    expect(await prisma!.promptRecord.count()).toBe(1)
    expect(await prisma!.promptIteration.count()).toBe(1)

    // completed 重放要补发 meta，标题取已落库的记录标题。
    const metaEvent = replay.find((message) => message.event === 'meta')
    expect(metaEvent?.event === 'meta' ? metaEvent.data.title : null).toBe('重放清理测试')
    expect(metaEvent?.event === 'meta' ? metaEvent.data.notes : null).toEqual([])
  })
})

describe('故障与中断', () => {
  it('truncated 画像：error + done(failed)，迭代 failed 且正文为空', async () => {
    process.env.MOCK_LLM_FAULT = 'truncated'
    const messages = await collect(
      await POST(makeRequest({ mode: 'generate', sourceInput: '截断测试' })),
    )
    expect(messages.some((m) => m.event === 'error')).toBe(true)
    const done = doneOf(messages)
    expect(done.status).toBe('failed')
    const iteration = await prisma!.promptIteration.findUnique({ where: { id: done.iterationId } })
    expect(iteration?.status).toBe('failed')
    expect(iteration?.output).toBe('')
    const record = await prisma!.promptRecord.findUnique({ where: { id: done.recordId } })
    expect(record?.status).toBe('failed')
  })

  it('abort 在首个 delta 之后：迭代与记录为 canceled，保留已发正文', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const controller = new AbortController()
    const response = await POST(
      makeRequest({ mode: 'generate', sourceInput: '中断测试' }, controller.signal),
    )
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!buffer.includes('event: delta')) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
    }
    expect(buffer).toContain('event: delta')
    controller.abort()
    while (!(await reader.read()).done) {
      // 排空
    }

    let record = null
    for (let i = 0; i < 50; i += 1) {
      record = await prisma!.promptRecord.findFirst({ include: { iterations: true } })
      if (record && record.status !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(record?.status).toBe('canceled')
    expect(record?.iterations[0]?.status).toBe('canceled')
    expect(record?.iterations[0]?.output.length).toBeGreaterThan(0)
  })

  it('canceled 重放：不发 meta，保留已生成正文，done(canceled)', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const requestId = randomUUID()
    const body = { mode: 'generate', sourceInput: '中断重放', requestId }
    const controller = new AbortController()
    const response = await POST(makeRequest(body, controller.signal))
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!buffer.includes('event: delta')) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
    }
    expect(buffer).toContain('event: delta')
    controller.abort()
    while (!(await reader.read()).done) {
      // 排空
    }

    let record = null
    for (let i = 0; i < 50; i += 1) {
      record = await prisma!.promptRecord.findFirst()
      if (record && record.status !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(record?.status).toBe('canceled')

    const replay = await collect(await POST(makeRequest(body)))
    expect(replay.some((m) => m.event === 'meta')).toBe(false)
    const deltaText = replay
      .map((m) => (m.event === 'delta' ? m.data.text : ''))
      .join('')
    expect(deltaText.length).toBeGreaterThan(0)
    expect(doneOf(replay).status).toBe('canceled')
  })

  it('failed 重放：不发 meta，以 done(failed) 收尾', async () => {
    process.env.MOCK_LLM_FAULT = 'truncated'
    const requestId = randomUUID()
    const body = { mode: 'generate', sourceInput: '失败重放', requestId }
    const first = doneOf(await collect(await POST(makeRequest(body))))
    expect(first.status).toBe('failed')

    const replay = await collect(await POST(makeRequest(body)))
    expect(replay.some((m) => m.event === 'meta')).toBe(false)
    expect(replay.some((m) => m.event === 'error')).toBe(true)
    const last = replay[replay.length - 1]
    expect(last?.event).toBe('done')
    expect(doneOf(replay).status).toBe('failed')
  })
})

describe('输入边界', () => {
  it('无 provider：503 NO_MODEL 且不产生记录', async () => {
    const response = await POST(makeRequest({ mode: 'generate', sourceInput: '无模型' }))
    expect(response.status).toBe(503)
    const json = (await response.json()) as { code: string; retryable: boolean }
    expect(json.code).toBe('NO_MODEL')
    expect(json.retryable).toBe(false)
    expect(await prisma!.promptRecord.count()).toBe(0)
  })

  it.each([
    ['generate 2001 字', { mode: 'generate', sourceInput: 'a'.repeat(2001) }],
    ['generate 0 字', { mode: 'generate', sourceInput: '' }],
    ['optimize 8001 字', { mode: 'optimize', sourceInput: 'a'.repeat(8001) }],
    ['instruction 501 字', { mode: 'optimize', sourceInput: 'x', instruction: 'a'.repeat(501) }],
  ])('%s 返回 400 INVALID_INPUT', async (_label, body) => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const response = await POST(makeRequest(body))
    expect(response.status).toBe(400)
    const json = (await response.json()) as { code: string }
    expect(json.code).toBe('INVALID_INPUT')
    expect(await prisma!.promptRecord.count()).toBe(0)
  })
})
