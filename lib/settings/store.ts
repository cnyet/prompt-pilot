import { getPrisma } from '@/lib/db/prisma'
import {
  ARK_DEFAULT_BASE_URL,
  DEFAULT_GENERATE_MODEL_ID,
  normalizeArkBaseUrl,
} from '@/lib/llm/registry'

/**
 * 设置的可写层。
 *
 * 优先级：设置页写入的值 > 环境变量 > 代码默认值。
 * 密钥只落在本机 SQLite，任何接口都不回传明文，只回报「是否已配置」与末四位提示。
 */

export const LLM_SETTING_KEYS = {
  apiKey: 'llm.apiKey',
  baseUrl: 'llm.baseUrl',
  modelGenerate: 'llm.modelGenerate',
  modelOptimize: 'llm.modelOptimize',
} as const

export type LlmSettingField = keyof typeof LLM_SETTING_KEYS

/** 与 registry 读取的环境变量一一对应 */
const ENV_BY_FIELD: Record<LlmSettingField, string> = {
  apiKey: 'ARK_API_KEY',
  baseUrl: 'ARK_BASE_URL',
  modelGenerate: 'ARK_MODEL_GENERATE',
  modelOptimize: 'ARK_MODEL_OPTIMIZE',
}

const DEFAULT_BY_FIELD: Partial<Record<LlmSettingField, string>> = {
  baseUrl: ARK_DEFAULT_BASE_URL,
  modelGenerate: DEFAULT_GENERATE_MODEL_ID,
}

export class SettingsError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = 'SettingsError'
    this.code = code
    this.status = status
  }
}

export const MODEL_PARAM_SETTING_KEYS = {
  generateTemperature: 'llm.generate.temperature',
  generateMaxTokens: 'llm.generate.maxTokens',
  optimizeTemperature: 'llm.optimize.temperature',
  optimizeMaxTokens: 'llm.optimize.maxTokens',
} as const

export const DEFAULT_MODEL_TEMPERATURE = 0.7
export const DEFAULT_MODEL_MAX_TOKENS = 8192

export type SettingSource =
  | 'settings'
  | 'env'
  | 'default'
  | 'none'
  | 'inherited'

export interface ModelParamValue {
  value: number
  source: SettingSource
}

export interface ModelParamSettings {
  temperature: ModelParamValue
  maxTokens: ModelParamValue
}

export interface LlmSettingsView {
  apiKey: { configured: boolean; hint: string | null; source: SettingSource }
  baseUrl: { value: string; source: SettingSource }
  modelGenerate: { value: string; source: SettingSource }
  modelOptimize: { value: string; source: SettingSource }
  params: { generate: ModelParamSettings; optimize: ModelParamSettings }
}

export interface EffectiveModelParams {
  temperature: number
  maxTokens: number
}

type EnvLike = Readonly<Record<string, string | undefined>>

/**
 * 设置读取走缓存：生成路由每个请求都要拿配置，直接查库会让首包
 * 卡在 SQLite 的写锁后面。缓存由保存动作主动失效，另配 TTL 兜底。
 */
const CACHE_TTL_MS = 10_000
const READ_TIMEOUT_MS = 300

let rowCache: { rows: Record<string, string>; at: number } | null = null

function invalidateCache(): void {
  rowCache = null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

async function readRows(): Promise<Record<string, string>> {
  const now = Date.now()
  if (rowCache && now - rowCache.at < CACHE_TTL_MS) {
    return rowCache.rows
  }

  const prisma = getPrisma()
  if (!prisma) {
    return {}
  }

  const query = prisma.appSetting
    .findMany({
      where: {
        key: {
          in: [
            ...Object.values(LLM_SETTING_KEYS),
            ...Object.values(MODEL_PARAM_SETTING_KEYS),
          ],
        },
      },
    })
    .then((rows) => {
      const out: Record<string, string> = {}
      for (const row of rows) {
        out[row.key] = row.value
      }
      return out
    })

  try {
    const rows = await withTimeout(query, READ_TIMEOUT_MS)
    if (rows === null) {
      // 库被锁或响应慢：本次按环境变量处理，不让对话被设置拖住。
      console.warn('[settings] 读取超时，本次按环境变量处理')
      return {}
    }
    rowCache = { rows, at: now }
    return rows
  } catch (error) {
    console.warn('[settings] 读取设置失败，按环境变量处理：', error)
    return {}
  }
}

/** 测试与保存动作用它让缓存立刻过期 */
export function invalidateSettingsCache(): void {
  invalidateCache()
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next && next.length > 0 ? next : undefined
}

/** 读取存量数字：缺失、非数字、越界或非整数（要求时）都按未设置处理。 */
function readStoredNumber(
  rows: Record<string, string>,
  key: string,
  min: number,
  max: number,
  integer: boolean,
): number | null {
  const raw = rows[key]?.trim()
  if (!raw) {
    return null
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) {
    return null
  }
  if (integer && !Number.isInteger(value)) {
    return null
  }
  return value
}

function resolveModelParams(rows: Record<string, string>): {
  generate: ModelParamSettings
  optimize: ModelParamSettings
} {
  const generateTemperature = readStoredNumber(
    rows,
    MODEL_PARAM_SETTING_KEYS.generateTemperature,
    0,
    2,
    false,
  )
  const generateMaxTokens = readStoredNumber(
    rows,
    MODEL_PARAM_SETTING_KEYS.generateMaxTokens,
    1,
    65536,
    true,
  )
  const optimizeTemperature = readStoredNumber(
    rows,
    MODEL_PARAM_SETTING_KEYS.optimizeTemperature,
    0,
    2,
    false,
  )
  const optimizeMaxTokens = readStoredNumber(
    rows,
    MODEL_PARAM_SETTING_KEYS.optimizeMaxTokens,
    1,
    65536,
    true,
  )

  const ownOrDefault = (
    own: number | null,
    fallback: number,
  ): ModelParamValue =>
    own === null
      ? { value: fallback, source: 'default' }
      : { value: own, source: 'settings' }

  const inherited = (
    own: number | null,
    generate: number | null,
    fallback: number,
  ): ModelParamValue => {
    if (own !== null) {
      return { value: own, source: 'settings' }
    }
    if (generate !== null) {
      return { value: generate, source: 'inherited' }
    }
    return { value: fallback, source: 'default' }
  }

  return {
    generate: {
      temperature: ownOrDefault(generateTemperature, DEFAULT_MODEL_TEMPERATURE),
      maxTokens: ownOrDefault(generateMaxTokens, DEFAULT_MODEL_MAX_TOKENS),
    },
    optimize: {
      temperature: inherited(
        optimizeTemperature,
        generateTemperature,
        DEFAULT_MODEL_TEMPERATURE,
      ),
      maxTokens: inherited(
        optimizeMaxTokens,
        generateMaxTokens,
        DEFAULT_MODEL_MAX_TOKENS,
      ),
    },
  }
}

/** 生成与优化角色的实际参数；优化未单独设置时继承生成。 */
export async function getEffectiveModelParams(
  role: 'generate' | 'optimize',
): Promise<EffectiveModelParams> {
  const rows = await readRows()
  const params = resolveModelParams(rows)[role]
  return {
    temperature: params.temperature.value,
    maxTokens: params.maxTokens.value,
  }
}

/**
 * 把设置页的覆盖值合到环境变量上，得到 registry 实际使用的配置。
 * 返回普通对象而不是修改 process.env，避免影响同进程内其他请求。
 */
export async function getEffectiveLlmEnv(
  base: EnvLike = process.env,
): Promise<Record<string, string | undefined>> {
  const rows = await readRows()
  const next: Record<string, string | undefined> = { ...base }

  for (const [field, key] of Object.entries(LLM_SETTING_KEYS) as Array<
    [LlmSettingField, string]
  >) {
    const override = trimmed(rows[key])
    if (override) {
      next[ENV_BY_FIELD[field]] = override
    }
  }
  if (next.ARK_BASE_URL) {
    next.ARK_BASE_URL = normalizeArkBaseUrl(next.ARK_BASE_URL)
  }
  return next
}

function maskKey(value: string): string {
  if (value.length <= 4) {
    return '…'
  }
  const tail = value.slice(-4)
  return `…${tail}`
}

export async function getLlmSettingsView(
  base: EnvLike = process.env,
): Promise<LlmSettingsView> {
  const rows = await readRows()

  const pick = (
    field: LlmSettingField,
  ): { value: string; source: SettingSource } => {
    const override = trimmed(rows[LLM_SETTING_KEYS[field]])
    if (override) {
      return { value: override, source: 'settings' }
    }
    const fromEnv = trimmed(base[ENV_BY_FIELD[field]])
    if (fromEnv) {
      return { value: fromEnv, source: 'env' }
    }
    const fallback = DEFAULT_BY_FIELD[field]
    if (fallback) {
      return { value: fallback, source: 'default' }
    }
    return { value: '', source: 'none' }
  }

  const keyOverride = trimmed(rows[LLM_SETTING_KEYS.apiKey])
  const keyFromEnv = trimmed(base[ENV_BY_FIELD.apiKey])
  const key = keyOverride ?? keyFromEnv
  const baseUrl = pick('baseUrl')
  const modelGenerate = pick('modelGenerate')
  const modelOptimizeOverride = trimmed(rows[LLM_SETTING_KEYS.modelOptimize])
  const modelOptimizeEnv = trimmed(base[ENV_BY_FIELD.modelOptimize])

  return {
    apiKey: {
      configured: Boolean(key),
      hint: key ? maskKey(key) : null,
      source: keyOverride ? 'settings' : keyFromEnv ? 'env' : 'none',
    },
    baseUrl: { ...baseUrl, value: normalizeArkBaseUrl(baseUrl.value) },
    modelGenerate,
    // 未单独配置优化模型时复用生成模型（FR-8.3）
    modelOptimize: modelOptimizeOverride
      ? { value: modelOptimizeOverride, source: 'settings' }
      : modelOptimizeEnv
        ? { value: modelOptimizeEnv, source: 'env' }
        : modelGenerate,
    params: resolveModelParams(rows),
  }
}

function assertBaseUrl(value: string): void {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new SettingsError(
      'INVALID_BASE_URL',
      400,
      '端点必须是完整的 http(s) 地址，例如 https://opencode.ai/inference/go/openai/v1。',
    )
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SettingsError(
      'INVALID_BASE_URL',
      400,
      '端点只支持 http(s) 协议。',
    )
  }
}

function assertModelId(value: string, label: string): void {
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(value)) {
    throw new SettingsError(
      'INVALID_MODEL_ID',
      400,
      `${label}只能是字母、数字、点、下划线、冒号或连字符，长度不超过 120。`,
    )
  }
}

export interface LlmSettingsPatch {
  apiKey?: string | null
  baseUrl?: string | null
  modelGenerate?: string | null
  modelOptimize?: string | null
  generateTemperature?: number | null
  generateMaxTokens?: number | null
  optimizeTemperature?: number | null
  optimizeMaxTokens?: number | null
}

/**
 * 保存覆盖值。传 null 或空串表示删除该覆盖，回落到环境变量。
 * 空对象直接返回，避免无意义的数据库往返。
 */
export async function saveLlmSettings(
  patch: LlmSettingsPatch,
): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) {
    throw new SettingsError(
      'NO_DATABASE',
      503,
      '数据库不可用，设置暂时无法保存。检查 DATABASE_URL 是否配置。',
    )
  }

  const writes: Array<{ key: string; value: string }> = []
  const deletes: string[] = []

  const handle = (
    field: LlmSettingField,
    value: string | null | undefined,
    validate?: (next: string) => void,
    normalize?: (next: string) => string,
  ): void => {
    if (value === undefined) {
      return
    }
    const key = LLM_SETTING_KEYS[field]
    const next = value?.trim() ?? ''
    if (next.length === 0) {
      deletes.push(key)
      return
    }
    validate?.(next)
    writes.push({ key, value: normalize ? normalize(next) : next })
  }

  handle('apiKey', patch.apiKey, (next) => {
    if (/\s/.test(next)) {
      throw new SettingsError(
        'INVALID_API_KEY',
        400,
        '密钥里不能有空格或换行，请检查是否粘贴完整。',
      )
    }
  })
  handle('baseUrl', patch.baseUrl, assertBaseUrl, normalizeArkBaseUrl)
  handle('modelGenerate', patch.modelGenerate, (next) =>
    assertModelId(next, '生成模型'),
  )
  handle('modelOptimize', patch.modelOptimize, (next) =>
    assertModelId(next, '优化模型'),
  )

  const handleNumber = (
    key: string,
    value: number | null | undefined,
    label: '生成' | '优化',
    kind: 'temperature' | 'maxTokens',
  ): void => {
    if (value === undefined) {
      return
    }
    if (value === null) {
      deletes.push(key)
      return
    }
    if (kind === 'temperature') {
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        throw new SettingsError(
          'INVALID_MODEL_PARAM',
          400,
          `${label}温度必须是 0 到 2 之间的数字。`,
        )
      }
    } else if (!Number.isInteger(value) || value < 1 || value > 65536) {
      throw new SettingsError(
        'INVALID_MODEL_PARAM',
        400,
        `${label}最大输出 token 必须是 1 到 65536 的整数。`,
      )
    }
    writes.push({ key, value: String(value) })
  }

  handleNumber(
    MODEL_PARAM_SETTING_KEYS.generateTemperature,
    patch.generateTemperature,
    '生成',
    'temperature',
  )
  handleNumber(
    MODEL_PARAM_SETTING_KEYS.generateMaxTokens,
    patch.generateMaxTokens,
    '生成',
    'maxTokens',
  )
  handleNumber(
    MODEL_PARAM_SETTING_KEYS.optimizeTemperature,
    patch.optimizeTemperature,
    '优化',
    'temperature',
  )
  handleNumber(
    MODEL_PARAM_SETTING_KEYS.optimizeMaxTokens,
    patch.optimizeMaxTokens,
    '优化',
    'maxTokens',
  )

  const operations = [
    ...writes.map((row) =>
      prisma.appSetting.upsert({
        where: { key: row.key },
        create: { key: row.key, value: row.value },
        update: { value: row.value },
      }),
    ),
    ...deletes.map((key) => prisma.appSetting.deleteMany({ where: { key } })),
  ]

  if (operations.length === 0) {
    return
  }

  try {
    await prisma.$transaction(operations)
    invalidateCache()
  } catch (error) {
    console.warn('[settings] 保存失败：', error)
    throw new SettingsError(
      'WRITE_FAILED',
      503,
      '设置写入失败，请稍后重试。',
    )
  }
}

/** 月度预算（人民币）；未设置为空字符串，读取为 null（FR-9.5/9.6）。 */
export const BUDGET_SETTING_KEY = 'budget.monthlyCny'

export async function getBudgetSetting(): Promise<number | null> {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: BUDGET_SETTING_KEY } })
    if (!row || row.value.trim().length === 0) {
      return null
    }
    const value = Number(row.value)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch (error) {
    console.warn('[settings] 读取预算失败：', error)
    return null
  }
}

export async function saveBudgetSetting(value: number | null): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) {
    throw new SettingsError('NO_DATABASE', 503, '数据库不可用，设置暂时无法保存。检查 DATABASE_URL 是否配置。')
  }
  if (value !== null && (!Number.isFinite(value) || value <= 0)) {
    throw new SettingsError('INVALID_BUDGET', 400, '预算必须是大于 0 的金额。')
  }
  try {
    if (value === null) {
      await prisma.appSetting.deleteMany({ where: { key: BUDGET_SETTING_KEY } })
    } else {
      await prisma.appSetting.upsert({
        where: { key: BUDGET_SETTING_KEY },
        create: { key: BUDGET_SETTING_KEY, value: String(value) },
        update: { value: String(value) },
      })
    }
    invalidateCache()
  } catch (error) {
    console.warn('[settings] 预算保存失败：', error)
    throw new SettingsError('WRITE_FAILED', 503, '设置写入失败，请稍后重试。')
  }
}
