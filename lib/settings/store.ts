import { getPrisma } from '@/lib/db/prisma'
import {
  ARK_DEFAULT_BASE_URL,
  DEFAULT_EVALUATE_MODEL_ID,
  DEFAULT_GENERATE_MODEL_ID,
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
  modelEvaluate: 'llm.modelEvaluate',
} as const

export type LlmSettingField = keyof typeof LLM_SETTING_KEYS

/** 与 registry 读取的环境变量一一对应 */
const ENV_BY_FIELD: Record<LlmSettingField, string> = {
  apiKey: 'ARK_API_KEY',
  baseUrl: 'ARK_BASE_URL',
  modelGenerate: 'ARK_MODEL_GENERATE',
  modelEvaluate: 'ARK_MODEL_EVALUATE',
}

const DEFAULT_BY_FIELD: Partial<Record<LlmSettingField, string>> = {
  baseUrl: ARK_DEFAULT_BASE_URL,
  modelGenerate: DEFAULT_GENERATE_MODEL_ID,
  modelEvaluate: DEFAULT_EVALUATE_MODEL_ID,
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

export type SettingSource = 'settings' | 'env' | 'default' | 'none'

export interface LlmSettingsView {
  apiKey: { configured: boolean; hint: string | null; source: SettingSource }
  baseUrl: { value: string; source: SettingSource }
  modelGenerate: { value: string; source: SettingSource }
  modelEvaluate: { value: string; source: SettingSource }
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
    .findMany({ where: { key: { in: Object.values(LLM_SETTING_KEYS) } } })
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
  return next
}

function maskKey(value: string): string {
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

  return {
    apiKey: {
      configured: Boolean(key),
      hint: key ? maskKey(key) : null,
      source: keyOverride ? 'settings' : keyFromEnv ? 'env' : 'none',
    },
    baseUrl: pick('baseUrl'),
    modelGenerate: pick('modelGenerate'),
    modelEvaluate: pick('modelEvaluate'),
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
      '端点必须是完整的 http(s) 地址，例如 https://ark.cn-beijing.volces.com/api/v3。',
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
  modelEvaluate?: string | null
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
    writes.push({ key, value: next })
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
  handle('baseUrl', patch.baseUrl, assertBaseUrl)
  handle('modelGenerate', patch.modelGenerate, (next) =>
    assertModelId(next, '生成模型'),
  )
  handle('modelEvaluate', patch.modelEvaluate, (next) =>
    assertModelId(next, '评估模型'),
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
