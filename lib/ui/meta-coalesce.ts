/**
 * 收藏与评分的乐观写合并（I1）。
 *
 * PATCH 在途时不原生禁用控件（避免焦点被弹到 BODY），而是记住每个字段的
 * 最新请求值，当前请求落定后再补一次 PATCH；与服务器已确认值相同的字段
 * 不重复发送。失败时调用方按已确认值回滚。
 */

export interface MetaPatch {
  favorite?: boolean
  rating?: number | null
}

/** 追加一次用户请求：同一字段以最新值为准，不同字段合并进同一次补发。 */
export function queueMetaPatch(current: MetaPatch | null, patch: MetaPatch): MetaPatch {
  return { ...(current ?? {}), ...patch }
}

/** 与已确认值求差：没有差异时返回 null，跳过无意义的补发。 */
export function patchAgainstConfirmed(
  queued: MetaPatch,
  confirmed: MetaPatch,
): MetaPatch | null {
  const next: MetaPatch = {}
  if (queued.favorite !== undefined && queued.favorite !== confirmed.favorite) {
    next.favorite = queued.favorite
  }
  if (queued.rating !== undefined && queued.rating !== confirmed.rating) {
    next.rating = queued.rating
  }
  return Object.keys(next).length > 0 ? next : null
}
