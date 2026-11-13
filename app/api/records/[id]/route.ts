/**
 * GET /api/records/[id]：记录详情（摘要 + 正文 + 迭代时间线）。
 * PATCH：改名 / 收藏 / 评分；收藏与评分仅对 completed / canceled 开放。
 * DELETE：删除记录与迭代，调用账本置空关联后保留匿名用量。
 */
import { z } from 'zod'
import {
  RecordNotFoundError,
  RecordNotReadyError,
  deleteRecord,
  getRecordWithIterations,
  toRecordSummary,
  updateRecordMeta,
} from '@/lib/db/records'
import { jsonError } from '@/lib/engine/stream-v3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(120).optional(),
    favorite: z.boolean().optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少要修改一个字段。',
  })

interface RouteContext {
  params: Promise<{ id: string }>
}

function noStoreJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/** notesJson 解析失败时降级为空说明，不影响正文。 */
function parseNotes(notesJson: string): string[] {
  try {
    const value: unknown = JSON.parse(notesJson)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function isPrismaNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2025'
  )
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params
  try {
    const record = await getRecordWithIterations(id)
    if (!record) return jsonError(404, 'RECORD_NOT_FOUND', '没有找到这条记录。')
    return noStoreJson({
      record: {
        ...toRecordSummary(record),
        latestOutput: record.latestOutput,
        copiedAt: record.copiedAt,
        originTemplateId: record.originTemplateId,
        iterations: record.iterations.map((iteration) => ({
          id: iteration.id,
          seq: iteration.seq,
          kind: iteration.kind,
          instruction: iteration.instruction,
          output: iteration.output,
          notes: parseNotes(iteration.notesJson),
          modelId: iteration.modelId,
          tokensIn: iteration.tokensIn,
          tokensOut: iteration.tokensOut,
          costCny: iteration.costCny,
          latencyMs: iteration.latencyMs,
          status: iteration.status,
          createdAt: iteration.createdAt,
        })),
      },
    })
  } catch {
    return jsonError(500, 'INTERNAL', '记录读取失败，请稍后重试。')
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError(400, 'INVALID_INPUT', '请求体不是合法的 JSON。')
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const field = first?.path.join('.') || '请求体'
    return jsonError(
      400,
      'INVALID_INPUT',
      `输入不符合要求（${field}）：${first?.message ?? '格式错误'}`,
    )
  }

  try {
    const record = await updateRecordMeta({ recordId: id, ...parsed.data })
    return noStoreJson({ record: toRecordSummary(record) })
  } catch (error) {
    if (error instanceof RecordNotFoundError) {
      return jsonError(404, 'RECORD_NOT_FOUND', error.message)
    }
    if (error instanceof RecordNotReadyError) {
      return jsonError(409, 'RECORD_NOT_READY', error.message)
    }
    return jsonError(500, 'INTERNAL', '记录修改失败，请稍后重试。')
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params
  try {
    const record = await getRecordWithIterations(id)
    // 幂等删除：记录不存在也返回 204。
    if (!record) return new Response(null, { status: 204 })
    if (
      record.status === 'running' ||
      record.iterations.some((iteration) => iteration.status === 'running')
    ) {
      return jsonError(409, 'ITERATION_IN_FLIGHT', '这一条正在处理，等它完成再继续。')
    }
    await deleteRecord(id)
    return new Response(null, { status: 204 })
  } catch (error) {
    // 前置检查与删除之间记录被并发删掉：同样按幂等成功处理。
    if (isPrismaNotFound(error)) return new Response(null, { status: 204 })
    return jsonError(500, 'INTERNAL', '记录删除失败，请稍后重试。')
  }
}
