import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as regenerate } from '@/app/api/records/[id]/regenerate/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { parseSseStreamV3, type SseV3Message } from '@/lib/engine/sse-v3'
import { invalidateSettingsCache } from '@/lib/settings/store'

// POST /api/records/[id]/regenerate。只走 mock provider，不触网；
// 数据在隔离的 data/test.db。

let prisma: ReturnType<typeof getPrisma> = null
const savedFault = process.env.MOCK_LLM_FAULT

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/records/${id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const callRegenerate = (id: string, body: unknown = {}) =>
  regenerate(makeRequest(id, body), ctx(id))

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

/** 首轮失败的记录：latestOutput 为空，用来验证 regenerate 不走「无输出」守卫。 */
async function seedFailedRecord(): Promise<string> {
  const record = await prisma!.promptRecord.create({
    data: {
      title: '失败的首轮',
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
      status: 'failed',
    },
  })
  await prisma!.promptIteration.create({
    data: {
      recordId: record.id,
      seq: 1,
      kind: 'generate',
      status: 'failed',
      output: '',
    },
  })
  return record.id
}

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  delete process.env.MOCK_LLM_FAULT
  await prisma!.promptRecord.deleteMany({})
  await prisma!.appSetting.deleteMany({})
  invalidateSettingsCache()
})

afterEach(() => {
  if (savedFault === undefined) delete process.env.MOCK_LLM_FAULT
  else process.env.MOCK_LLM_FAULT = savedFault
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('重新生成', () => {
  it('failed 且无输出的记录可重新生成：追加 generate 迭代 seq 2，记录数不变', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const recordId = await seedFailedRecord()

    const response = await callRegenerate(recordId, { requestId: randomUUID() })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const messages = await collect(response)
    expect(messages[0]?.event).toBe('start')
    expect(messages.some((m) => m.event === 'delta')).toBe(true)
    expect(doneOf(messages).status).toBe('completed')

    const deltaText = messages
      .map((m) => (m.event === 'delta' ? m.data.text : ''))
      .join('')
    expect(deltaText.length).toBeGreaterThan(0)

    const record = await prisma!.promptRecord.findUnique({
      where: { id: recordId },
      include: { iterations: { orderBy: { seq: 'asc' } } },
    })
    expect(record?.status).toBe('completed')
    expect(record?.title).toBe('失败的首轮')
    expect(record?.latestOutput).toBe(deltaText)
    expect(record?.iterations).toHaveLength(2)

    const appended = record?.iterations[1]
    expect(appended?.kind).toBe('generate')
    expect(appended?.seq).toBe(2)
    expect(appended?.instruction).toBeNull()
    expect(appended?.status).toBe('completed')
    expect(appended?.output).toBe(deltaText)
    expect(await prisma!.promptRecord.count()).toBe(1)
  })

  it('同 requestId 重放不追加第二条迭代，start.iterationId 与首次一致', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const recordId = await seedFailedRecord()
    const requestId = randomUUID()

    const firstMessages = await collect(await callRegenerate(recordId, { requestId }))
    const first = doneOf(firstMessages)

    const replayMessages = await collect(await callRegenerate(recordId, { requestId }))
    const second = doneOf(replayMessages)
    const replayStart = replayMessages[0]

    expect(second.iterationId).toBe(first.iterationId)
    expect(second.status).toBe('completed')
    expect(replayStart?.event).toBe('start')
    if (replayStart?.event === 'start') {
      expect(replayStart.data.iterationId).toBe(first.iterationId)
      expect(replayStart.data.recordId).toBe(recordId)
    }
    expect(await prisma!.promptIteration.count({ where: { recordId } })).toBe(2)
    expect(await prisma!.promptRecord.count()).toBe(1)
  })

  it('存在进行中的迭代时返回 409 ITERATION_IN_FLIGHT', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const record = await prisma!.promptRecord.create({
      data: {
        title: '处理中',
        mode: 'generate',
        targetType: 'text',
        sourceInput: '继续测试',
        status: 'completed',
      },
    })
    await prisma!.promptIteration.create({
      data: { recordId: record.id, seq: 1, kind: 'generate', status: 'running' },
    })

    const response = await callRegenerate(record.id, {})
    expect(response.status).toBe(409)
    const json = (await response.json()) as { code: string }
    expect(json.code).toBe('ITERATION_IN_FLIGHT')
    expect(await prisma!.promptIteration.count({ where: { recordId: record.id } })).toBe(1)
  })

  it('无模型时返回 503 NO_MODEL 且不追加迭代', async () => {
    const recordId = await seedFailedRecord()

    const response = await callRegenerate(recordId, {})
    expect(response.status).toBe(503)
    const json = (await response.json()) as { code: string; retryable: boolean }
    expect(json.code).toBe('NO_MODEL')
    expect(json.retryable).toBe(false)
    expect(await prisma!.promptIteration.count({ where: { recordId } })).toBe(1)
  })

  it('记录不存在时返回 404 RECORD_NOT_FOUND', async () => {
    process.env.MOCK_LLM_FAULT = 'valid'
    const response = await callRegenerate('missing-record', {})
    expect(response.status).toBe(404)
    const json = (await response.json()) as { code: string }
    expect(json.code).toBe('RECORD_NOT_FOUND')
  })

  it('请求体不是合法 JSON 时返回 400 INVALID_INPUT', async () => {
    const request = new Request('http://localhost/api/records/any/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    const response = await regenerate(request, ctx('any'))
    expect(response.status).toBe(400)
    const json = (await response.json()) as { code: string }
    expect(json.code).toBe('INVALID_INPUT')
  })

  it('requestId 类型不合法时返回 400 INVALID_INPUT', async () => {
    const response = await callRegenerate('any', { requestId: 42 })
    expect(response.status).toBe(400)
    const json = (await response.json()) as { code: string }
    expect(json.code).toBe('INVALID_INPUT')
  })
})
