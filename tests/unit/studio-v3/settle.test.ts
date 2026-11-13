import { describe, expect, it, vi } from 'vitest'
import type { IterationDto, RecordDetailDto } from '@/components/studio-v3/api'
import {
  SETTLE_ATTEMPTS,
  SETTLE_DELAY_MS,
  settleDetail,
} from '@/components/studio-v3/settle'
import type { StreamAction } from '@/components/studio-v3/stream-reducer'

// 结算拉详情的重试与终态决策（I2）：不触碰 React 与网络，注入假的 fetcher。

function makeIteration(overrides: Partial<IterationDto> = {}): IterationDto {
  return {
    id: 'it-1',
    seq: 1,
    kind: 'generate',
    instruction: null,
    output: 'ab',
    notes: [],
    modelId: 'mock-valid',
    tokensIn: 10,
    tokensOut: 20,
    costCny: 0.0012,
    latencyMs: 800,
    status: 'completed',
    createdAt: '2026-11-13T00:00:00.000Z',
    ...overrides,
  }
}

function makeDetail(iterations: IterationDto[]): RecordDetailDto {
  const last = iterations.at(-1)
  return {
    record: {
      id: 'rec-1',
      title: '周报',
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
      status: last?.status ?? 'completed',
      favorite: false,
      rating: null,
      modelId: last?.modelId ?? null,
      iterationCount: iterations.length,
      tokensIn: last?.tokensIn ?? null,
      tokensOut: last?.tokensOut ?? null,
      costCny: last?.costCny ?? null,
      createdAt: '2026-11-13T00:00:00.000Z',
      updatedAt: '2026-11-13T00:00:00.000Z',
      latestOutput: last?.output ?? '',
      copiedAt: null,
      originTemplateId: null,
      iterations,
    },
  }
}

describe('settleDetail', () => {
  it('一次成功且迭代非 running 时直接 settled', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeDetail([makeIteration()]))
    const dispatch = vi.fn()
    await settleDetail('rec-1', 'it-1', () => true, dispatch, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ type: 'settled' })
  })

  it('迭代仍 running 时重试，最后一次尝试也 running 则按 settled 收尾', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(makeDetail([makeIteration({ status: 'running' })]))
    const dispatch = vi.fn()
    await settleDetail('rec-1', 'it-1', () => true, dispatch, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(SETTLE_ATTEMPTS)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ type: 'settled' })
  })

  it('详情拉取失败时重试，全部失败后 dispatch settle-failed', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'))
    const dispatch = vi.fn()
    await settleDetail('rec-1', 'it-1', () => true, dispatch, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(SETTLE_ATTEMPTS)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0]).toEqual({ type: 'settle-failed' })
  })

  it('前两次失败第三次成功时 settled，不 dispatch settle-failed', async () => {
    const fetcher = vi
      .fn<(id: string) => Promise<RecordDetailDto>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(makeDetail([makeIteration()]))
    const dispatch = vi.fn()
    await settleDetail('rec-1', 'it-1', () => true, dispatch, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(SETTLE_ATTEMPTS)
    expect(dispatch.mock.calls.map(([action]) => (action as StreamAction).type)).toEqual([
      'settled',
    ])
  })

  it('请求已被接管时不再 dispatch（isCurrent 为 false）', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeDetail([makeIteration()]))
    const dispatch = vi.fn()
    await settleDetail('rec-1', 'it-1', () => false, dispatch, fetcher)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('最终失败且请求已被接管时也不 dispatch settle-failed', async () => {
    let current = true
    const fetcher = vi.fn().mockImplementation(async () => {
      current = false // 模拟拉详情期间请求被新请求接管
      throw new Error('down')
    })
    const dispatch = vi.fn()
    await settleDetail('rec-1', 'it-1', () => current, dispatch, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(SETTLE_ATTEMPTS)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('重试之间等待 SETTLE_DELAY_MS', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(makeDetail([makeIteration()]))
    const dispatch = vi.fn()
    const started = Date.now()
    await settleDetail('rec-1', 'it-1', () => true, dispatch, fetcher)
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(SETTLE_DELAY_MS * 2)
  })
})
