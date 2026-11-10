import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as getSettingsRoute, PUT as putSettingsRoute } from '@/app/api/settings/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import {
  LLM_SETTING_KEYS,
  getEffectiveLlmEnv,
  getLlmSettingsView,
  saveLlmSettings,
} from '@/lib/settings/store'

const SECRET = 'ark-secret-key-1234567890'

async function clearOverrides(): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) {
    return
  }
  await prisma.appSetting.deleteMany({
    where: { key: { in: Object.values(LLM_SETTING_KEYS) } },
  })
}

async function callPut(body: unknown): Promise<Response> {
  return putSettingsRoute(
    new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

beforeAll(async () => {
  await clearOverrides()
})

afterAll(async () => {
  await clearOverrides()
  await disconnectPrisma()
})

describe('设置写入与合并', () => {
  it('写入后优先于环境变量，清除后回落到环境变量', async () => {
    const base = { ARK_MODEL_GENERATE: 'env-model' }

    await saveLlmSettings({ modelGenerate: 'db-model' })
    const merged = await getEffectiveLlmEnv(base)
    expect(merged.ARK_MODEL_GENERATE).toBe('db-model')

    await saveLlmSettings({ modelGenerate: null })
    const fallback = await getEffectiveLlmEnv(base)
    expect(fallback.ARK_MODEL_GENERATE).toBe('env-model')
  })

  it('空串等同于清除覆盖，不会写入空值', async () => {
    await saveLlmSettings({ baseUrl: 'https://example.com/api/v3' })
    await saveLlmSettings({ baseUrl: '' })

    const prisma = getPrisma()
    const row = await prisma?.appSetting.findUnique({
      where: { key: LLM_SETTING_KEYS.baseUrl },
    })
    expect(row).toBeNull()
  })

  it('拒绝非法端点与非法模型标识', async () => {
    await expect(
      saveLlmSettings({ baseUrl: 'not-a-url' }),
    ).rejects.toThrowError(/端点/)
    await expect(
      saveLlmSettings({ modelGenerate: 'model with space' }),
    ).rejects.toThrowError(/生成模型/)
    await expect(
      saveLlmSettings({ apiKey: 'has space inside' }),
    ).rejects.toThrowError(/密钥/)
  })

  it('视图只回报末四位，不泄露明文', async () => {
    await saveLlmSettings({ apiKey: SECRET })

    const view = await getLlmSettingsView({})
    expect(view.apiKey.configured).toBe(true)
    expect(view.apiKey.source).toBe('settings')
    expect(view.apiKey.hint).toBe('…7890')
    expect(JSON.stringify(view)).not.toContain(SECRET)

    await clearOverrides()
  })
})

describe('设置接口', () => {
  it('GET 返回配置视图，且响应体不含密钥明文', async () => {
    await saveLlmSettings({ apiKey: SECRET, modelGenerate: 'db-model' })

    const response = await getSettingsRoute()
    const body = (await response.json()) as {
      settings: { apiKey: { configured: boolean; hint: string | null } }
    }
    expect(response.status).toBe(200)
    expect(body.settings.apiKey.configured).toBe(true)
    expect(body.settings.apiKey.hint).toBe('…7890')
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })

  it('PUT 校验失败返回 400 与可读原因', async () => {
    const response = await callPut({ baseUrl: 'ftp://example.com' })
    expect(response.status).toBe(400)
    const body = (await response.json()) as {
      error: { code: string; message: string }
    }
    expect(body.error.code).toBe('INVALID_BASE_URL')
    expect(body.error.message).toContain('http(s)')
  })

  it('PUT 非字符串字段返回 400', async () => {
    const response = await callPut({ apiKey: 123 })
    expect(response.status).toBe(400)
  })

  it('PUT null 清除覆盖，GET 反映回落状态', async () => {
    await saveLlmSettings({ modelGenerate: 'db-model' })
    const response = await callPut({ modelGenerate: null })
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      settings: { modelGenerate: { source: string } }
    }
    expect(body.settings.modelGenerate.source).not.toBe('settings')
  })
})
