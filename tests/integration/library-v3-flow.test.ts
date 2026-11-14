import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { GET as listRoute } from '@/app/api/records/route'
import {
  DELETE as deleteRoute,
  GET as getRecord,
  PATCH as patchRecord,
} from '@/app/api/records/[id]/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { BUDGET_SETTING_KEY } from '@/lib/settings/store'

// v3 提示词库跨路由集成：搜索、筛选、元数据、删除与分页。
// 种子直接写隔离的 data/test.db，不触网、不读 data/app.db。

let prisma: ReturnType<typeof getPrisma> = null

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const T1 = new Date('2026-11-10T02:00:00.000Z') // 上海 2026-11-10 10:00
const T2 = new Date('2026-11-12T02:00:00.000Z') // 上海 2026-11-12 10:00
const T3 = new Date('2026-11-13T02:00:00.000Z') // 上海 2026-11-13 10:00

interface ListBody {
  records: Array<{
    id: string
    title: string
    favorite: boolean
    rating: number | null
    mode: string
    targetType: string
  }>
  total: number
  limit: number
  offset: number
}

interface DetailBody {
  record: {
    id: string
    title: string
    favorite: boolean
    rating: number | null
    iterations: Array<{ id: string; seq: number }>
  }
}

interface SeedInput {
  id: string
  title: string
  mode: 'generate' | 'optimize'
  targetType: 'text' | 'image' | 'video'
  sourceInput: string
  latestOutput: string
  updatedAt: Date
  favorite?: boolean
  rating?: number | null
}

async function seedRecord(input: SeedInput): Promise<void> {
  await prisma!.promptRecord.create({
    data: {
      id: input.id,
      title: input.title,
      mode: input.mode,
      targetType: input.targetType,
      sourceInput: input.sourceInput,
      latestOutput: input.latestOutput,
      status: 'completed',
      favorite: input.favorite ?? false,
      rating: input.rating ?? null,
      modelId: 'mock-valid',
      iterationCount: 1,
      tokensIn: 10,
      tokensOut: 20,
      costCny: 0.001,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
      iterations: {
        create: [
          {
            id: `${input.id}-it-1`,
            seq: 1,
            kind: input.mode === 'optimize' ? 'optimize' : 'generate',
            instruction: input.mode === 'optimize' ? '更严格' : null,
            output: input.latestOutput,
            notesJson: '[]',
            modelId: 'mock-valid',
            tokensIn: 10,
            tokensOut: 20,
            costCny: 0.001,
            latencyMs: 42,
            status: 'completed',
            requestId: `${input.id}-req-1`,
            createdAt: input.updatedAt,
          },
        ],
      },
    },
  })
}

async function seedThree(): Promise<void> {
  await seedRecord({
    id: 'rec-generate',
    title: '周报助手',
    mode: 'generate',
    targetType: 'text',
    sourceInput: '帮我写一份周报',
    latestOutput: '# 周报\n按项目分点，先结论后数据。',
    updatedAt: T1,
  })
  await seedRecord({
    id: 'rec-optimize',
    title: '海报提示词',
    mode: 'optimize',
    targetType: 'image',
    sourceInput: '优化这段海报描述，输入词甲',
    latestOutput: '镜头：广角，正文词乙。',
    updatedAt: T2,
  })
  await seedRecord({
    id: 'rec-favorite',
    title: '会议纪要模板，标题词丙',
    mode: 'generate',
    targetType: 'text',
    sourceInput: '总结会议',
    latestOutput: '输出纪要结构与待办列表。',
    updatedAt: T3,
    favorite: true,
    rating: 5,
  })
}

async function list(url: string): Promise<ListBody> {
  const response = await listRoute(new Request(`http://localhost${url}`))
  expect(response.status).toBe(200)
  return (await response.json()) as ListBody
}

function ids(body: ListBody): string[] {
  return body.records.map((record) => record.id)
}

async function patchRecordMeta(
  id: string,
  body: Record<string, unknown>,
): Promise<{ record: { title: string; favorite: boolean; rating: number | null } }> {
  const response = await patchRecord(
    new Request(`http://localhost/api/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(id),
  )
  expect(response.status).toBe(200)
  return (await response.json()) as {
    record: { title: string; favorite: boolean; rating: number | null }
  }
}

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  await prisma!.promptIteration.deleteMany({})
  await prisma!.promptRecord.deleteMany({})
  await prisma!.llmCall.deleteMany({})
  await prisma!.appSetting.deleteMany({ where: { key: BUDGET_SETTING_KEY } })
  await seedThree()
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('v3 提示词库 API', () => {
  it('搜索命中标题、原始输入与输出正文', async () => {
    expect(ids(await list('/api/records?q=%E6%A0%87%E9%A2%98%E8%AF%8D%E4%B8%99')))
      .toEqual(['rec-favorite'])
    expect(ids(await list('/api/records?q=%E8%BE%93%E5%85%A5%E8%AF%8D%E7%94%B2')))
      .toEqual(['rec-optimize'])
    expect(ids(await list('/api/records?q=%E6%AD%A3%E6%96%87%E8%AF%8D%E4%B9%99')))
      .toEqual(['rec-optimize'])
    expect(ids(await list('/api/records?q=%E5%91%A8%E6%8A%A5'))).toEqual([
      'rec-generate',
    ])
  })

  it('筛选与上海日历日区间返回预期记录', async () => {
    expect(ids(await list('/api/records?filter=favorite'))).toEqual([
      'rec-favorite',
    ])
    expect(ids(await list('/api/records?filter=rated'))).toEqual([
      'rec-favorite',
    ])
    expect(ids(await list('/api/records?filter=generate'))).toEqual([
      'rec-favorite',
      'rec-generate',
    ])
    expect(ids(await list('/api/records?filter=optimize'))).toEqual([
      'rec-optimize',
    ])
    expect(ids(await list('/api/records?targetType=image'))).toEqual([
      'rec-optimize',
    ])
    expect(ids(await list('/api/records?from=2026-11-12&to=2026-11-12'))).toEqual([
      'rec-optimize',
    ])
    expect(ids(await list('/api/records?from=2026-11-13'))).toEqual([
      'rec-favorite',
    ])
    expect(ids(await list('/api/records?to=2026-11-11'))).toEqual([
      'rec-generate',
    ])
  })

  it('PATCH 标题、收藏与评分后列表即时反映，未评分保持 null', async () => {
    const renamed = await patchRecordMeta('rec-generate', {
      title: '新的周报标题',
    })
    expect(renamed.record.title).toBe('新的周报标题')
    expect(ids(await list('/api/records?q=%E6%96%B0%E7%9A%84%E5%91%A8%E6%8A%A5%E6%A0%87%E9%A2%98')))
      .toEqual(['rec-generate'])

    const favorited = await patchRecordMeta('rec-optimize', { favorite: true })
    expect(favorited.record.favorite).toBe(true)
    expect(ids(await list('/api/records?filter=favorite'))).toEqual([
      'rec-favorite',
      'rec-optimize',
    ])

    const rated = await patchRecordMeta('rec-optimize', { rating: 4 })
    expect(rated.record.rating).toBe(4)
    expect(ids(await list('/api/records?filter=rated'))).toEqual([
      'rec-favorite',
      'rec-optimize',
    ])

    const cleared = await patchRecordMeta('rec-optimize', { rating: null })
    expect(cleared.record.rating).toBeNull()
    expect(ids(await list('/api/records?filter=rated'))).toEqual([
      'rec-favorite',
    ])

    const unrated = (await (
      await getRecord(
        new Request('http://localhost/api/records/rec-generate'),
        ctx('rec-generate'),
      )
    ).json()) as DetailBody
    expect(unrated.record.rating).toBeNull()
  })

  it('删除后详情 404、迭代不可再查，账本保留匿名用量', async () => {
    await prisma!.llmCall.create({
      data: {
        stage: 'generate',
        provider: 'mock',
        modelId: 'mock-valid',
        recordId: 'rec-generate',
        iterationId: 'rec-generate-it-1',
        tokensIn: 10,
        tokensOut: 20,
        costCny: 0.001,
      },
    })

    const deleted = await deleteRoute(
      new Request('http://localhost/api/records/rec-generate', {
        method: 'DELETE',
      }),
      ctx('rec-generate'),
    )
    expect(deleted.status).toBe(204)

    const detail = await getRecord(
      new Request('http://localhost/api/records/rec-generate'),
      ctx('rec-generate'),
    )
    expect(detail.status).toBe(404)
    expect(
      await prisma!.promptIteration.count({ where: { recordId: 'rec-generate' } }),
    ).toBe(0)

    const ledger = await prisma!.llmCall.findFirst({
      where: { modelId: 'mock-valid' },
    })
    expect(ledger).toMatchObject({
      recordId: null,
      iterationId: null,
      tokensIn: 10,
      tokensOut: 20,
    })
  })

  it('分页按 limit/offset 返回，第二页不重复', async () => {
    const first = await list('/api/records?limit=1&offset=0')
    expect(first.total).toBe(3)
    expect(first.records).toHaveLength(1)
    expect(ids(first)).toEqual(['rec-favorite'])

    const second = await list('/api/records?limit=1&offset=1')
    expect(second.total).toBe(3)
    expect(ids(second)).toEqual(['rec-optimize'])

    const third = await list('/api/records?limit=1&offset=2')
    expect(ids(third)).toEqual(['rec-generate'])

    const overlap = new Set([...ids(first), ...ids(second), ...ids(third)])
    expect(overlap.size).toBe(3)

    const beyond = await list('/api/records?limit=1&offset=3')
    expect(beyond.records).toHaveLength(0)
    expect(beyond.total).toBe(3)
  })
})
