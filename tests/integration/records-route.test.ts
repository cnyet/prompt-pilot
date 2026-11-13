import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as listRoute } from '@/app/api/records/route'
import {
  DELETE as deleteRoute,
  GET as detailRoute,
  PATCH as patchRoute,
} from '@/app/api/records/[id]/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import {
  appendIteration,
  completeIteration,
  createRecord,
  failIteration,
  type RecordSummary,
} from '@/lib/db/records'

// 记录读取 / 修改 / 删除 API 的契约测试。
// 数据在隔离的 data/test.db；路由直接以 Request 调用，不起 HTTP 服务。

let prisma: ReturnType<typeof getPrisma> = null

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const listGet = (qs = '') =>
  listRoute(new Request(`http://localhost/api/records${qs}`))

const detailGet = (id: string) =>
  detailRoute(new Request(`http://localhost/api/records/${id}`), ctx(id))

const patchReq = (id: string, body: unknown) =>
  patchRoute(
    new Request(`http://localhost/api/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(id),
  )

const deleteReq = (id: string) =>
  deleteRoute(
    new Request(`http://localhost/api/records/${id}`, { method: 'DELETE' }),
    ctx(id),
  )

interface SeedOptions {
  mode?: 'generate' | 'optimize'
  targetType?: 'text' | 'image' | 'video'
  sourceInput?: string
  output?: string
  notes?: string[]
  favorite?: boolean
  rating?: number | null
  title?: string
  updatedAt?: Date
  copiedAt?: Date | null
  originTemplateId?: string | null
  status?: 'completed' | 'canceled'
}

/** 造一条「已完成」记录：createRecord + appendIteration + completeIteration，再覆盖可选字段。 */
async function seed(options: SeedOptions = {}): Promise<string> {
  const record = await createRecord({
    mode: options.mode ?? 'generate',
    targetType: options.targetType ?? 'text',
    sourceInput: options.sourceInput ?? '帮我写个周报',
    originTemplateId: options.originTemplateId ?? null,
  })
  const iteration = await appendIteration({
    recordId: record.id,
    seq: 1,
    kind: options.mode ?? 'generate',
  })
  await completeIteration({
    iterationId: iteration.id,
    recordId: record.id,
    output: options.output ?? '周报提示词正文',
    notes: options.notes ?? [],
    modelId: 'mock',
    tokensIn: 10,
    tokensOut: 20,
    costCny: 0.001,
    latencyMs: 500,
    status: options.status ?? 'completed',
  })
  const data: {
    title?: string
    favorite?: boolean
    rating?: number | null
    updatedAt?: Date
    copiedAt?: Date | null
  } = {}
  if (options.title !== undefined) data.title = options.title
  if (options.favorite !== undefined) data.favorite = options.favorite
  if (options.rating !== undefined) data.rating = options.rating
  if (options.updatedAt !== undefined) data.updatedAt = options.updatedAt
  if (options.copiedAt !== undefined) data.copiedAt = options.copiedAt
  if (Object.keys(data).length > 0) {
    await prisma!.promptRecord.update({ where: { id: record.id }, data })
  }
  return record.id
}

interface ListBody {
  records: RecordSummary[]
  total: number
  limit: number
  offset: number
}

interface DetailBody {
  record: RecordSummary & {
    latestOutput: string
    copiedAt: string | null
    originTemplateId: string | null
    iterations: Array<{
      id: string
      seq: number
      kind: string
      instruction: string | null
      output: string
      notes: string[]
      modelId: string | null
      tokensIn: number | null
      tokensOut: number | null
      costCny: number | null
      latencyMs: number | null
      status: string
      createdAt: string
    }>
  }
}

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  await prisma!.llmCall.deleteMany({})
  // 级联删除迭代
  await prisma!.promptRecord.deleteMany({})
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('GET /api/records 列表', () => {
  it('默认按最近处理倒序，空正文记录不出现，响应不含正文', async () => {
    const older = await seed({ updatedAt: new Date('2026-11-01T10:00:00.000Z') })
    const newest = await seed({ updatedAt: new Date('2026-11-03T10:00:00.000Z') })
    const middle = await seed({ updatedAt: new Date('2026-11-02T10:00:00.000Z') })
    const empty = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '还在生成',
    })
    await prisma!.promptRecord.update({
      where: { id: empty.id },
      data: { updatedAt: new Date('2026-11-04T10:00:00.000Z') },
    })

    const response = await listGet()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = (await response.json()) as ListBody
    expect(body.records.map((record) => record.id)).toEqual([newest, middle, older])
    expect(body.total).toBe(3)
    expect(body.limit).toBe(20)
    expect(body.offset).toBe(0)
    expect(body.records[0]).not.toHaveProperty('latestOutput')
  })

  it('q 命中标题、原始输入与输出正文任一', async () => {
    const titleHit = await seed({
      title: '独特词标题',
      sourceInput: '无关输入一',
      output: '无关输出一',
    })
    const inputHit = await seed({
      title: '普通标题二',
      sourceInput: '无关输入二独特词',
      output: '无关输出二',
    })
    const outputHit = await seed({
      title: '普通标题三',
      sourceInput: '无关输入三',
      output: '无关输出三独特词',
    })
    const miss = await seed({
      title: '普通标题四',
      sourceInput: '无关输入四',
      output: '无关输出四',
    })

    const body = (await (await listGet('?q=独特词')).json()) as ListBody
    expect(new Set(body.records.map((record) => record.id))).toEqual(
      new Set([titleHit, inputHit, outputHit]),
    )
    expect(body.total).toBe(3)
    expect(body.records.some((record) => record.id === miss)).toBe(false)

    // 首尾空格会被去掉
    const padded = (await (await listGet('?q=%20%20独特词%20')).json()) as ListBody
    expect(padded.total).toBe(3)
  })

  it('favorite / rated / generate / optimize 与 targetType 组合过滤', async () => {
    const favGenerate = await seed({ favorite: true })
    const ratedOptimize = await seed({ rating: 4, mode: 'optimize' })
    const imageGenerate = await seed({ targetType: 'image' })
    const plainVideo = await seed({ targetType: 'video', mode: 'optimize' })

    const favorite = (await (await listGet('?filter=favorite')).json()) as ListBody
    expect(favorite.records.map((record) => record.id)).toEqual([favGenerate])

    const rated = (await (await listGet('?filter=rated')).json()) as ListBody
    expect(rated.records.map((record) => record.id)).toEqual([ratedOptimize])

    const generate = (await (await listGet('?filter=generate')).json()) as ListBody
    expect(new Set(generate.records.map((record) => record.id))).toEqual(
      new Set([favGenerate, imageGenerate]),
    )

    const optimize = (await (await listGet('?filter=optimize')).json()) as ListBody
    expect(new Set(optimize.records.map((record) => record.id))).toEqual(
      new Set([ratedOptimize, plainVideo]),
    )

    const image = (await (await listGet('?targetType=image')).json()) as ListBody
    expect(image.records.map((record) => record.id)).toEqual([imageGenerate])

    const generateImage = (
      await (await listGet('?filter=generate&targetType=image')).json()
    ) as ListBody
    expect(generateImage.records.map((record) => record.id)).toEqual([imageGenerate])

    const all = (await (await listGet('?filter=all')).json()) as ListBody
    expect(all.total).toBe(4)
  })

  it('from/to 按上海日历日闭区间过滤', async () => {
    // 上海为 UTC+8 且无夏令时：上海某日 00:00 = 前一日 16:00Z。
    const beforeDay = await seed({ updatedAt: new Date('2026-11-12T15:59:00.000Z') }) // 11-12 23:59 上海
    const dayStart = await seed({ updatedAt: new Date('2026-11-12T16:00:00.000Z') }) // 11-13 00:00 上海
    const midday = await seed({ updatedAt: new Date('2026-11-13T10:00:00.000Z') }) // 11-13 18:00 上海
    const dayEnd = await seed({ updatedAt: new Date('2026-11-13T15:59:00.000Z') }) // 11-13 23:59 上海
    const nextDayStart = await seed({ updatedAt: new Date('2026-11-13T16:00:00.000Z') }) // 11-14 00:00 上海

    // to 含整日：上海 11-13 23:59 命中，次日 00:00 排除。
    const onlyTo = (await (await listGet('?to=2026-11-13')).json()) as ListBody
    expect(new Set(onlyTo.records.map((record) => record.id))).toEqual(
      new Set([beforeDay, dayStart, midday, dayEnd]),
    )
    expect(onlyTo.records.some((record) => record.id === nextDayStart)).toBe(false)

    // from 从上海当日 00:00 起：前一日 23:59 排除。
    const onlyFrom = (await (await listGet('?from=2026-11-13')).json()) as ListBody
    expect(new Set(onlyFrom.records.map((record) => record.id))).toEqual(
      new Set([dayStart, midday, dayEnd, nextDayStart]),
    )
    expect(onlyFrom.records.some((record) => record.id === beforeDay)).toBe(false)

    // 同一上海日内 from+to 为闭区间。
    const both = (
      await (await listGet('?from=2026-11-13&to=2026-11-13')).json()
    ) as ListBody
    expect(new Set(both.records.map((record) => record.id))).toEqual(
      new Set([dayStart, midday, dayEnd]),
    )

    // 次日 00:00 归属次日。
    const nextDay = (await (await listGet('?from=2026-11-14')).json()) as ListBody
    expect(nextDay.records.map((record) => record.id)).toEqual([nextDayStart])
  })

  it('同 updatedAt 时按 id desc 兜底，分页无重复', async () => {
    const sameAt = new Date('2026-11-05T08:00:00.000Z')
    const first = await seed({ updatedAt: sameAt })
    const second = await seed({ updatedAt: sameAt })

    const page1 = (await (await listGet('?limit=1&offset=0')).json()) as ListBody
    const page2 = (await (await listGet('?limit=1&offset=1')).json()) as ListBody
    expect(page1.total).toBe(2)
    expect(page2.total).toBe(2)
    expect(page1.records).toHaveLength(1)
    expect(page2.records).toHaveLength(1)

    const firstId = page1.records[0]!.id
    const secondId = page2.records[0]!.id
    expect(new Set([firstId, secondId])).toEqual(new Set([first, second]))
    expect(firstId > secondId).toBe(true)
  })

  it('非法查询参数返回 400 INVALID_QUERY', async () => {
    const cases = [
      '?limit=0',
      '?limit=51',
      '?limit=x',
      '?offset=-1',
      '?offset=1.5',
      '?filter=bogus',
      '?targetType=bogus',
      '?q=',
      `?q=${'a'.repeat(201)}`,
      '?from=not-a-date',
      '?from=2026-02-30',
      '?to=2026-13-01',
    ]
    for (const qs of cases) {
      const response = await listGet(qs)
      expect(response.status, qs).toBe(400)
      expect(await response.json(), qs).toMatchObject({ code: 'INVALID_QUERY' })
    }
  })
})

describe('GET /api/records/[id] 详情', () => {
  it('返回摘要、正文与解析后的迭代 notes', async () => {
    const id = await seed({
      notes: ['补上了角色', '明确了输出格式'],
      originTemplateId: 'tpl-9',
      copiedAt: new Date('2026-11-06T02:00:00.000Z'),
    })

    const response = await detailGet(id)
    expect(response.status).toBe(200)
    const body = (await response.json()) as DetailBody
    expect(body.record.id).toBe(id)
    expect(body.record.latestOutput).toBe('周报提示词正文')
    expect(body.record.copiedAt).toBe('2026-11-06T02:00:00.000Z')
    expect(body.record.originTemplateId).toBe('tpl-9')
    expect(body.record).not.toHaveProperty('notesJson')
    expect(body.record.iterations).toHaveLength(1)

    const iteration = body.record.iterations[0]!
    expect(iteration).toMatchObject({
      seq: 1,
      kind: 'generate',
      instruction: null,
      output: '周报提示词正文',
      notes: ['补上了角色', '明确了输出格式'],
      modelId: 'mock',
      tokensIn: 10,
      tokensOut: 20,
      status: 'completed',
    })
    expect(iteration.createdAt).toBeTypeOf('string')
    expect(iteration).not.toHaveProperty('notesJson')
  })

  it('记录不存在返回 404 RECORD_NOT_FOUND', async () => {
    const response = await detailGet('missing-id')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      code: 'RECORD_NOT_FOUND',
      retryable: false,
    })
  })
})

describe('PATCH /api/records/[id] 修改', () => {
  it('改名成功且 updatedAt 不变，列表顺序不受影响', async () => {
    const older = await seed({ updatedAt: new Date('2026-11-01T10:00:00.000Z') })
    const newer = await seed({ updatedAt: new Date('2026-11-03T10:00:00.000Z') })

    const before = (await (await listGet()).json()) as ListBody
    expect(before.records.map((record) => record.id)).toEqual([newer, older])
    const originalUpdatedAt = before.records.find((record) => record.id === older)!.updatedAt

    const response = await patchReq(older, { title: '季度复盘周报' })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { record: RecordSummary }
    expect(body.record.title).toBe('季度复盘周报')
    expect(body.record.updatedAt).toBe(originalUpdatedAt)
    expect(body.record).not.toHaveProperty('latestOutput')

    const after = (await (await listGet()).json()) as ListBody
    expect(after.records.map((record) => record.id)).toEqual([newer, older])
  })

  it('completed 与 canceled 记录可改收藏与评分，rating null 清除评分', async () => {
    const completed = await seed()
    const canceled = await seed({ status: 'canceled' })

    const favorite = await patchReq(completed, { favorite: true })
    expect(favorite.status).toBe(200)
    expect(((await favorite.json()) as { record: RecordSummary }).record.favorite).toBe(true)

    const rated = await patchReq(completed, { rating: 5 })
    expect(rated.status).toBe(200)
    expect(((await rated.json()) as { record: RecordSummary }).record.rating).toBe(5)

    const cleared = await patchReq(completed, { rating: null })
    expect(cleared.status).toBe(200)
    expect(((await cleared.json()) as { record: RecordSummary }).record.rating).toBeNull()

    const canceledFavorite = await patchReq(canceled, { favorite: true })
    expect(canceledFavorite.status).toBe(200)
    expect(
      ((await canceledFavorite.json()) as { record: RecordSummary }).record.favorite,
    ).toBe(true)
  })

  it('rating 只接受 1 到 5 或 null', async () => {
    const id = await seed()
    for (const rating of [0, 6, 'x']) {
      const response = await patchReq(id, { rating })
      expect(response.status, String(rating)).toBe(400)
      expect(await response.json(), String(rating)).toMatchObject({
        code: 'INVALID_INPUT',
      })
    }
  })

  it('running 与 failed 记录拒绝收藏评分，但允许改名', async () => {
    const running = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '还在生成',
    })
    const failed = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '失败的记录',
    })
    const failedIteration = await appendIteration({
      recordId: failed.id,
      seq: 1,
      kind: 'generate',
    })
    await failIteration({
      iterationId: failedIteration.id,
      recordId: failed.id,
      modelId: 'mock',
      errorCode: 'UPSTREAM_TIMEOUT',
    })

    for (const id of [running.id, failed.id]) {
      const response = await patchReq(id, { favorite: true })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        code: 'RECORD_NOT_READY',
        retryable: false,
      })
    }

    const renamed = await patchReq(failed.id, { title: '可改的标题' })
    expect(renamed.status).toBe(200)
    expect(((await renamed.json()) as { record: RecordSummary }).record.title).toBe(
      '可改的标题',
    )
  })

  it('空对象与未知字段返回 400，记录不存在返回 404', async () => {
    const id = await seed()

    const empty = await patchReq(id, {})
    expect(empty.status).toBe(400)
    expect(await empty.json()).toMatchObject({ code: 'INVALID_INPUT' })

    const unknown = await patchReq(id, { foo: 1 })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toMatchObject({ code: 'INVALID_INPUT' })

    const missing = await patchReq('missing-id', { title: 'x' })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ code: 'RECORD_NOT_FOUND' })
  })
})

describe('DELETE /api/records/[id] 删除', () => {
  it('删除记录与迭代，llmCall 保留匿名用量', async () => {
    const id = await seed()
    const iteration = await prisma!.promptIteration.findFirstOrThrow({
      where: { recordId: id },
    })
    await prisma!.llmCall.create({
      data: { stage: 'generate', provider: 'mock', modelId: 'mock', recordId: id },
    })
    await prisma!.llmCall.create({
      data: {
        stage: 'generate',
        provider: 'mock',
        modelId: 'mock',
        recordId: id,
        iterationId: iteration.id,
      },
    })

    const response = await deleteReq(id)
    expect(response.status).toBe(204)
    expect(await prisma!.promptRecord.findUnique({ where: { id } })).toBeNull()
    expect(await prisma!.promptIteration.count({ where: { recordId: id } })).toBe(0)

    const ledger = await prisma!.llmCall.findMany({})
    expect(ledger).toHaveLength(2)
    for (const row of ledger) {
      expect(row.recordId).toBeNull()
      expect(row.iterationId).toBeNull()
      expect(row.stage).toBe('generate')
    }

    // 幂等：重复删除仍返回 204
    const again = await deleteReq(id)
    expect(again.status).toBe(204)
  })

  it('running 记录或 running 迭代返回 409 ITERATION_IN_FLIGHT', async () => {
    const running = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '还在生成',
    })
    const runningResponse = await deleteReq(running.id)
    expect(runningResponse.status).toBe(409)
    expect(await runningResponse.json()).toMatchObject({
      code: 'ITERATION_IN_FLIGHT',
      retryable: false,
    })

    const completed = await seed()
    await appendIteration({ recordId: completed, seq: 2, kind: 'optimize' })
    const inFlight = await deleteReq(completed)
    expect(inFlight.status).toBe(409)
    expect(await inFlight.json()).toMatchObject({ code: 'ITERATION_IN_FLIGHT' })
    expect(
      await prisma!.promptRecord.findUnique({ where: { id: completed } }),
    ).not.toBeNull()
  })

  it('删除不存在的记录返回 204', async () => {
    const response = await deleteReq('missing-id')
    expect(response.status).toBe(204)
  })
})
