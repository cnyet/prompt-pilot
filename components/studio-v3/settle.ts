import { fetchRecordDetail, type RecordDetailDto } from './api'
import type { StreamAction } from './stream-reducer'

export const SETTLE_ATTEMPTS = 3
export const SETTLE_DELAY_MS = 150

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 拉详情并结算（I2）。
 *
 * 中断时服务端可能还在写库，本轮迭代仍是 running，短暂重试避免用旧的
 * latestOutput 覆盖刚保留的中断内容；详情拉取失败同样重试，全部失败后
 * dispatch settle-failed：清掉 settling、保留流内正文与用量，并标记用量不可用。
 */
export async function settleDetail(
  recordId: string,
  iterationId: string | null,
  isCurrent: () => boolean,
  dispatch: (action: StreamAction) => void,
  fetchDetail: (id: string) => Promise<RecordDetailDto> = fetchRecordDetail,
): Promise<void> {
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    try {
      const detail = await fetchDetail(recordId)
      if (!isCurrent()) return
      const target = iterationId
        ? detail.record.iterations.find((iteration) => iteration.id === iterationId)
        : undefined
      if (target?.status !== 'running' || attempt === SETTLE_ATTEMPTS - 1) {
        dispatch({ type: 'settled', detail })
        return
      }
    } catch {
      if (attempt === SETTLE_ATTEMPTS - 1) {
        if (isCurrent()) dispatch({ type: 'settle-failed' })
        return
      }
    }
    await delay(SETTLE_DELAY_MS)
  }
}
