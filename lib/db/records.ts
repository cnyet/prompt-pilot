import type { PromptIteration, PromptRecord, Prisma } from '@prisma/client'
import { getPrisma } from './prisma'

/**
 * v3 记录与迭代的写路径数据层（ROADMAP-V3 §2.1）。
 *
 * 语义要点：
 * 1. 记录级状态只有 running / completed / canceled / failed；失败轮不计入
 *    iterationCount，完成与已中断轮都计入。
 * 2. 记录上的 tokens / cost 是全部已完成迭代的聚合值，用聚合查询算出，
 *    不做简单覆盖；聚合结果为 null 时写 null，未知绝不落 0。
 * 3. requestId 只存于迭代层（记录层幂等 LRU 在路由内做，不落库）；
 *    requestId 或 (recordId, seq) 冲突时 Prisma P2002 直接冒泡，由路由捕获。
 */

/** 迭代完成态：正常完成或用户中断（已中断轮保留正文并入库）。 */
export type IterationFinalStatus = 'completed' | 'canceled'

export type PromptRecordRow = PromptRecord
export type PromptIterationRow = PromptIteration

export type RecordWithIterations = Prisma.PromptRecordGetPayload<{
  include: { iterations: true }
}>

/** 数据库不可用等基础设施错误；Prisma 约束错误（P2002 等）原样冒泡。 */
export class RecordsStoreError extends Error {
  readonly code: 'DATABASE_UNAVAILABLE'

  constructor(message: string) {
    super(message)
    this.name = 'RecordsStoreError'
    this.code = 'DATABASE_UNAVAILABLE'
  }
}

function requirePrisma() {
  const prisma = getPrisma()
  if (!prisma) {
    throw new RecordsStoreError('数据库不可用，提示词记录暂无法写入。')
  }
  return prisma
}

export interface CreateRecordInput {
  mode: 'generate' | 'optimize'
  targetType: 'text' | 'image' | 'video'
  sourceInput: string
  requestId?: string | null
  originTemplateId?: string | null
}

/** 创建记录：标题先取输入前 24 字（模型短标题落地时再覆盖）。 */
export async function createRecord(
  input: CreateRecordInput,
): Promise<PromptRecordRow> {
  const prisma = requirePrisma()
  return prisma.promptRecord.create({
    data: {
      title: input.sourceInput.slice(0, 24),
      mode: input.mode,
      targetType: input.targetType,
      sourceInput: input.sourceInput,
      originTemplateId: input.originTemplateId ?? null,
    },
  })
}

export interface AppendIterationInput {
  recordId: string
  seq: number
  kind: 'generate' | 'optimize' | 'repair'
  instruction?: string | null
  requestId?: string | null
}

/** 同一记录已有进行中的迭代时抛出，路由据此拒绝并发续写。 */
export class RecordInFlightError extends Error {}

/**
 * 追加一轮迭代：初始 running、空正文。同一记录已有 running 迭代时抛 RecordInFlightError；
 * 同 requestId 的重放不做该检查，交给唯一约束（P2002）走幂等重放。
 */
export async function appendIteration(
  input: AppendIterationInput,
): Promise<PromptIterationRow> {
  const prisma = requirePrisma()
  return prisma.$transaction(async (tx) => {
    const replay = input.requestId
      ? await tx.promptIteration.findUnique({ where: { requestId: input.requestId }, select: { id: true } })
      : null
    if (!replay) {
      const running = await tx.promptIteration.findFirst({
        where: { recordId: input.recordId, status: 'running' },
        select: { id: true },
      })
      if (running) throw new RecordInFlightError('这一条正在处理，等它完成再继续。')
    }
    return tx.promptIteration.create({
      data: {
        recordId: input.recordId,
        seq: input.seq,
        kind: input.kind,
        instruction: input.instruction ?? null,
        requestId: input.requestId ?? null,
      },
    })
  })
}

export interface CompleteIterationInput {
  iterationId: string
  recordId: string
  output: string
  notes: string[]
  modelId: string | null
  tokensIn: number | null
  tokensOut: number | null
  costCny: number | null
  latencyMs: number | null
  status: IterationFinalStatus
}

/** 聚合结果是 null（无已完成迭代或全未知）时保持 null，不写 0。 */
function sumOrNull(value: number | null): number | null {
  return value === null ? null : value
}

/**
 * 完成一轮迭代：事务内更新迭代正文与用量，并把记录推进到完成或已中断。
 *
 * 记录上的 tokens / cost 取该记录全部已完成迭代之和（聚合查询）；
 * costCny 先 toFixed(6) 再回 Number，规避 Float 累加精度漂移。
 */
export async function completeIteration(
  input: CompleteIterationInput,
): Promise<void> {
  const prisma = requirePrisma()
  await prisma.$transaction(async (tx) => {
    await tx.promptIteration.update({
      where: { id: input.iterationId },
      data: {
        output: input.output,
        notesJson: JSON.stringify(input.notes),
        modelId: input.modelId,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costCny: input.costCny,
        latencyMs: input.latencyMs,
        status: input.status,
      },
    })
    const usageAggregate = await tx.promptIteration.aggregate({
      where: { recordId: input.recordId, status: 'completed' },
      _sum: { tokensIn: true, tokensOut: true, costCny: true },
    })
    const costSum = usageAggregate._sum.costCny
    await tx.promptRecord.update({
      where: { id: input.recordId },
      data: {
        latestOutput: input.output,
        status: input.status,
        iterationCount: { increment: 1 },
        modelId: input.modelId,
        tokensIn: sumOrNull(usageAggregate._sum.tokensIn),
        tokensOut: sumOrNull(usageAggregate._sum.tokensOut),
        costCny: costSum === null ? null : Number(costSum.toFixed(6)),
      },
    })
  })
}

/**
 * 标记一轮迭代失败：迭代置 failed，正文保持空。
 * 首轮失败（iterationCount 为 0）时记录置 failed；继续优化失败只标迭代，记录保持原状，
 * 最新可用结果不受影响，仍可评分与收藏。失败轮不计入 iterationCount；
 * errorCode 不落迭代表（由调用账本记录）。
 */
export async function failIteration(input: {
  iterationId: string
  recordId: string
  modelId: string | null
  errorCode: string | null
}): Promise<void> {
  const prisma = requirePrisma()
  await prisma.$transaction(async (tx) => {
    await tx.promptIteration.update({
      where: { id: input.iterationId },
      data: {
        status: 'failed',
        output: '',
        modelId: input.modelId,
      },
    })
    const record = await tx.promptRecord.findUnique({
      where: { id: input.recordId },
      select: { iterationCount: true },
    })
    if (record?.iterationCount === 0) {
      await tx.promptRecord.update({
        where: { id: input.recordId },
        data: { status: 'failed' },
      })
    }
  })
}

/** 记录详情：含全部迭代，按 seq 升序；供 Batch D 详情与重放断言。 */
export async function getRecordWithIterations(
  recordId: string,
): Promise<RecordWithIterations | null> {
  const prisma = requirePrisma()
  return prisma.promptRecord.findUnique({
    where: { id: recordId },
    include: { iterations: { orderBy: { seq: 'asc' } } },
  })
}

/** 迭代层幂等兜底：按 requestId 找到已落库的迭代。 */
export async function findIterationByRequestId(
  requestId: string,
): Promise<PromptIterationRow | null> {
  const prisma = requirePrisma()
  return prisma.promptIteration.findUnique({ where: { requestId } })
}

/* ---------- v3 记录读取 / 修改 / 删除（Batch D） ---------- */

/** 列表与详情共用的记录摘要；不含正文 latestOutput。 */
export interface RecordSummary {
  id: string
  title: string
  mode: string
  targetType: string
  sourceInput: string
  status: string
  favorite: boolean
  rating: number | null
  modelId: string | null
  iterationCount: number
  tokensIn: number | null
  tokensOut: number | null
  costCny: number | null
  createdAt: Date
  updatedAt: Date
}

export interface ListRecordsQuery {
  q?: string
  filter?: 'all' | 'favorite' | 'rated' | 'generate' | 'optimize'
  targetType?: 'text' | 'image' | 'video'
  /** 起始时刻，含；由路由换算为上海日历日 00:00。 */
  fromInclusive?: Date
  /** 结束时刻，不含；由路由换算为结束日的次日上海 00:00。 */
  toExclusive?: Date
  limit: number
  offset: number
}

/** 记录不存在。 */
export class RecordNotFoundError extends Error {
  constructor(message = '没有找到这条记录。') {
    super(message)
    this.name = 'RecordNotFoundError'
  }
}

/** 记录尚无可用结果：收藏与评分类操作暂不可用。 */
export class RecordNotReadyError extends Error {
  constructor(message = '记录还在处理中或没有可用结果，暂时不能评分或收藏。') {
    super(message)
    this.name = 'RecordNotReadyError'
  }
}

/** 行 → 摘要：只暴露列表契约字段，正文与内部列不外泄。 */
export function toRecordSummary(record: PromptRecordRow): RecordSummary {
  return {
    id: record.id,
    title: record.title,
    mode: record.mode,
    targetType: record.targetType,
    sourceInput: record.sourceInput,
    status: record.status,
    favorite: record.favorite,
    rating: record.rating,
    modelId: record.modelId,
    iterationCount: record.iterationCount,
    tokensIn: record.tokensIn,
    tokensOut: record.tokensOut,
    costCny: record.costCny,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/**
 * 提示词库列表：只收有正文的记录，按最近处理倒序，id 倒序兜底保证分页稳定。
 * 返回的摘要不含 latestOutput，正文只在详情接口返回。
 */
export async function listRecords(
  query: ListRecordsQuery,
): Promise<{ records: RecordSummary[]; total: number }> {
  const prisma = requirePrisma()
  const where: Prisma.PromptRecordWhereInput = { latestOutput: { not: '' } }
  if (query.q) {
    where.OR = [
      { title: { contains: query.q } },
      { sourceInput: { contains: query.q } },
      { latestOutput: { contains: query.q } },
    ]
  }
  if (query.filter === 'favorite') where.favorite = true
  if (query.filter === 'rated') where.rating = { not: null }
  if (query.filter === 'generate' || query.filter === 'optimize') {
    where.mode = query.filter
  }
  if (query.targetType) where.targetType = query.targetType
  if (query.fromInclusive || query.toExclusive) {
    where.updatedAt = {
      ...(query.fromInclusive ? { gte: query.fromInclusive } : {}),
      ...(query.toExclusive ? { lt: query.toExclusive } : {}),
    }
  }

  const [records, total] = await Promise.all([
    prisma.promptRecord.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: query.offset,
      take: query.limit,
      select: {
        id: true,
        title: true,
        mode: true,
        targetType: true,
        sourceInput: true,
        status: true,
        favorite: true,
        rating: true,
        modelId: true,
        iterationCount: true,
        tokensIn: true,
        tokensOut: true,
        costCny: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.promptRecord.count({ where }),
  ])
  return { records, total }
}

export interface UpdateRecordMetaInput {
  recordId: string
  title?: string
  favorite?: boolean
  rating?: number | null
}

/**
 * 改名 / 收藏 / 评分。改名任何状态都可执行；收藏与评分只对 completed / canceled
 * 开放（running 还在处理，failed 没有可用结果）。
 * updatedAt 显式写回读到的值，元数据编辑不改变「最近处理」排序。
 */
export async function updateRecordMeta(
  input: UpdateRecordMetaInput,
): Promise<PromptRecordRow> {
  const prisma = requirePrisma()
  const record = await prisma.promptRecord.findUnique({ where: { id: input.recordId } })
  if (!record) throw new RecordNotFoundError()

  const wantsRatingChange = input.rating !== undefined || input.favorite !== undefined
  if (wantsRatingChange && !['completed', 'canceled'].includes(record.status)) {
    throw new RecordNotReadyError()
  }

  const data: Prisma.PromptRecordUpdateInput = {}
  if (input.title !== undefined) data.title = input.title
  if (input.favorite !== undefined) data.favorite = input.favorite
  if (input.rating !== undefined) data.rating = input.rating

  return prisma.promptRecord.update({
    where: { id: record.id },
    data: { ...data, updatedAt: record.updatedAt },
  })
}

/**
 * 删除记录与迭代正文；调用账本只置空关联，保留匿名用量（FR-11.2）。
 * 并发下记录已被删掉时 Prisma 抛 P2025，由路由当作幂等删除处理。
 */
export async function deleteRecord(recordId: string): Promise<void> {
  const prisma = requirePrisma()
  await prisma.$transaction(async (tx) => {
    const iterations = await tx.promptIteration.findMany({
      where: { recordId },
      select: { id: true },
    })
    await tx.llmCall.updateMany({
      where: {
        OR: [{ recordId }, { iterationId: { in: iterations.map((iteration) => iteration.id) } }],
      },
      data: { recordId: null, iterationId: null },
    })
    await tx.promptRecord.delete({ where: { id: recordId } })
  })
}
