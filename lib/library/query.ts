/**
 * 提示词库列表的查询参数与 URL 组装。
 *
 * 纯函数，客户端与服务端测试共用；不依赖任何 node: 模块。
 */

export type LibraryFilter = 'all' | 'favorite' | 'rated' | 'generate' | 'optimize'
export type LibraryTargetType = 'text' | 'image' | 'video'

export interface LibraryListParams {
  q: string
  filter: LibraryFilter
  targetType: LibraryTargetType | null
  from: string | null
  to: string | null
  limit: number
  offset: number
}

export const LIBRARY_PAGE_SIZE = 20

/** 固定顺序组装 /api/records 查询串；空 q 与 null 筛选不出现。 */
export function buildRecordsQuery(params: LibraryListParams): string {
  const search = new URLSearchParams()
  if (params.q.trim() !== '') search.set('q', params.q)
  search.set('filter', params.filter)
  if (params.targetType !== null) search.set('targetType', params.targetType)
  if (params.from !== null) search.set('from', params.from)
  if (params.to !== null) search.set('to', params.to)
  search.set('limit', String(params.limit))
  search.set('offset', String(params.offset))
  return `/api/records?${search.toString()}`
}

/** 除分页外任一条件生效即视为「有筛选」，用于两种空态的分流。 */
export function hasActiveQuery(
  params: Omit<LibraryListParams, 'limit' | 'offset'>,
): boolean {
  return (
    params.q.trim() !== '' ||
    params.filter !== 'all' ||
    params.targetType !== null ||
    params.from !== null ||
    params.to !== null
  )
}

/** 加载更多时按已成功加载条数推进偏移。 */
export function nextOffset(current: number, received: number): number {
  return current + received
}
