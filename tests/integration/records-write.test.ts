import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import {
  appendIteration,
  completeIteration,
  createRecord,
  failIteration,
  findIterationByRequestId,
  getRecordWithIterations,
  listRecords,
  RecordInFlightError,
} from '@/lib/db/records'

// 记录与迭代写路径的契约测试。
// 运行环境由 tests/global-setup.ts 提供：独立 data/test.db，绝不碰 data/app.db。

let prisma: ReturnType<typeof getPrisma> = null

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  // 级联删除迭代；LlmCall 不在本模块职责内。
  await prisma!.promptRecord.deleteMany({})
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('createRecord 落库默认值', () => {
  it('title 取输入前 24 字，状态 running，用量与评分未知为 null', async () => {
    const sourceInput =
      '帮我写一段超过二十四个字符长度的需求内容用于验证标题截断逻辑是否正确'
    const record = await createRecord({
      mode: 'generate',
      targetType: 'image',
      sourceInput,
    })
    expect(record.title).toBe(sourceInput.slice(0, 24))
    expect(record.mode).toBe('generate')
    expect(record.targetType).toBe('image')
    expect(record.sourceInput).toBe(sourceInput)
    expect(record.status).toBe('running')
    expect(record.latestOutput).toBe('')
    expect(record.iterationCount).toBe(0)
    expect(record.favorite).toBe(false)
    expect(record.rating).toBeNull()
    expect(record.modelId).toBeNull()
    expect(record.tokensIn).toBeNull()
    expect(record.tokensOut).toBeNull()
    expect(record.costCny).toBeNull()
    expect(record.originTemplateId).toBeNull()
  })

  it('originTemplateId 透传，requestId 不落记录层', async () => {
    const record = await createRecord({
      mode: 'optimize',
      targetType: 'text',
      sourceInput: '原始提示词',
      requestId: 'req-record-level',
      originTemplateId: 'tpl-1',
    })
    expect(record.originTemplateId).toBe('tpl-1')
    // requestId 只存于迭代层：记录表没有该列，落库行上无从读取。
    const row = await prisma!.promptRecord.findUnique({ where: { id: record.id } })
    expect(row).not.toBeNull()
    expect(Object.keys(row!)).not.toContain('requestId')
  })
})

describe('appendIteration 与 completeIteration', () => {
  it('append 后迭代默认 running/空正文；complete 后记录与迭代字段正确', async () => {
    const record = await createRecord({
      mode: 'optimize',
      targetType: 'text',
      sourceInput: '原始提示词',
    })
    const iteration = await appendIteration({
      recordId: record.id,
      seq: 1,
      kind: 'optimize',
      instruction: '更严格',
      requestId: 'req-a',
    })
    expect(iteration.recordId).toBe(record.id)
    expect(iteration.seq).toBe(1)
    expect(iteration.kind).toBe('optimize')
    expect(iteration.instruction).toBe('更严格')
    expect(iteration.requestId).toBe('req-a')
    expect(iteration.status).toBe('running')
    expect(iteration.output).toBe('')
    expect(iteration.notesJson).toBe('[]')

    await completeIteration({
      iterationId: iteration.id,
      recordId: record.id,
      output: '优化后的正文',
      notes: ['补上了角色', '明确了输出格式'],
      modelId: 'doubao-seed-1-6',
      tokensIn: 120,
      tokensOut: 80,
      costCny: 0.012,
      latencyMs: 1500,
      status: 'completed',
    })

    const after = await getRecordWithIterations(record.id)
    expect(after).not.toBeNull()
    expect(after!.status).toBe('completed')
    expect(after!.latestOutput).toBe('优化后的正文')
    expect(after!.iterationCount).toBe(1)
    expect(after!.modelId).toBe('doubao-seed-1-6')
    expect(after!.tokensIn).toBe(120)
    expect(after!.tokensOut).toBe(80)
    expect(after!.costCny).toBeCloseTo(0.012, 6)
    expect(after!.iterations).toHaveLength(1)
    const [completed] = after!.iterations
    expect(completed!.status).toBe('completed')
    expect(completed!.output).toBe('优化后的正文')
    expect(completed!.modelId).toBe('doubao-seed-1-6')
    expect(completed!.tokensIn).toBe(120)
    expect(completed!.tokensOut).toBe(80)
    expect(completed!.latencyMs).toBe(1500)
    expect(JSON.parse(completed!.notesJson)).toEqual(['补上了角色', '明确了输出格式'])
  })

  it('多轮完成后用量按已完成迭代求和，未知迭代不写入 0', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const first = await appendIteration({ recordId: record.id, seq: 1, kind: 'generate' })
    await completeIteration({
      iterationId: first.id,
      recordId: record.id,
      output: '第一版',
      notes: [],
      modelId: 'm-1',
      tokensIn: 100,
      tokensOut: 50,
      costCny: 0.01,
      latencyMs: 1000,
      status: 'completed',
    })
    const second = await appendIteration({ recordId: record.id, seq: 2, kind: 'repair' })
    await completeIteration({
      iterationId: second.id,
      recordId: record.id,
      output: '修复版',
      notes: [],
      modelId: 'm-2',
      tokensIn: null,
      tokensOut: null,
      costCny: null,
      latencyMs: 800,
      status: 'completed',
    })
    const after = await getRecordWithIterations(record.id)
    expect(after!.iterationCount).toBe(2)
    expect(after!.latestOutput).toBe('修复版')
    expect(after!.modelId).toBe('m-2')
    // 聚合只算非 null 值：100 + null = 100
    expect(after!.tokensIn).toBe(100)
    expect(after!.tokensOut).toBe(50)
    expect(after!.costCny).toBeCloseTo(0.01, 6)
  })

  it('全部迭代用量未知时记录用量保持 null，不写 0', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const iteration = await appendIteration({ recordId: record.id, seq: 1, kind: 'generate' })
    await completeIteration({
      iterationId: iteration.id,
      recordId: record.id,
      output: '正文',
      notes: [],
      modelId: null,
      tokensIn: null,
      tokensOut: null,
      costCny: null,
      latencyMs: null,
      status: 'completed',
    })
    const after = await getRecordWithIterations(record.id)
    expect(after!.status).toBe('completed')
    expect(after!.tokensIn).toBeNull()
    expect(after!.tokensOut).toBeNull()
    expect(after!.costCny).toBeNull()
  })

  it('空正文的 canceled 轮不覆盖上一轮 latestOutput，记录仍在提示词库列表里', async () => {
    // C1：继续优化后在任何 delta 之前就停止，服务端把这轮记为 canceled 且正文为空。
    const record = await createRecord({
      mode: 'optimize',
      targetType: 'text',
      sourceInput: '原始提示词',
    })
    const first = await appendIteration({ recordId: record.id, seq: 1, kind: 'optimize' })
    await completeIteration({
      iterationId: first.id,
      recordId: record.id,
      output: '第一轮的完整正文',
      notes: [],
      modelId: 'm-1',
      tokensIn: 10,
      tokensOut: 5,
      costCny: 0.001,
      latencyMs: 400,
      status: 'completed',
    })

    const second = await appendIteration({
      recordId: record.id,
      seq: 2,
      kind: 'optimize',
      instruction: '更严格',
    })
    await completeIteration({
      iterationId: second.id,
      recordId: record.id,
      output: '',
      notes: [],
      modelId: 'm-1',
      tokensIn: null,
      tokensOut: null,
      costCny: null,
      latencyMs: null,
      status: 'canceled',
    })

    const after = await getRecordWithIterations(record.id)
    expect(after!.status).toBe('canceled')
    expect(after!.latestOutput).toBe('第一轮的完整正文')
    expect(after!.iterationCount).toBe(2)
    expect(after!.iterations.map((item) => item.output)).toEqual(['第一轮的完整正文', ''])

    const listing = await listRecords({ limit: 20, offset: 0 })
    expect(listing.records.some((item) => item.id === record.id)).toBe(true)
  })

  it('canceled 迭代计入 iterationCount，latestOutput 为已生成正文', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'video',
      sourceInput: '写一个产品发布视频提示词',
    })
    const iteration = await appendIteration({ recordId: record.id, seq: 1, kind: 'generate' })
    await completeIteration({
      iterationId: iteration.id,
      recordId: record.id,
      output: '已生成的部分正文',
      notes: [],
      modelId: 'm-1',
      tokensIn: 10,
      tokensOut: 5,
      costCny: 0.001,
      latencyMs: 400,
      status: 'canceled',
    })
    const after = await getRecordWithIterations(record.id)
    expect(after!.status).toBe('canceled')
    expect(after!.latestOutput).toBe('已生成的部分正文')
    expect(after!.iterationCount).toBe(1)
    // 已中断轮的用量不计入已完成聚合
    expect(after!.tokensIn).toBeNull()
    expect(after!.tokensOut).toBeNull()
    expect(after!.costCny).toBeNull()
  })

  it('iterations 按 seq 升序返回，未知记录返回 null', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const first = await appendIteration({ recordId: record.id, seq: 1, kind: 'generate' })
    await completeIteration({
      iterationId: first.id,
      recordId: record.id,
      output: '第一轮',
      notes: [],
      modelId: 'm-1',
      tokensIn: 1,
      tokensOut: 1,
      costCny: null,
      latencyMs: 1,
      status: 'completed',
    })
    const second = await appendIteration({ recordId: record.id, seq: 2, kind: 'optimize' })
    const after = await getRecordWithIterations(record.id)
    expect(after!.iterations.map((item) => item.seq)).toEqual([1, 2])
    expect(after!.iterations.map((item) => item.id)).toEqual([first.id, second.id])
    expect(await getRecordWithIterations('nonexistent-id')).toBeNull()
  })
})

describe('appendIteration 并发保护', () => {
  it('已有 running 迭代时拒绝追加；同 requestId 的重放不拒绝', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const requestId = 'req-replay-1'
    const first = await appendIteration({ recordId: record.id, seq: 1, kind: 'generate', requestId })
    await expect(
      appendIteration({ recordId: record.id, seq: 2, kind: 'optimize' }),
    ).rejects.toBeInstanceOf(RecordInFlightError)
    // 同 requestId：跳过在飞检查，交给唯一约束做幂等重放
    await expect(
      appendIteration({ recordId: record.id, seq: 2, kind: 'optimize', requestId }),
    ).rejects.toMatchObject({ code: 'P2002' })
    expect(await prisma!.promptIteration.count({ where: { recordId: record.id } })).toBe(1)
    expect((await prisma!.promptIteration.findUnique({ where: { id: first.id } }))?.status).toBe(
      'running',
    )
  })
})

describe('failIteration', () => {
  it('迭代与记录都置 failed，iterationCount 不变，正文保持空', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const iteration = await appendIteration({ recordId: record.id, seq: 1, kind: 'generate' })
    await failIteration({
      iterationId: iteration.id,
      recordId: record.id,
      modelId: 'm-1',
      errorCode: 'UPSTREAM_TIMEOUT',
    })
    const after = await getRecordWithIterations(record.id)
    expect(after!.status).toBe('failed')
    expect(after!.iterationCount).toBe(0)
    expect(after!.latestOutput).toBe('')
    expect(after!.iterations).toHaveLength(1)
    const [failed] = after!.iterations
    expect(failed!.status).toBe('failed')
    expect(failed!.output).toBe('')
    expect(failed!.modelId).toBe('m-1')
  })

  it('继续优化失败只标迭代：记录保持 completed，最新正文不被清空', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const first = await appendIteration({ recordId: record.id, seq: 1, kind: 'generate' })
    await completeIteration({
      iterationId: first.id,
      recordId: record.id,
      output: '第一轮的完整正文',
      notes: [],
      modelId: 'm-1',
      tokensIn: 1,
      tokensOut: 1,
      costCny: null,
      latencyMs: 1,
      status: 'completed',
    })
    const second = await appendIteration({ recordId: record.id, seq: 2, kind: 'optimize' })
    await failIteration({
      iterationId: second.id,
      recordId: record.id,
      modelId: 'm-1',
      errorCode: 'UPSTREAM_TIMEOUT',
    })
    const after = await getRecordWithIterations(record.id)
    expect(after!.status).toBe('completed')
    expect(after!.latestOutput).toBe('第一轮的完整正文')
    expect(after!.iterationCount).toBe(1)
    expect(after!.iterations.map((it) => it.status)).toEqual(['completed', 'failed'])
  })
})

describe('findIterationByRequestId', () => {
  it('命中返回迭代，未命中返回 null', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const iteration = await appendIteration({
      recordId: record.id,
      seq: 1,
      kind: 'generate',
      requestId: 'req-find-me',
    })
    const hit = await findIterationByRequestId('req-find-me')
    expect(hit).not.toBeNull()
    expect(hit!.id).toBe(iteration.id)
    expect(hit!.recordId).toBe(record.id)
    expect(await findIterationByRequestId('req-missing')).toBeNull()
  })
})

describe('唯一约束冲突', () => {
  it('同记录同 seq 抛 P2002', async () => {
    const record = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const first = await appendIteration({
      recordId: record.id,
      seq: 1,
      kind: 'generate',
      requestId: 'req-seq-1',
    })
    await completeIteration({
      iterationId: first.id,
      recordId: record.id,
      output: '第一轮',
      notes: [],
      modelId: 'm-1',
      tokensIn: 1,
      tokensOut: 1,
      costCny: null,
      latencyMs: 1,
      status: 'completed',
    })
    await expect(
      appendIteration({ recordId: record.id, seq: 1, kind: 'optimize', requestId: 'req-seq-2' }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('跨记录重复 requestId 抛 P2002', async () => {
    const first = await createRecord({
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
    })
    const second = await createRecord({
      mode: 'optimize',
      targetType: 'text',
      sourceInput: '另一份原始提示词',
    })
    await appendIteration({
      recordId: first.id,
      seq: 1,
      kind: 'generate',
      requestId: 'req-dup',
    })
    await expect(
      appendIteration({ recordId: second.id, seq: 1, kind: 'optimize', requestId: 'req-dup' }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})
