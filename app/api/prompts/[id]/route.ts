import { z } from 'zod'
import {
  PromptStoreError,
  appendPromptVersion,
  deletePrompt,
  getPromptDetail,
  isPromptVersionOrigin,
  updatePromptMeta,
  type PromptDetail,
  type UpdatePromptMetaInput,
} from '@/lib/db/prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const versionPayloadSchema = z.object({
  // 显式声明 versionNo 只为了拦截：0 返回 409，其他值返回 400。
  versionNo: z.number().int().optional(),
  origin: z.string().trim().optional(),
  schema: z.unknown().optional(),
  schemaJson: z.string().max(200_000).optional(),
  renderedText: z.string().max(200_000).optional(),
  changeSummary: z.string().trim().max(200).optional(),
  parentVersionId: z.string().trim().max(64).optional(),
})

const patchRequestSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空。').max(120).optional(),
  description: z.string().trim().max(1_000).nullable().optional(),
  tags: z.string().trim().max(200).optional(),
  versionNo: z.number().int().optional(),
  version: versionPayloadSchema.optional(),
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

function jsonPrompt(prompt: PromptDetail): Response {
  return new Response(JSON.stringify({ prompt }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

async function readId(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return id.trim()
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const id = await readId(context)
  if (id.length === 0) {
    return jsonError(404, 'NOT_FOUND', '提示词不存在。')
  }
  try {
    const prompt = await getPromptDetail(id)
    if (!prompt) {
      return jsonError(404, 'NOT_FOUND', '提示词不存在。')
    }
    return jsonPrompt(prompt)
  } catch (error) {
    return toResponse(error)
  }
}

/**
 * 更新元信息，或在末尾追加一个新版本。
 *
 * 这条路由没有任何修改既有版本行的能力：带 versionNo 的请求直接拒绝，v0 返回
 * 409，其他版本号返回 400（版本号只能由服务端分配）。删除同样走基线保护。
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const id = await readId(context)
  if (id.length === 0) {
    return jsonError(404, 'NOT_FOUND', '提示词不存在。')
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', '请求体不是合法 JSON。')
  }

  const parsed = patchRequestSchema.safeParse(payload)
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
        '基线 v0 不可修改或删除。',
        { versionNo: 0 },
      )
    }
    return jsonError(
      400,
      'SERVER_ASSIGNED_VERSION',
      '版本号由服务端分配，不能由客户端传入。',
    )
  }

  const versionInput = body.version
  if (versionInput?.versionNo !== undefined) {
    if (versionInput.versionNo === 0) {
      return jsonError(
        409,
        'BASELINE_IMMUTABLE',
        '基线 v0 不可修改或删除。',
        { versionNo: 0 },
      )
    }
    return jsonError(
      400,
      'SERVER_ASSIGNED_VERSION',
      '版本号由服务端分配，不能由客户端传入。',
    )
  }
  if (versionInput !== undefined) {
    if (versionInput.schema === undefined && versionInput.schemaJson === undefined) {
      return jsonError(400, 'INVALID_SCHEMA', '新增版本需要结构化提示词内容。')
    }
    if (
      versionInput.origin !== undefined &&
      !isPromptVersionOrigin(versionInput.origin)
    ) {
      return jsonError(400, 'INVALID_ORIGIN', '版本来源不在允许范围内。')
    }
  }

  let versionSchema: unknown
  if (versionInput !== undefined) {
    versionSchema = versionInput.schema
    if (versionSchema === undefined && versionInput.schemaJson !== undefined) {
      try {
        versionSchema = JSON.parse(versionInput.schemaJson) as unknown
      } catch {
        return jsonError(400, 'INVALID_SCHEMA', 'schemaJson 不是合法 JSON。')
      }
    }
  }

  const meta: UpdatePromptMetaInput = {}
  if (body.title !== undefined) {
    meta.title = body.title
  }
  if (body.description !== undefined) {
    meta.description = body.description
  }
  if (body.tags !== undefined) {
    meta.tags = body.tags
  }
  const hasMetaUpdate = Object.keys(meta).length > 0

  if (versionInput === undefined && !hasMetaUpdate) {
    return jsonError(400, 'INVALID_INPUT', '没有需要更新的内容。')
  }

  try {
    let prompt: PromptDetail | null = null
    if (hasMetaUpdate) {
      prompt = await updatePromptMeta(id, meta)
    }
    if (versionInput !== undefined) {
      const origin =
        versionInput.origin !== undefined &&
        isPromptVersionOrigin(versionInput.origin)
          ? versionInput.origin
          : 'human_edited'
      prompt = await appendPromptVersion(id, {
        schema: versionSchema,
        origin,
        ...(versionInput.renderedText !== undefined
          ? { renderedText: versionInput.renderedText }
          : {}),
        ...(versionInput.changeSummary !== undefined
          ? { changeSummary: versionInput.changeSummary }
          : {}),
        ...(versionInput.parentVersionId !== undefined
          ? { parentVersionId: versionInput.parentVersionId }
          : {}),
      })
    }
    if (!prompt) {
      return jsonError(404, 'NOT_FOUND', '提示词不存在。')
    }
    return jsonPrompt(prompt)
  } catch (error) {
    return toResponse(error)
  }
}

/** 删除整条提示词等同于删除基线，存在 v0 时服务端一律返回 409。 */
export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const id = await readId(context)
  if (id.length === 0) {
    return jsonError(404, 'NOT_FOUND', '提示词不存在。')
  }
  try {
    await deletePrompt(id)
    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return toResponse(error)
  }
}
