import { describe, expect, it } from 'vitest'
import {
  ARK_DEFAULT_BASE_URL,
  DEFAULT_GENERATE_MODEL_ID,
  createProvider,
  getDefaultModelConfig,
  getGenerateProvider,
  getModelConfig,
  isEndpointId,
  isOpencodeGateway,
  isValidArkModel,
  listModelConfigs,
  modelDisplayLabel,
  normalizeArkBaseUrl,
  resolveProvider,
} from '@/lib/llm/registry'

const withKey = { ARK_API_KEY: 'test-key' }

describe('默认网关模型价格表', () => {
  it('deepseek-v4.1-flash 有人民币价格、上下文窗口与峰值 ×2 配置', () => {
    const config = getModelConfig('ark-generate', {})
    expect(config?.modelId).toBe(DEFAULT_GENERATE_MODEL_ID)
    expect(config?.pricing?.inputCnyPerMillion).toBe(1.0017)
    expect(config?.pricing?.outputCnyPerMillion).toBe(4.0069)
    expect(config?.pricing?.cachedInputCnyPerMillion).toBe(0.02)
    expect(config?.contextWindow).toBe(1_000_000)
    expect(config?.pricing?.peak).toEqual({
      factor: 2,
      utcWeekdayHourRanges: [[1, 4], [6, 10]],
    })
  })

  it('hy4-flash-free 免费档价格全 0 且带上下文窗口', () => {
    const config = listModelConfigs({
      ARK_MODEL_GENERATE: 'hy4-flash-free',
    }).find((item) => item.id === 'ark-generate')
    expect(config?.pricing?.inputCnyPerMillion).toBe(0)
    expect(config?.pricing?.outputCnyPerMillion).toBe(0)
    expect(config?.contextWindow).toBe(1_048_576)
  })
})

describe('模型注册表与 provider 选择', () => {
  it('没有 ARK_API_KEY 时生成 provider 为 null', () => {
    expect(getGenerateProvider({})).toBeNull()
    expect(getGenerateProvider({ ARK_API_KEY: '   ' })).toBeNull()
  })

  it('有 ARK_API_KEY 时生成 provider 指向默认网关', () => {
    const provider = getGenerateProvider(withKey)
    expect(provider).not.toBeNull()
    expect(provider?.id).toBe('ark-generate')
    expect(provider?.label).toContain(modelDisplayLabel(DEFAULT_GENERATE_MODEL_ID))
  })

  it('默认生成模型指向默认网关', () => {
    const configs = listModelConfigs(withKey)
    expect(configs.find((config) => config.id === 'ark-generate')?.modelId).toBe(
      DEFAULT_GENERATE_MODEL_ID,
    )
    expect(configs.find((config) => config.id === 'ark-generate')?.baseUrl).toBe(
      'https://opencode.ai/inference/go/openai/v1',
    )
    expect(configs.find((config) => config.id === 'ark-generate')?.headers).toEqual(
      { 'x-opencode-session': expect.any(String) },
    )
    expect(getDefaultModelConfig('generate', withKey)?.id).toBe('ark-generate')
  })

  it('ARK_MODEL_GENERATE 支持 Model ID 与 ep- 接入点 ID', () => {
    const modelConfig = (modelId: string) => {
      const env = { ...withKey, ARK_MODEL_GENERATE: modelId }
      return listModelConfigs(env).find((config) => config.id === 'ark-generate')
    }

    expect(modelConfig('doubao-seed-2-1-pro-260915')?.modelId).toBe(
      'doubao-seed-2-1-pro-260915',
    )
    expect(modelConfig('ep-20250101-abcde')?.modelId).toBe('ep-20250101-abcde')
    expect(isEndpointId('ep-20250101-abcde')).toBe(true)
    expect(isEndpointId('doubao-seed-2-1-pro-260915')).toBe(false)
    expect(isValidArkModel('ep-20250101-abcde')).toBe(true)
    expect(isValidArkModel('doubao-seed-2-1-pro-260915')).toBe(true)
    expect(isValidArkModel('   ')).toBe(false)
  })

  it('ARK_BASE_URL 覆盖默认数据面端点', () => {
    const config = getModelConfig('ark-generate', {
      ...withKey,
      ARK_BASE_URL: 'https://example.test/api/v3',
    })
    expect(config?.baseUrl).toBe('https://example.test/api/v3')

    const fallback = getModelConfig('ark-generate', withKey)
    expect(fallback?.baseUrl).toBe(ARK_DEFAULT_BASE_URL)
  })

  it('兼容旧版网关地址，并去掉自定义端点的末尾斜杠', () => {
    expect(normalizeArkBaseUrl('https://opencode.ai/inference/go')).toBe(
      ARK_DEFAULT_BASE_URL,
    )
    expect(normalizeArkBaseUrl('https://opencode.ai/inference/go/v1/')).toBe(
      ARK_DEFAULT_BASE_URL,
    )
    expect(normalizeArkBaseUrl('https://example.test/api/v3/')).toBe(
      'https://example.test/api/v3',
    )
    expect(isOpencodeGateway(ARK_DEFAULT_BASE_URL)).toBe(true)
    expect(isOpencodeGateway('https://example.test/api/v3')).toBe(false)
  })

  it('旧版网关地址也会解析成可用的 OpenAI 兼容端点', () => {
    const config = getModelConfig('ark-generate', {
      ...withKey,
      ARK_BASE_URL: 'https://opencode.ai/inference/go',
    })
    expect(config?.baseUrl).toBe(ARK_DEFAULT_BASE_URL)
    expect(config?.headers).toEqual({
      'x-opencode-session': expect.any(String),
    })
  })

  it('自定义兼容端点不附加 opencode 会话头', () => {
    const config = getModelConfig('ark-generate', {
      ...withKey,
      ARK_BASE_URL: 'https://example.test/api/v3',
    })
    expect(config?.headers).toBeUndefined()
  })

  it('ep- 接入点没有内置价格与上下文窗口，不瞎填', () => {
    const config = getModelConfig('ark-generate', {
      ...withKey,
      ARK_MODEL_GENERATE: 'ep-20250101-abcde',
    })
    expect(config?.pricing).toBeUndefined()
    expect(config?.contextWindow).toBeUndefined()
  })

  it('已知 Model ID 带价格与上下文窗口', () => {
    const config = getModelConfig('ark-generate', {
      ...withKey,
      ARK_MODEL_GENERATE: 'doubao-seed-2-1-pro-260915',
    })
    expect(config?.pricing?.inputCnyPerMillion).toBe(6)
    expect(config?.pricing?.outputCnyPerMillion).toBe(30)
    expect(config?.contextWindow).toBe(1_048_576)
  })

  it('缺 Key 时 createProvider 返回 null，不抛错', () => {
    const config = getModelConfig('ark-generate', {})
    expect(config).toBeDefined()
    if (!config) {
      return
    }
    expect(createProvider(config, {})).toBeNull()
  })

  it('resolveProvider 按 modelConfigId 解析，未知 id 返回 null', () => {
    expect(resolveProvider('ark-generate', withKey)?.id).toBe('ark-generate')
    expect(resolveProvider('missing', withKey)).toBeNull()
  })

  it('mock 配置不需要 Key', () => {
    expect(resolveProvider('mock', {})?.id).toBe('mock')
  })

  it('禁用的配置不会被实例化', () => {
    const config = getModelConfig('ark-generate', withKey)
    expect(config).toBeDefined()
    if (!config) {
      return
    }
    expect(createProvider({ ...config, enabled: false }, withKey)).toBeNull()
  })
})
