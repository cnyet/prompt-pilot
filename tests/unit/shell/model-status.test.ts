import { describe, expect, it } from 'vitest'
import { readModelStatus } from '@/components/shell/modelStatusModel'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      apiKey: { configured: true, hint: '…9f3a', source: 'settings' },
      modelGenerate: { value: 'deepseek-v4.1-flash', source: 'settings' },
      modelOptimize: { value: 'deepseek-v4.1-flash', source: 'inherited' },
      baseUrl: { value: 'https://opencode.ai/inference/go/openai/v1', source: 'default' },
      ...overrides,
    },
  }
}

describe('readModelStatus', () => {
  it('已配置密钥时返回在线状态与模型显示名', () => {
    expect(readModelStatus(payload())).toEqual({
      status: 'available',
      reason: '',
      modelLabel: 'DeepSeek V4.1 Flash',
      providerId: 'openai_compatible',
    })
  })

  it('未配置密钥时返回不可用原因', () => {
    const result = readModelStatus(
      payload({ apiKey: { configured: false, hint: null, source: 'none' } }),
    )
    expect(result?.status).toBe('unavailable')
    expect(result?.reason).toContain('未配置模型')
    expect(result?.modelLabel).toBeNull()
  })

  it('格式不完整时返回 null', () => {
    expect(readModelStatus(null)).toBeNull()
    expect(readModelStatus({ settings: {} })).toBeNull()
    expect(
      readModelStatus(payload({ modelGenerate: { value: '', source: 'none' } })),
    ).toBeNull()
  })
})
