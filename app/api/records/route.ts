/**
 * GET /api/records：提示词库列表。
 *
 * 只返回 RecordSummary 字段，正文 latestOutput 留在详情接口；
 * 排序按最近处理 updatedAt desc，id desc 兜底保证分页稳定。
 */
import { z } from 'zod'
import { listRecords } from '@/lib/db/records'
import { jsonError } from '@/lib/engine/stream-v3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const filterSchema = z.enum(['all', 'favorite', 'rated', 'generate', 'optimize'])
const targetTypeSchema = z.enum(['text', 'image', 'video'])

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const INTEGER_PATTERN = /^\d+$/

function invalidQuery(message: string): Response {
  return jsonError(400, 'INVALID_QUERY', message)
}

function noStoreJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/** 缺省用 fallback；非纯数字或越界返回 null。 */
function parseBoundedInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number | null {
  if (raw === null) return fallback
  if (!INTEGER_PATTERN.test(raw)) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) return null
  return value
}

/** 缺省返回 undefined；格式非法或日期不存在返回 null。 */
function parseUtcDay(raw: string | null): Date | undefined | null {
  if (raw === null) return undefined
  if (!DAY_PATTERN.test(raw)) return null
  const date = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  // Date 会把 2026-02-30 滚动到 3 月，回读日期不一致即视为非法。
  if (date.toISOString().slice(0, 10) !== raw) return null
  return date
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams

  const qRaw = params.get('q')
  const q = qRaw === null ? undefined : qRaw.trim()
  if (q !== undefined && (q.length === 0 || q.length > 200)) {
    return invalidQuery('搜索词需为 1 到 200 个字符。')
  }

  const filterParsed = filterSchema.safeParse(params.get('filter') ?? 'all')
  if (!filterParsed.success) return invalidQuery('filter 取值不合法。')

  const targetTypeRaw = params.get('targetType')
  const targetTypeParsed =
    targetTypeRaw === null ? null : targetTypeSchema.safeParse(targetTypeRaw)
  if (targetTypeParsed && !targetTypeParsed.success) {
    return invalidQuery('targetType 取值不合法。')
  }

  const limit = parseBoundedInt(params.get('limit'), 1, 50, 20)
  if (limit === null) return invalidQuery('limit 需为 1 到 50 的整数。')
  const offset = parseBoundedInt(params.get('offset'), 0, Number.MAX_SAFE_INTEGER, 0)
  if (offset === null) return invalidQuery('offset 需为非负整数。')

  const from = parseUtcDay(params.get('from'))
  if (from === null) return invalidQuery('from 需为 YYYY-MM-DD 日期。')
  const to = parseUtcDay(params.get('to'))
  if (to === null) return invalidQuery('to 需为 YYYY-MM-DD 日期。')

  try {
    const result = await listRecords({
      ...(q !== undefined ? { q } : {}),
      filter: filterParsed.data,
      ...(targetTypeParsed ? { targetType: targetTypeParsed.data } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      limit,
      offset,
    })
    return noStoreJson({ records: result.records, total: result.total, limit, offset })
  } catch {
    return jsonError(500, 'INTERNAL', '提示词库读取失败，请稍后重试。')
  }
}
