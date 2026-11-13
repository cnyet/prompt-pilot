import { describe, expect, it } from 'vitest'
import { createIdempotencyStore } from '@/lib/engine/idempotency'

describe('幂等 LRU', () => {
  it('并发同 requestId 只执行一次，两个调用拿同一结果', async () => {
    const store = createIdempotencyStore<string>()
    let calls = 0
    const executor = () => {
      calls += 1
      return new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10))
    }
    const [a, b] = await Promise.all([
      store.run('req-1', executor),
      store.run('req-1', executor),
    ])
    expect(calls).toBe(1)
    expect(a.value).toBe('done')
    expect(b.value).toBe('done')
    expect(a.replayed).toBe(false)
    expect(b.replayed).toBe(true)
  })

  it('TTL 内复用完成结果，超过 TTL 重新执行', async () => {
    let now = 0
    const store = createIdempotencyStore<string>({ ttlMs: 5_000, now: () => now })
    let calls = 0
    const executor = async () => {
      calls += 1
      return `v${calls}`
    }
    expect(await store.run('req', executor)).toEqual({ value: 'v1', replayed: false })
    now = 4_999
    expect(await store.run('req', executor)).toEqual({ value: 'v1', replayed: true })
    now = 5_001
    expect(await store.run('req', executor)).toEqual({ value: 'v2', replayed: false })
    expect(calls).toBe(2)
  })

  it('executor 失败不缓存，下一次重新执行', async () => {
    const store = createIdempotencyStore<string>()
    let calls = 0
    const executor = async () => {
      calls += 1
      if (calls === 1) {
        throw new Error('boom')
      }
      return 'ok'
    }
    await expect(store.run('req', executor)).rejects.toThrow('boom')
    await expect(store.run('req', executor)).resolves.toEqual({ value: 'ok', replayed: false })
    expect(calls).toBe(2)
  })

  it('超容量按最旧完成时间驱逐', async () => {
    let now = 0
    const store = createIdempotencyStore<string>({ capacity: 2, now: () => now })
    const executor = async (tag: string) => tag
    await store.run('a', () => executor('a'))
    now = 1
    await store.run('b', () => executor('b'))
    now = 2
    await store.run('c', () => executor('c'))
    // a 已被驱逐：重新执行而不是复用
    let calls = 0
    await store.run('a', async () => {
      calls += 1
      return 'a2'
    })
    expect(calls).toBe(1)
    // 最近完成的 c 仍在 TTL 内：复用
    calls = 0
    await store.run('c', async () => {
      calls += 1
      return 'c2'
    })
    expect(calls).toBe(0)
  })
})
