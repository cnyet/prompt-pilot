import { ArkProvider } from './ark'
import type { RetryOptions } from './errors'
import {
  MOCK_VALID_PROFILE,
  MockProvider,
  createValidMockProvider,
  isMockFaultProfile,
  type MockFaultProfile,
} from './mock'
import {
  OpenAICompatProvider,
  type ModelPricingCny,
} from './openai-compat'
import type { LLMProvider } from './types'

/**
 * 模型注册表：把 ChatRequest.modelConfigId 解析成具体 provider 与 model。
 *
 * 只存 Model ID / ep- 接入点 ID 与价格，不存密钥；密钥永远从环境变量读取。
 * 有 ARK_API_KEY 时生成走方舟，没有时由路由继续走离线 heuristic composer。
 */

export const ARK_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
export const DEFAULT_GENERATE_MODEL_ID = 'doubao-seed-2-1-pro-260915'
export const DEFAULT_EVALUATE_MODEL_ID = 'doubao-seed-2-1-lite-260915'
export const DEFAULT_GENERATE_MODEL_CONFIG_ID = 'ark-generate'
export const DEFAULT_EVALUATE_MODEL_CONFIG_ID = 'ark-evaluate'

export interface ModelPricing extends ModelPricingCny {
  contextWindow?: number
}

/** 价格单位：元 / 百万 token；上下文窗口单位：token。 */
export const ARK_MODEL_PRESETS: Readonly<Record<string, ModelPricing>> = {
  'doubao-seed-2-1-pro-260915': {
    contextWindow: 1_048_576,
    inputCnyPerMillion: 6,
    cachedInputCnyPerMillion: 1.2,
    outputCnyPerMillion: 30,
  },
  'doubao-seed-2-1-lite-260915': {
    contextWindow: 1_048_576,
    inputCnyPerMillion: 0.8,
    cachedInputCnyPerMillion: 0.16,
    outputCnyPerMillion: 2.7,
  },
  'doubao-seed-2-1-turbo-260628': {
    contextWindow: 262_144,
    inputCnyPerMillion: 3,
    cachedInputCnyPerMillion: 0.6,
    outputCnyPerMillion: 15,
  },
}

export type ProviderKind = 'ark' | 'openai_compatible' | 'mock'
export type ModelRole = 'generate' | 'evaluate' | 'judge'

export interface ModelConfig {
  id: string
  label: string
  provider: ProviderKind
  /** 只在 openai_compatible 时需要显式覆盖；方舟用默认数据面 */
  baseUrl?: string
  /** Model ID 或 ep- 接入点 ID，原样下发给 provider */
  modelId: string
  /** 只存变量名，绝不存密钥 */
  apiKeyEnvVar: string
  role: ModelRole
  isDefault?: boolean
  enabled?: boolean
  contextWindow?: number
  pricing?: ModelPricing
}

export type RegistryEnv = Readonly<Record<string, string | undefined>>

export interface ProviderOverrides {
  /** 单测注入假 transport；生产不传，走全局 fetch */
  fetch?: typeof globalThis.fetch
  retry?: RetryOptions
  /** 允许在没有密钥时用 MOCK_LLM_FAULT=valid 的 Mock provider（试运行 / 评估用） */
  allowValidMock?: boolean
}

export function isEndpointId(model: string): boolean {
  return /^ep-[A-Za-z0-9_-]+$/.test(model.trim())
}

/** 支持 Model ID 与 ep- 接入点 ID；空字符串不合法。 */
export function isValidArkModel(model: string): boolean {
  const value = model.trim()
  if (value.length === 0) {
    return false
  }
  if (isEndpointId(value)) {
    return true
  }
  // Model ID 形如 doubao-seed-2-1-pro-260915；不做白名单，避免新模型上线即不可用。
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
}

function envValue(env: RegistryEnv, key: string): string | undefined {
  const value = env[key]?.trim()
  return value && value.length > 0 ? value : undefined
}

function presetFor(modelId: string): ModelPricing | undefined {
  return ARK_MODEL_PRESETS[modelId]
}

/** 每次调用都按当前环境变量现算，便于设置页热改与单测隔离。 */
export function listModelConfigs(env: RegistryEnv = process.env): ModelConfig[] {
  const baseUrl = envValue(env, 'ARK_BASE_URL') ?? ARK_DEFAULT_BASE_URL
  const generateModel = envValue(env, 'ARK_MODEL_GENERATE') ?? DEFAULT_GENERATE_MODEL_ID
  const evaluateModel = envValue(env, 'ARK_MODEL_EVALUATE') ?? DEFAULT_EVALUATE_MODEL_ID

  const makeConfig = (
    id: string,
    role: ModelRole,
    modelId: string,
    label: string,
    isDefault: boolean,
  ): ModelConfig => {
    const preset = presetFor(modelId)
    return {
      id,
      label,
      provider: 'ark',
      baseUrl,
      modelId,
      apiKeyEnvVar: 'ARK_API_KEY',
      role,
      isDefault,
      enabled: true,
      ...(preset?.contextWindow !== undefined
        ? { contextWindow: preset.contextWindow }
        : {}),
      ...(preset ? { pricing: preset } : {}),
    }
  }

  return [
    makeConfig(
      DEFAULT_GENERATE_MODEL_CONFIG_ID,
      'generate',
      generateModel,
      `方舟生成模型 · ${generateModel}`,
      true,
    ),
    makeConfig(
      DEFAULT_EVALUATE_MODEL_CONFIG_ID,
      'evaluate',
      evaluateModel,
      `方舟评估模型 · ${evaluateModel}`,
      false,
    ),
    {
      id: 'mock',
      label: 'Mock 模型',
      provider: 'mock',
      modelId: 'mock',
      apiKeyEnvVar: 'ARK_API_KEY',
      role: 'generate',
      enabled: true,
    },
  ]
}

export function getModelConfig(
  modelConfigId: string,
  env: RegistryEnv = process.env,
): ModelConfig | undefined {
  return listModelConfigs(env).find((config) => config.id === modelConfigId)
}

export function getDefaultModelConfig(
  role: ModelRole,
  env: RegistryEnv = process.env,
): ModelConfig | undefined {
  const configs = listModelConfigs(env).filter(
    (config) => config.enabled !== false && config.role === role,
  )
  return configs.find((config) => config.isDefault) ?? configs[0]
}

export function getApiKey(
  config: ModelConfig,
  env: RegistryEnv = process.env,
): string | undefined {
  return envValue(env, config.apiKeyEnvVar)
}

/** 方舟是否具备可用 Key；路由用它决定走真实模型还是离线模板。 */
export function hasArkApiKey(env: RegistryEnv = process.env): boolean {
  return Boolean(envValue(env, 'ARK_API_KEY'))
}

/** 测试与本地验收用的故障画像开关；生产环境不设置，默认不生效。 */
export const MOCK_FAULT_ENV = 'MOCK_LLM_FAULT'

export function getMockFaultProfile(
  env: RegistryEnv = process.env,
): MockFaultProfile | undefined {
  const value = envValue(env, MOCK_FAULT_ENV)
  return isMockFaultProfile(value) ? value : undefined
}

/**
 * 按配置创建 provider；缺 Key 或配置禁用时返回 null。
 * 不缓存实例，避免测试里环境变量切换后拿到旧 provider。
 */
export function createProvider(
  config: ModelConfig,
  env: RegistryEnv = process.env,
  overrides: ProviderOverrides = {},
): LLMProvider | null {
  if (config.enabled === false) {
    return null
  }

  if (config.provider === 'mock') {
    return new MockProvider({ id: config.id, label: config.label })
  }

  const apiKey = getApiKey(config, env)
  if (!apiKey) {
    return null
  }

  if (config.provider === 'ark') {
    return new ArkProvider({
      id: config.id,
      label: config.label,
      baseURL: config.baseUrl ?? ARK_DEFAULT_BASE_URL,
      apiKey,
      model: config.modelId,
      ...(config.pricing ? { pricing: config.pricing } : {}),
      ...(config.contextWindow !== undefined
        ? { contextWindow: config.contextWindow }
        : {}),
      ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
      ...(overrides.retry ? { retry: overrides.retry } : {}),
    })
  }

  if (config.provider === 'openai_compatible') {
    if (!config.baseUrl) {
      return null
    }
    return new OpenAICompatProvider({
      id: config.id,
      label: config.label,
      baseURL: config.baseUrl,
      apiKey,
      model: config.modelId,
      ...(config.pricing ? { pricing: config.pricing } : {}),
      ...(config.contextWindow !== undefined
        ? { contextWindow: config.contextWindow }
        : {}),
      ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
      ...(overrides.retry ? { retry: overrides.retry } : {}),
    })
  }

  return null
}

export function resolveProvider(
  modelConfigId: string,
  env: RegistryEnv = process.env,
  overrides: ProviderOverrides = {},
): LLMProvider | null {
  const config = getModelConfig(modelConfigId, env)
  return config ? createProvider(config, env, overrides) : null
}

/** 生成阶段的 provider：有 ARK_API_KEY 返回方舟实例，否则 null。 */
export function getGenerateProvider(
  env: RegistryEnv = process.env,
  overrides: ProviderOverrides = {},
): LLMProvider | null {
  // 无 Key 时允许用 MOCK_LLM_FAULT 显式注入故障画像，供单测与本地验收走
  // generate 路由的失败分支；有 Key 时仍以真实方舟为准。
  if (!hasArkApiKey(env)) {
    // valid 画像需要显式申请：试运行与评估要它，生成不要（生成应继续走
    // 离线 composer，否则会用 mock 文本去解析结构化输出）。
    if (
      overrides.allowValidMock &&
      envValue(env, MOCK_FAULT_ENV)?.trim() === MOCK_VALID_PROFILE
    ) {
      return createValidMockProvider()
    }
    const fault = getMockFaultProfile(env)
    if (fault) {
      return new MockProvider({
        id: 'mock-fault',
        label: `Mock 故障画像 · ${fault}`,
        fault,
      })
    }
  }

  const config = getDefaultModelConfig('generate', env)
  return config ? createProvider(config, env, overrides) : null
}
