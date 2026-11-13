import { describe, expect, it } from 'vitest'
import { stageLabel, type LlmCallInput } from '@/lib/llm/ledger'

describe('ledger v3 扩展', () => {
  it('stage 标签包含生成/优化/修复', () => {
    expect(stageLabel('generate')).toBe('生成')
    expect(stageLabel('optimize')).toBe('优化')
    expect(stageLabel('repair')).toBe('修复')
    expect(stageLabel('compose')).toBe('生成')
  })

  it('LlmCallInput 接受 v3 stage 与 recordId/iterationId（编译期验证）', async () => {
    const input: LlmCallInput = {
      stage: 'optimize',
      provider: 'mock',
      modelId: 'm',
      recordId: 'r1',
      iterationId: 'i1',
    }
    expect(input.stage).toBe('optimize')
  })
})
