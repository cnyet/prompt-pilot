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

/** 追加一轮迭代：初始 running、空正文；唯一约束冲突让 P2002 冒泡。 */
export async function appendIteration(
  input: AppendIterationInput,
): Promise<PromptIterationRow> {
  const prisma = requirePrisma()
  return prisma.promptIteration.create({
    data: {
      recordId: input.recordId,
      seq: input.seq,
      kind: input.kind,
      instruction: input.instruction ?? null,
      requestId: input.requestId ?? null,
    },
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
 * 标记一轮迭代失败：迭代与记录都置 failed，正文保持空。
 * 失败轮不计入 iterationCount；errorCode 不落迭代表（由调用账本记录）。
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
    await tx.promptRecord.update({
      where: { id: input.recordId },
      data: { status: 'failed' },
    })
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
