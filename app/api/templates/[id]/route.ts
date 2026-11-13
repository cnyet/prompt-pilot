/**
 * DELETE /api/templates/[id]：删除自定义模板。
 * deleted → 204；not_found → 404 TEMPLATE_NOT_FOUND；builtin → 409 TEMPLATE_BUILTIN。
 */
import { deleteTemplate } from '@/lib/db/templates'
import { describeError, jsonError } from '@/lib/engine/stream-v3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params
  try {
    const result = await deleteTemplate(id)
    if (result === 'deleted') return new Response(null, { status: 204 })
    if (result === 'not_found') {
      return jsonError(404, 'TEMPLATE_NOT_FOUND', '没有找到这个模板。')
    }
    return jsonError(409, 'TEMPLATE_BUILTIN', '内置模板不可删除。')
  } catch (error) {
    console.warn('[templates:detail] 删除模板失败：', describeError(error))
    return jsonError(500, 'INTERNAL', '模板删除失败，请稍后重试。')
  }
}
