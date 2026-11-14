import { describe, expect, it } from 'vitest'
import { latestIteration } from '@/lib/library/detail'
import type { IterationDto } from '@/components/studio-v3/api'

function iteration(seq: number): IterationDto {
  return {
    id: `i${seq}`, seq, kind: 'generate', instruction: null, output: `out${seq}`,
    notes: [], modelId: 'mock', tokensIn: 1, tokensOut: 1, costCny: null,
    latencyMs: 10, status: 'completed', createdAt: '2026-11-13T00:00:00.000Z',
  }
}

describe('latestIteration', () => {
  it('按 seq 取最大，空列表返回 null', () => {
    expect(latestIteration([iteration(1), iteration(3), iteration(2)])?.seq).toBe(3)
    expect(latestIteration([])).toBeNull()
  })
})
