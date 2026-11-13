import { randomUUID } from 'node:crypto'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { POST as generate } from '@/app/api/generate/route'
import {
  GET as getRecord,
  PATCH as patchRecord,
} from '@/app/api/records/[id]/route'
import { POST as optimize } from '@/app/api/records/[id]/optimize/route'
import { GET as getStats } from '@/app/api/stats/route'
import {
  GET as listTemplates,
  POST as createTemplate,
} from '@/app/api/templates/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { parseSseStreamV3, type SseV3Message } from '@/lib/engine/sse-v3'
import { BUDGET_SETTING_KEY } from '@/lib/settings/store'

// v3 工作台跨路由集成：生成 → 详情 → 收藏/评分 → 继续优化 → 成本 → 模板。
// 只走 mock provider，不触网；数据在隔离的 data/test.db。

let prisma: ReturnType<typeof getPrisma> = null
const savedFault = process.env.MOCK_LLM_FAULT

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  const done = messages.find((message) => message.event === 'done')
  if (!done || done.event !== 'done') throw new Error('缺少 done 事件')
  return done.data
}

function deltaTextOf(messages: SseV3Message[]): string {
  return messages
    .map((message) => (message.event === 'delta' ? message.data.text : ''))
    .join('')
}

interface WireIteration {
  id: string
  seq: number
  kind: string
  instruction: string | null
  output: string
}

interface WireRecord {
  id: string
  latestOutput: string
  favorite: boolean
  rating: number | null
  iterations: WireIteration[]
}

interface DetailBody {
  record: WireRecord
}

interface PatchBody {
  record: { favorite: boolean; rating: number | null }
}

interface StatsBody {
  month: { calls: number }
  byStage: Array<{ key: string; calls: number }>
}

interface CreateTemplateBody {
  template: {
    id: string
    category: string
    mode: string
    builtin: boolean
    body: string
  }
}

interface ListTemplatesBody {
  templates: Array<{
    id: string
    category: string
    title: string
    mode: string
    body: string
  }>
}

async function generateRecord(): Promise<{
  recordId: string
  output: string
}> {
  const messages = await collect(
    await generate(
      jsonRequest('http://localhost/api/generate', 'POST', {
        mode: 'generate',
        sourceInput: '帮我写个周报',
        requestId: randomUUID(),
      }),
    ),
  )
  const done = doneOf(messages)
  expect(done.status).toBe('completed')
  return { recordId: done.recordId, output: deltaTextOf(messages) }
}

async function readDetail(recordId: string): Promise<WireRecord> {
  const response = await getRecord(
    new Request(`http://localhost/api/records/${recordId}`),
    ctx(recordId),
  )
  expect(response.status).toBe(200)
  const { record } = (await response.json()) as DetailBody
  return record
}

async function patchBody(
  recordId: string,
  body: Record<string, unknown>,
): Promise<PatchBody> {
  const response = await patchRecord(
    jsonRequest(`http://localhost/api/records/${recordId}`, 'PATCH', body),
    ctx(recordId),
  )
  expect(response.status).toBe(200)
  return (await response.json()) as PatchBody
}

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  process.env.MOCK_LLM_FAULT = 'valid'
  await prisma!.promptIteration.deleteMany({})
  await prisma!.promptRecord.deleteMany({})
  await prisma!.template.deleteMany({})
  await prisma!.llmCall.deleteMany({})
  await prisma!.appSetting.deleteMany({
    where: { key: BUDGET_SETTING_KEY },
  })
})

afterEach(() => {
  if (savedFault === undefined) delete process.env.MOCK_LLM_FAULT
  else process.env.MOCK_LLM_FAULT = savedFault
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('v3 工作台 API 全链路', () => {
  it('生成自动入库，详情、收藏评分、继续优化、成本与模板读到同一份数据', async () => {
    // 1. 生成：SSE 收齐后拿到 recordId。
    const generated = await generateRecord()
    expect(generated.output.length).toBeGreaterThan(0)

    // 2. 详情：正文非空，首轮迭代就是生成结果。
    const detail = await readDetail(generated.recordId)
    expect(detail.latestOutput.trim().length).toBeGreaterThan(0)
    expect(detail.iterations).toHaveLength(1)
    expect(detail.iterations[0]).toMatchObject({ seq: 1, kind: 'generate' })
    expect(detail.iterations[0]?.output).toBe(detail.latestOutput)
    expect(detail.favorite).toBe(false)
    expect(detail.rating).toBeNull()

    // 3. 收藏与评分：收藏 true、评分 4、再清除评分。
    expect((await patchBody(generated.recordId, { favorite: true })).record)
      .toMatchObject({ favorite: true })
    expect((await patchBody(generated.recordId, { rating: 4 })).record)
      .toMatchObject({ rating: 4 })
    expect((await patchBody(generated.recordId, { rating: null })).record)
      .toMatchObject({ rating: null, favorite: true })

    // 4. 继续优化：追加第二轮迭代，latestOutput 跟随最新一版。
    const optimized = await collect(
      await optimize(
        jsonRequest(
          `http://localhost/api/records/${generated.recordId}/optimize`,
          'POST',
          { instruction: '更严格', requestId: randomUUID() },
        ),
        ctx(generated.recordId),
      ),
    )
    const optimizedDone = doneOf(optimized)
    expect(optimizedDone.status).toBe('completed')
    expect(optimizedDone.recordId).toBe(generated.recordId)

    const after = await readDetail(generated.recordId)
    expect(after.iterations).toHaveLength(2)
    expect(after.iterations[1]).toMatchObject({
      seq: 2,
      kind: 'optimize',
      instruction: '更严格',
    })
    expect(after.latestOutput).toBe(after.iterations[1]?.output)
    expect(after.latestOutput).toBe(deltaTextOf(optimized))

    // 5. 成本：两次调用各一条 generate / optimize 账本行。
    const statsResponse = await getStats()
    expect(statsResponse.status).toBe(200)
    const stats = (await statsResponse.json()) as StatsBody
    expect(stats.month.calls).toBe(2)
    expect(stats.byStage.map((bucket) => bucket.key).sort()).toEqual([
      'generate',
      'optimize',
    ])

    // 6. 模板：用最新正文保存，列表能按分类读回。
    const createResponse = await createTemplate(
      jsonRequest('http://localhost/api/templates', 'POST', {
        category: 'text',
        style: '公文',
        title: '周报生成模板',
        description: '把一句话需求扩写成可直接使用的周报提示词',
        body: after.latestOutput,
        mode: 'generate',
      }),
    )
    expect(createResponse.status).toBe(201)
    const { template } = (await createResponse.json()) as CreateTemplateBody
    expect(template).toMatchObject({
      category: 'text',
      mode: 'generate',
      builtin: false,
      body: after.latestOutput,
    })

    const listResponse = await listTemplates(
      new Request('http://localhost/api/templates?category=text'),
    )
    expect(listResponse.status).toBe(200)
    const { templates } = (await listResponse.json()) as ListTemplatesBody
    expect(templates.map((item) => item.id)).toContain(template.id)
    expect(templates.every((item) => item.category === 'text')).toBe(true)
  })
})
