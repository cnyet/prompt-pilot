/**
 * GET /api/templates：模板列表，可选 ?category=text|image|video。
 * POST /api/templates：新建自定义模板。
 *
 * 自定义模板的内部字段由服务端强制：builtin=false、slug=null、
 * coverKind=programmatic；strictObject 拒绝客户端传入这些字段。
 */
import { z } from 'zod'
import { createCustomTemplate, listTemplates } from '@/lib/db/templates'
import { jsonError } from '@/lib/engine/stream-v3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const categorySchema = z.enum(['text', 'image', 'video'])

const createSchema = z.strictObject({
  category: categorySchema,
  style: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  mode: z.enum(['generate', 'optimize']).default('optimize'),
  exampleInput: z.string().trim().max(2000).nullable().optional(),
  featured: z.boolean().default(false),
})

function noStoreJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('category')
  let category: 'text' | 'image' | 'video' | undefined
  if (raw !== null) {
    const parsed = categorySchema.safeParse(raw)
    if (!parsed.success) return jsonError(400, 'INVALID_QUERY', 'category 取值不合法。')
    category = parsed.data
  }

  try {
    const templates = await listTemplates(category)
    return noStoreJson({ templates })
  } catch {
    return jsonError(500, 'INTERNAL', '模板读取失败，请稍后重试。')
  }
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError(400, 'INVALID_INPUT', '请求体不是合法的 JSON。')
  }

  const parsed = createSchema.safeParse(raw)
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
    const template = await createCustomTemplate(parsed.data)
    return noStoreJson({ template }, 201)
  } catch {
    return jsonError(500, 'INTERNAL', '模板保存失败，请稍后重试。')
  }
}
