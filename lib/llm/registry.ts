import { randomUUID } from 'node:crypto'
import { ArkProvider } from './ark'
import type { RetryOptions } from './errors'
import {
  MOCK_VALID_PROFILE,
  MockProvider,
  createValidMockProvider,
  isMockFaultProfile,
  type MockFaultProfile,
} from './mock'
import { MODEL_DISPLAY_LABELS, modelDisplayLabel } from './model-labels'
import {
  OpenAICompatProvider,
  type ModelPricingCny,
} from './openai-compat'
import type { LLMProvider } from './types'

// 旧调用方从 registry 导入显示名，继续 re-export 保持兼容。
export { MODEL_DISPLAY_LABELS, modelDisplayLabel }

/**
 * 模型注册表：把 ChatRequest.modelConfigId 解析成具体 provider 与 model。
 *
 * 只存 Model ID / ep- 接入点 ID 与价格，不存密钥；密钥永远从环境变量读取。
 * 有可用 Key 时走真实模型（默认 OpenAI 兼容网关，设 ARK_BASE_URL 可切回方舟）；
 * 无 Key 时 getGenerateProvider/getOptimizeProvider 返回 null，路由按 AC-15 返回 503 NO_MODEL，不伪造输出。
 */

/**
 * 默认走 OpenAI 兼容网关；部署在火山方舟时用 ARK_BASE_URL 覆盖回方舟数据面。
 * OpenAI SDK 会在 baseURL 后拼 `/chat/completions`，所以这里必须带 `/openai/v1`。
 */
export const ARK_DEFAULT_BASE_URL = 'https://opencode.ai/inference/go/openai/v1'
const OPENCODE_GATEWAY_PREFIX = 'https://opencode.ai/inference/go'
/** opencode Go 网关要求带稳定会话标识；本机单用户，进程内复用一个即可。 */
const OPENCODE_SESSION_ID = randomUUID()
export const DEFAULT_GENERATE_MODEL_ID = 'deepseek-v4.1-flash'

/**
 * 兼容早期保存的网关地址：`/inference/go` 与 `/inference/go/v1` 都指向
 * 同一个网关，但只补 `/v1` 会让 OpenAI SDK 拼出 404 的路径。
 * 其他自定义网关原样保留，只去掉末尾斜杠。
 */
export function normalizeArkBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '')
  if (
    value === OPENCODE_GATEWAY_PREFIX ||
    value === `${OPENCODE_GATEWAY_PREFIX}/v1`
  ) {
    return ARK_DEFAULT_BASE_URL
  }
  return value
}

/** opencode Go 网关需要 `x-opencode-session`，其他兼容端点不加。 */
export function isOpencodeGateway(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return (
      url.hostname === 'opencode.ai' &&
      url.pathname.startsWith('/inference/go')
    )
  } catch {
    return false
  }
}
export const DEFAULT_GENERATE_MODEL_CONFIG_ID = 'ark-generate'
export const DEFAULT_OPTIMIZE_MODEL_CONFIG_ID = 'ark-optimize'

export interface ModelPricing extends ModelPricingCny {
  contextWindow?: number
}

/**
 * 价格单位：元 / 百万 token；上下文窗口单位：token。
 *
 * opencode 网关两款默认模型的价格取自官网 models 元数据（USD/百万 token，
 * 2026-11-25 抓取）：deepseek-v4.1-flash 输入 0.15 / 缓存读 0.003 / 输出 0.6，
 * hy4-flash-free 全 0（免费档）。按同日 USD/CNY=6.678179 换算为人民币估算价；
 * 汇率是估算假设，网关调价或汇率大幅变动时需更新本表。
 * deepseek 峰值 ×2 窗口来自元数据 multipliers（UTC 工作日 01–04 / 06–10，
 * 即北京 09–12 / 14–18）。
 */
export const ARK_MODEL_PRESETS: Readonly<Record<string, ModelPricing>> = {
  'deepseek-v4.1-flash': {
    contextWindow: 1_000_000,
    inputCnyPerMillion: 1.0017,
    cachedInputCnyPerMillion: 0.02,
    outputCnyPerMillion: 4.0069,
    peak: { factor: 2, utcWeekdayHourRanges: [[1, 4], [6, 10]] },
  },
  'hy4-flash-free': {
    contextWindow: 1_048_576,
    inputCnyPerMillion: 0,
    cachedInputCnyPerMillion: 0,
    outputCnyPerMillion: 0,
  },
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
export type ModelRole = 'generate' | 'optimize'

export interface ModelConfig {
  id: string
  label: string
  provider: ProviderKind
  /** 只在 openai_compatible 时需要显式覆盖；方舟用默认数据面 */
  baseUrl?: string
  /** Model ID 或 ep- 接入点 ID，原样下发给 provider */
  modelId: string
  /** 额外请求头；opencode 网关用它带 x-opencode-session */
  headers?: Record<string, string>
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
  /** 允许在没有密钥时用 MOCK_LLM_FAULT=valid 的 Mock provider（v3 本地验收用） */
  allowValidMock?: boolean
  /** 单次请求超时；连通性测试用它避免等满默认 120 秒 */
  timeoutMs?: number
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
  const baseUrl = normalizeArkBaseUrl(
    envValue(env, 'ARK_BASE_URL') ?? ARK_DEFAULT_BASE_URL,
  )
  const generateModel = envValue(env, 'ARK_MODEL_GENERATE') ?? DEFAULT_GENERATE_MODEL_ID
  // 未单独配置优化模型时复用生成模型（FR-8.3）
  const optimizeModel = envValue(env, 'ARK_MODEL_OPTIMIZE') ?? generateModel

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
      provider: 'openai_compatible',
      baseUrl,
      ...(isOpencodeGateway(baseUrl)
        ? { headers: { 'x-opencode-session': OPENCODE_SESSION_ID } }
        : {}),
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
      `生成模型 · ${modelDisplayLabel(generateModel)}`,
      true,
    ),
    makeConfig(
      DEFAULT_OPTIMIZE_MODEL_CONFIG_ID,
      'optimize',
      optimizeModel,
      `优化模型 · ${modelDisplayLabel(optimizeModel)}`,
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

/** 是否配置了 ARK_API_KEY；无 Key 时 provider 为 null，路由按 AC-15 返回 503 NO_MODEL（v3 已删除离线模板）。 */
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
      ...(overrides.timeoutMs !== undefined
        ? { timeoutMs: overrides.timeoutMs }
        : {}),
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
      ...(config.headers ? { headers: config.headers } : {}),
      ...(config.pricing ? { pricing: config.pricing } : {}),
      ...(config.contextWindow !== undefined
        ? { contextWindow: config.contextWindow }
        : {}),
      ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
      ...(overrides.retry ? { retry: overrides.retry } : {}),
      ...(overrides.timeoutMs !== undefined
        ? { timeoutMs: overrides.timeoutMs }
        : {}),
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
    // valid 画像需要显式申请：v3 本地验收要它，普通请求不注入。
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

/** 优化阶段的 provider：有 ARK_API_KEY 返回方舟实例，否则 null。 */
export function getOptimizeProvider(
  env: RegistryEnv = process.env,
  overrides: ProviderOverrides = {},
): LLMProvider | null {
  // 无 Key 时允许用 MOCK_LLM_FAULT 显式注入故障画像，供单测与本地验收走
  // optimize 路由的失败分支；有 Key 时仍以真实方舟为准。
  if (!hasArkApiKey(env)) {
    // valid 画像需要显式申请：v3 本地验收要它，普通请求不注入。
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

  const config = getDefaultModelConfig('optimize', env)
  return config ? createProvider(config, env, overrides) : null
}
