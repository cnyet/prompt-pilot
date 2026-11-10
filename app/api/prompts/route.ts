import { z } from 'zod'
import {
  PromptStoreError,
  createPromptWithV0,
  listPrompts,
} from '@/lib/db/prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createPromptRequestSchema = z.object({
  // 兼容三种调用方命名：sourceInput 是默认约定，其余两个为历史别名。
  sourceInput: z.string().trim().max(20_000).optional(),
  userInput: z.string().trim().max(20_000).optional(),
  input: z.string().trim().max(20_000).optional(),
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1_000).optional(),
  tags: z.string().trim().max(200).optional(),
  schema: z.unknown().optional(),
  // 兼容旧调用方把 schema 序列化成字符串传递。
  schemaJson: z.string().max(200_000).optional(),
  origin: z.string().trim().optional(),
  versionNo: z.number().int().optional(),
})

function jsonError(
  status: number,
  code: string,
  message: string,
  detail?: unknown,
): Response {
  return new Response(JSON.stringify({ code, message, detail }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function toResponse(error: unknown): Response {
  if (error instanceof PromptStoreError) {
    return jsonError(error.status, error.code, error.message, error.detail)
  }
  return jsonError(500, 'INTERNAL', '提示词库操作失败，请稍后重试。')
}

function positiveInt(value: string | null): number | undefined {
  if (value === null) {
    return undefined
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }
  return parsed
}

/**
 * 提示词列表。搜索走标题、描述、标签与版本正文，按更新时间倒序。
 * 首版不分页界面，但接口保留 limit / offset，避免以后改契约。
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim()
  const limit = positiveInt(url.searchParams.get('limit')) ?? 50
  const offset = positiveInt(url.searchParams.get('offset')) ?? 0
  try {
    const result = await listPrompts({ query, limit, offset })
    return new Response(
      JSON.stringify({
        prompts: result.prompts,
        total: result.total,
        query,
        limit,
        offset,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    return toResponse(error)
  }
}

/**
 * 首次生成后创建提示词与基线 v0。
 *
 * 这条路由只负责 v0：origin 固定 user_input，版本号固定 0。客户端即使传入
 * versionNo 或别的 origin 也不会写进库。
 */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', '请求体不是合法 JSON。')
  }

  const parsed = createPromptRequestSchema.safeParse(payload)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return jsonError(
      400,
      'INVALID_INPUT',
      firstIssue?.message ?? '请求参数不合法。',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }
  const body = parsed.data

  if (body.versionNo !== undefined) {
    if (body.versionNo === 0) {
      return jsonError(
        409,
        'BASELINE_IMMUTABLE',
        '基线 v0 由服务端创建，不接受客户端写入。',
      )
    }
    return jsonError(
      400,
      'SERVER_ASSIGNED_VERSION',
      '版本号由服务端分配，不能由客户端传入。',
    )
  }
  if (body.origin !== undefined && body.origin !== 'user_input') {
    return jsonError(
      400,
      'INVALID_ORIGIN',
      '首次创建只接受 user_input 来源的基线 v0。',
    )
  }
  let schema: unknown = body.schema
  if (schema === undefined && body.schemaJson !== undefined) {
    try {
      schema = JSON.parse(body.schemaJson) as unknown
    } catch {
      return jsonError(400, 'INVALID_SCHEMA', 'schemaJson 不是合法 JSON。')
    }
  }
  if (schema === undefined) {
    return jsonError(400, 'INVALID_SCHEMA', '缺少结构化提示词内容。')
  }

  const sourceInput = (body.sourceInput ?? body.userInput ?? body.input ?? '').trim()
  if (sourceInput.length === 0) {
    return jsonError(400, 'INVALID_INPUT', '原始需求不能为空。')
  }

  try {
    const prompt = await createPromptWithV0({
      sourceInput,
      schema,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    })
    return new Response(JSON.stringify({ prompt }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        Location: `/api/prompts/${prompt.id}`,
      },
    })
  } catch (error) {
    return toResponse(error)
  }
}
