/**
 * 记录层幂等（ARCHITECTURE §十二）。
 *
 * 进程内 LRU：同一 requestId 的 in-flight Promise 直接复用（双击只执行一次），
 * 完成结果在 TTL（默认 5 分钟）内复用。失败不缓存。迭代层由
 * PromptIteration.requestId 数据库唯一约束兜底（Batch C 接入）。
 */

export interface IdempotentOutcome<T> {
  value: T
  replayed: boolean
}

export interface IdempotencyStore<T> {
  run(requestId: string, executor: () => Promise<T>): Promise<IdempotentOutcome<T>>
}

interface Entry<T> {
  promise: Promise<T>
  completedAt: number | null
}

const DEFAULT_TTL_MS = 5 * 60_000
const DEFAULT_CAPACITY = 500

export function createIdempotencyStore<T>(options: {
  ttlMs?: number
  capacity?: number
  now?: () => number
} = {}): IdempotencyStore<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const capacity = options.capacity ?? DEFAULT_CAPACITY
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry<T>>()

  const evictIfNeeded = (): void => {
    if (entries.size <= capacity) {
      return
    }
    // 最旧完成时间优先；未完成的排最后（不允许驱逐 in-flight）
    let oldestKey: string | null = null
    let oldestAt = Number.POSITIVE_INFINITY
    for (const [key, entry] of entries) {
      const at = entry.completedAt ?? Number.POSITIVE_INFINITY
      if (at < oldestAt) {
        oldestAt = at
        oldestKey = key
      }
    }
    if (oldestKey !== null && entries.get(oldestKey)?.completedAt !== null) {
      entries.delete(oldestKey)
    }
  }

  return {
    run(requestId, executor) {
      const existing = entries.get(requestId)
      if (existing) {
        if (existing.completedAt === null || now() - existing.completedAt < ttlMs) {
          return existing.promise.then((value) => ({ value, replayed: true }))
        }
        entries.delete(requestId)
      }

      const entry: Entry<T> = { promise: executor(), completedAt: null }
      entries.set(requestId, entry)
      entry.promise.then(
        () => {
          entry.completedAt = now()
          evictIfNeeded()
        },
        () => {
          // 失败不缓存：移除，让下一次调用重新执行
          entries.delete(requestId)
        },
      )
      return entry.promise.then((value) => ({ value, replayed: false }))
    },
  }
}
