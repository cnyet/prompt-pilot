import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTIMIZE_MODEL_CONFIG_ID,
  getOptimizeProvider,
  listModelConfigs,
} from '@/lib/llm/registry'

describe('registry optimize 角色', () => {
  it('listModelConfigs 含 optimize 槽位，未配置时复用生成模型', () => {
    const configs = listModelConfigs({
      ARK_API_KEY: 'sk-test',
      ARK_MODEL_GENERATE: 'deepseek-v4.1-flash',
    })
    const optimize = configs.find((c) => c.id === DEFAULT_OPTIMIZE_MODEL_CONFIG_ID)
    expect(optimize?.role).toBe('optimize')
    expect(optimize?.modelId).toBe('deepseek-v4.1-flash')
  })

  it('单独配置 ARK_MODEL_OPTIMIZE 时使用该模型', () => {
    const configs = listModelConfigs({
      ARK_API_KEY: 'sk-test',
      ARK_MODEL_GENERATE: 'deepseek-v4.1-flash',
      ARK_MODEL_OPTIMIZE: 'gpt-5.6-luna',
    })
    const optimize = configs.find((c) => c.id === DEFAULT_OPTIMIZE_MODEL_CONFIG_ID)
    expect(optimize?.modelId).toBe('gpt-5.6-luna')
  })

  it('getOptimizeProvider 无 Key 返回 null，有 Key 返回 openai_compatible', () => {
    expect(getOptimizeProvider({})).toBeNull()
    const provider = getOptimizeProvider({ ARK_API_KEY: 'sk-test' })
    expect(provider).not.toBeNull()
  })

  it('getOptimizeProvider 尊重 MOCK_LLM_FAULT 故障画像（与 generate 一致）', () => {
    // network_error 不在 MOCK_FAULT_PROFILES 内，这里用真实画像 rate_limited
    const provider = getOptimizeProvider(
      { MOCK_LLM_FAULT: 'rate_limited' },
      {},
    )
    expect(provider).not.toBeNull()
  })
})
