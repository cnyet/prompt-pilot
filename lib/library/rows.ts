/**
 * 提示词库列表的纯更新函数：返回新数组，不修改入参。
 */
import type { RecordSummaryDto } from '@/components/studio-v3/api'
import type { LibraryFilter } from './query'

export interface RecordListSnapshot {
  records: RecordSummaryDto[]
  total: number
  offset: number
}

/**
 * 元数据更新后的列表快照。更新后的记录不再满足当前筛选（收藏、已评分）时
 * 从列表移除并同步总数与已加载数量；否则就地替换，保持顺序。
 */
export function applyMetaUpdate(
  snapshot: RecordListSnapshot,
  next: RecordSummaryDto,
  filter: LibraryFilter,
): RecordListSnapshot {
  const present = snapshot.records.some((record) => record.id === next.id)
  if (!present) return snapshot

  const drops =
    (filter === 'favorite' && !next.favorite) ||
    (filter === 'rated' && next.rating === null)
  if (!drops) {
    return { ...snapshot, records: replaceRecord(snapshot.records, next) }
  }
  return {
    records: removeRecordFromList(snapshot.records, next.id),
    total: Math.max(0, snapshot.total - 1),
    offset: Math.max(0, snapshot.offset - 1),
  }
}

export function replaceRecord(
  records: RecordSummaryDto[],
  next: RecordSummaryDto,
): RecordSummaryDto[] {
  return records.map((record) => (record.id === next.id ? next : record))
}

export function patchRecordInList(
  records: RecordSummaryDto[],
  id: string,
  patch: Partial<RecordSummaryDto>,
): RecordSummaryDto[] {
  return records.map((record) => (record.id === id ? { ...record, ...patch } : record))
}

export function removeRecordFromList(
  records: RecordSummaryDto[],
  id: string,
): RecordSummaryDto[] {
  return records.filter((record) => record.id !== id)
}
