import { NextResponse } from 'next/server'
import {
  SettingsError,
  getLlmSettingsView,
  saveLlmSettings,
  type LlmSettingsPatch,
} from '@/lib/settings/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function readPatch(payload: unknown): LlmSettingsPatch {
  if (typeof payload !== 'object' || payload === null) {
    throw new SettingsError('INVALID_BODY', 400, '请求体必须是 JSON 对象。')
  }
  const raw = payload as Record<string, unknown>
  const patch: LlmSettingsPatch = {}
  const fields = [
    'apiKey',
    'baseUrl',
    'modelGenerate',
    'modelEvaluate',
  ] as const
  for (const field of fields) {
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
  return patch
}

export async function GET(): Promise<NextResponse> {
  const settings = await getLlmSettingsView()
  return NextResponse.json({ settings })
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
    const patch = readPatch(payload)
    await saveLlmSettings(patch)
    const settings = await getLlmSettingsView()
    return NextResponse.json({ settings })
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
