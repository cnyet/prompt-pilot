import { describe, expect, it } from 'vitest'
import {
  ARK_DEFAULT_BASE_URL,
  DEFAULT_EVALUATE_MODEL_ID,
  DEFAULT_GENERATE_MODEL_ID,
  createProvider,
  getDefaultModelConfig,
  getGenerateProvider,
  getModelConfig,
  isEndpointId,
  isValidArkModel,
  listModelConfigs,
  resolveProvider,
} from '@/lib/llm/registry'

const withKey = { ARK_API_KEY: 'test-key' }

describe('模型注册表与 provider 选择', () => {
  it('没有 ARK_API_KEY 时生成 provider 为 null', () => {
    expect(getGenerateProvider({})).toBeNull()
    expect(getGenerateProvider({ ARK_API_KEY: '   ' })).toBeNull()
  })

  it('有 ARK_API_KEY 时生成 provider 指向方舟', () => {
    const provider = getGenerateProvider(withKey)
    expect(provider).not.toBeNull()
    expect(provider?.id).toBe('ark-generate')
    expect(provider?.label).toContain(DEFAULT_GENERATE_MODEL_ID)
  })

  it('默认生成用 pro，评估用 lite', () => {
    const configs = listModelConfigs(withKey)
    expect(configs.find((config) => config.id === 'ark-generate')?.modelId).toBe(
      DEFAULT_GENERATE_MODEL_ID,
    )
    expect(configs.find((config) => config.id === 'ark-evaluate')?.modelId).toBe(
      DEFAULT_EVALUATE_MODEL_ID,
    )
    expect(getDefaultModelConfig('generate', withKey)?.id).toBe('ark-generate')
    expect(getDefaultModelConfig('evaluate', withKey)?.id).toBe('ark-evaluate')
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

  it('ep- 接入点没有内置价格与上下文窗口，不瞎填', () => {
    const config = getModelConfig('ark-generate', {
      ...withKey,
      ARK_MODEL_GENERATE: 'ep-20250101-abcde',
    })
    expect(config?.pricing).toBeUndefined()
    expect(config?.contextWindow).toBeUndefined()
  })

  it('已知 Model ID 带价格与上下文窗口', () => {
    const config = getModelConfig('ark-generate', withKey)
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
    expect(resolveProvider('ark-evaluate', withKey)?.id).toBe('ark-evaluate')
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
