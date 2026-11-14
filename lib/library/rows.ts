/**
 * 提示词库列表的纯更新函数：返回新数组，不修改入参。
 */
import type { RecordSummaryDto } from '@/components/studio-v3/api'

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
