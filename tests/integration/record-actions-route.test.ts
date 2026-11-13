import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as generate } from '@/app/api/generate/route'
import { POST as optimize } from '@/app/api/records/[id]/optimize/route'
import { POST as repair } from '@/app/api/records/[id]/repair/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { META_SEPARATOR } from '@/lib/engine/prompts/meta'
import { parseSseStreamV3, type SseV3Message } from '@/lib/engine/sse-v3'

// 继续优化与修复 SSE 路由。只走 mock provider，不触网；数据在隔离的 data/test.db。

let prisma: ReturnType<typeof getPrisma> = null
const savedFault = process.env.MOCK_LLM_FAULT

function req(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const callOptimize = (id: string, body: unknown) =>
  optimize(req(`http://localhost/api/records/${id}/optimize`, body), ctx(id))
const callRepair = (id: string, body: unknown) =>
  repair(req(`http://localhost/api/records/${id}/repair`, body), ctx(id))

async function collect(response: Response): Promise<SseV3Message[]> {
  if (!response.body) throw new Error('响应没有事件流')
  const messages: SseV3Message[] = []
  for await (const message of parseSseStreamV3(response.body)) messages.push(message)
  return messages
}

function doneOf(messages: SseV3Message[]) {
  const done = messages.find((m) => m.event === 'done')
  if (!done || done.event !== 'done') throw new Error('缺少 done 事件')
  return done.data
}

async function seedRecord(): Promise<string> {
  const messages = await collect(
    await generate(req('http://localhost/api/generate', { mode: 'generate', sourceInput: '帮我写个周报' })),
  )
  return doneOf(messages).recordId
}

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  process.env.MOCK_LLM_FAULT = 'valid'
  await prisma!.promptRecord.deleteMany({})
})

afterEach(() => {
  if (savedFault === undefined) delete process.env.MOCK_LLM_FAULT
  else process.env.MOCK_LLM_FAULT = savedFault
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('继续优化', () => {
  it('在 completed 记录上追加 optimize 迭代 seq 2', async () => {
    const recordId = await seedRecord()
    const messages = await collect(await callOptimize(recordId, { instruction: '更严格' }))
    const done = doneOf(messages)
    expect(done.status).toBe('completed')
    expect(done.recordId).toBe(recordId)
    const metaEvent = messages.find((m) => m.event === 'meta')
    expect(metaEvent && metaEvent.event === 'meta' ? metaEvent.data.notes.length : 0).toBeLessThanOrEqual(3)
    const deltaText = messages
      .map((m) => (m.event === 'delta' ? m.data.text : ''))
      .join('')

    const record = await prisma!.promptRecord.findUnique({
      where: { id: recordId },
      include: { iterations: { orderBy: { seq: 'asc' } } },
    })
    expect(record?.iterationCount).toBe(2)
    expect(record?.latestOutput).toBe(deltaText)
    expect(record?.iterations[1]).toMatchObject({ seq: 2, kind: 'optimize', instruction: '更严格' })
    const ledger = await prisma!.llmCall.findMany({ where: { iterationId: done.iterationId } })
    expect(ledger.map((row) => row.stage)).toEqual(['optimize'])
  })

  it('running 记录返回 409 ITERATION_IN_FLIGHT', async () => {
    const created = await prisma!.promptRecord.create({
      data: { title: 't', mode: 'generate', sourceInput: 'x', status: 'running' },
    })
    const response = await callOptimize(created.id, {})
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'ITERATION_IN_FLIGHT',
      message: '这一条正在处理，等它完成再继续。',
      retryable: false,
    })
  })

  it('记录不存在返回 404 RECORD_NOT_FOUND', async () => {
    const response = await callOptimize('missing-id', {})
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'RECORD_NOT_FOUND' })
  })

  it('重复 requestId 重放，不新增迭代', async () => {
    const recordId = await seedRecord()
    const requestId = randomUUID()
    const first = await collect(await callOptimize(recordId, { requestId }))
    const second = await collect(await callOptimize(recordId, { requestId }))
    const startOf = (ms: SseV3Message[]) => {
      const s = ms.find((m) => m.event === 'start')
      return s && s.event === 'start' ? s.data : null
    }
    expect(startOf(second)?.iterationId).toBe(startOf(first)?.iterationId)
    expect(doneOf(second).recordId).toBe(doneOf(first).recordId)
    expect(await prisma!.promptIteration.count({ where: { recordId } })).toBe(2)
  })
})

describe('修复', () => {
  it('追加 repair 迭代，空 issues 也允许', async () => {
    const recordId = await seedRecord()
    const issues = [
      { id: 'R101', level: 'warn', message: '含模糊词', suggestion: '改成可验证的要求' },
      { id: 'R103', level: 'info', message: '缺输出格式', suggestion: null },
    ]
    const first = doneOf(await collect(await callRepair(recordId, { issues })))
    expect(first.status).toBe('completed')
    const second = doneOf(await collect(await callRepair(recordId, { issues: [] })))
    expect(second.status).toBe('completed')

    const iterations = await prisma!.promptIteration.findMany({
      where: { recordId },
      orderBy: { seq: 'asc' },
    })
    expect(iterations.map((i) => [i.seq, i.kind])).toEqual([
      [1, 'generate'],
      [2, 'repair'],
      [3, 'repair'],
    ])
    const ledger = await prisma!.llmCall.findMany({ where: { iterationId: first.iterationId } })
    expect(ledger.map((row) => row.stage)).toEqual(['repair'])
  })

  it('issues 超 20 条或字段超长返回 400', async () => {
    const recordId = await seedRecord()
    const issue = { id: 'R1', level: 'error', message: 'm', suggestion: null }
    const tooMany = await callRepair(recordId, { issues: Array.from({ length: 21 }, () => issue) })
    expect(tooMany.status).toBe(400)
    const longMessage = await callRepair(recordId, { issues: [{ ...issue, message: 'a'.repeat(201) }] })
    expect(longMessage.status).toBe(400)
    const longSuggestion = await callRepair(recordId, { issues: [{ ...issue, suggestion: 'a'.repeat(201) }] })
    expect(longSuggestion.status).toBe(400)
    expect(await prisma!.promptIteration.count({ where: { recordId } })).toBe(1)
  })
})

describe('元数据隔离', () => {
  it('两个路由的事件与落库正文不含元数据分隔符', async () => {
    const recordId = await seedRecord()
    const a = await collect(await callOptimize(recordId, {}))
    const b = await collect(await callRepair(recordId, { issues: [] }))
    expect(JSON.stringify(a)).not.toContain(META_SEPARATOR)
    expect(JSON.stringify(b)).not.toContain(META_SEPARATOR)
    const iterations = await prisma!.promptIteration.findMany({ where: { recordId } })
    for (const it of iterations) expect(it.output).not.toContain(META_SEPARATOR)
  })
})
