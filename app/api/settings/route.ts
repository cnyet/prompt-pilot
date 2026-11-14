import { NextResponse } from 'next/server'
import {
  SettingsError,
  getBudgetSetting,
  getLlmSettingsView,
  saveBudgetSetting,
  saveLlmSettings,
  type LlmSettingsPatch,
} from '@/lib/settings/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STRING_FIELDS = [
  'apiKey',
  'baseUrl',
  'modelGenerate',
  'modelOptimize',
  'modelEvaluate',
] as const

const NUMBER_FIELDS = [
  'generateTemperature',
  'generateMaxTokens',
  'optimizeTemperature',
  'optimizeMaxTokens',
] as const

interface ParsedSettingsBody {
  patch: LlmSettingsPatch
  budgetMonthlyCny: number | null | undefined
}

function readPatch(payload: unknown): ParsedSettingsBody {
  if (typeof payload !== 'object' || payload === null) {
    throw new SettingsError('INVALID_BODY', 400, '请求体必须是 JSON 对象。')
  }
  const raw = payload as Record<string, unknown>
  const patch: LlmSettingsPatch = {}

  for (const field of STRING_FIELDS) {
    if (!(field in raw)) {
      continue
    }
    const value = raw[field]
    if (value === null || typeof value === 'string') {
      patch[field] = value
      continue
    }
    throw new SettingsError('INVALID_BODY', 400, `${field} 只能是字符串或 null。`)
  }

  for (const field of NUMBER_FIELDS) {
    if (!(field in raw)) {
      continue
    }
    const value = raw[field]
    if (
      value === null ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      patch[field] = value
      continue
    }
    throw new SettingsError('INVALID_BODY', 400, `${field} 只能是数字或 null。`)
  }

  let budgetMonthlyCny: number | null | undefined
  if ('budgetMonthlyCny' in raw) {
    const value = raw.budgetMonthlyCny
    if (
      value === null ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      budgetMonthlyCny = value
    } else {
      throw new SettingsError(
        'INVALID_BODY',
        400,
        'budgetMonthlyCny 只能是数字或 null。',
      )
    }
  }

  return { patch, budgetMonthlyCny }
}

export async function GET(): Promise<NextResponse> {
  const [settings, budget] = await Promise.all([
    getLlmSettingsView(),
    getBudgetSetting(),
  ])
  return NextResponse.json({ settings, budget: { monthlyCny: budget } })
}

export async function PUT(request: Request): Promise<NextResponse> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: '请求体不是合法 JSON。' } },
      { status: 400 },
    )
  }

  try {
    const { patch, budgetMonthlyCny } = readPatch(payload)
    if (Object.keys(patch).length > 0) {
      await saveLlmSettings(patch)
    }
    if (budgetMonthlyCny !== undefined) {
      await saveBudgetSetting(budgetMonthlyCny)
    }
    const [settings, budget] = await Promise.all([
      getLlmSettingsView(),
      getBudgetSetting(),
    ])
    return NextResponse.json({ settings, budget: { monthlyCny: budget } })
  } catch (error) {
    if (error instanceof SettingsError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      )
    }
    console.warn('[settings] 未预期错误：', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: '设置保存失败。' } },
      { status: 500 },
    )
  }
}
