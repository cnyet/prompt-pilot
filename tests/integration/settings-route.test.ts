import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as getSettingsRoute, PUT as putSettingsRoute } from '@/app/api/settings/route'
import { ARK_DEFAULT_BASE_URL } from '@/lib/llm/registry'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import {
  BUDGET_SETTING_KEY,
  LLM_SETTING_KEYS,
  MODEL_PARAM_SETTING_KEYS,
  getBudgetSetting,
  getEffectiveLlmEnv,
  getLlmSettingsView,
  invalidateSettingsCache,
  saveLlmSettings,
} from '@/lib/settings/store'

const SECRET = 'ark-secret-key-1234567890'

async function clearOverrides(): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) {
    return
  }
  await prisma.appSetting.deleteMany({
    where: {
      key: {
        in: [
          ...Object.values(LLM_SETTING_KEYS),
          ...Object.values(MODEL_PARAM_SETTING_KEYS),
          BUDGET_SETTING_KEY,
        ],
      },
    },
  })
  invalidateSettingsCache()
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

beforeEach(async () => {
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

  it('旧版网关地址保存后自动补齐 /openai/v1', async () => {
    await saveLlmSettings({ baseUrl: 'https://opencode.ai/inference/go' })

    const prisma = getPrisma()
    const row = await prisma?.appSetting.findUnique({
      where: { key: LLM_SETTING_KEYS.baseUrl },
    })
    expect(row?.value).toBe(ARK_DEFAULT_BASE_URL)

    const view = await getLlmSettingsView({})
    expect(view.baseUrl.value).toBe(ARK_DEFAULT_BASE_URL)

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

  it('短密钥只回省略号，不回显全文', async () => {
    await saveLlmSettings({ apiKey: 'abc' })

    const response = await getSettingsRoute()
    const body = (await response.json()) as {
      settings: { apiKey: { configured: boolean; hint: string | null } }
    }
    expect(response.status).toBe(200)
    expect(body.settings.apiKey.configured).toBe(true)
    expect(body.settings.apiKey.hint).toBe('…')
    expect(JSON.stringify(body)).not.toContain('abc')
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

interface SettingsBody {
  settings: {
    modelOptimize: { value: string; source: string }
    params: {
      generate: {
        temperature: { value: number; source: string }
        maxTokens: { value: number; source: string }
      }
      optimize: {
        temperature: { value: number; source: string }
        maxTokens: { value: number; source: string }
      }
    }
  }
  budget: { monthlyCny: number | null }
}

describe('设置接口：模型、参数与预算（Batch H）', () => {
  it('PUT modelOptimize 后 GET 返回设置来源', async () => {
    const response = await callPut({ modelOptimize: 'opt-model' })
    expect(response.status).toBe(200)

    const body = (await response.json()) as SettingsBody
    expect(body.settings.modelOptimize).toEqual({
      value: 'opt-model',
      source: 'settings',
    })

    const getBody = (await (await getSettingsRoute()).json()) as SettingsBody
    expect(getBody.settings.modelOptimize).toEqual({
      value: 'opt-model',
      source: 'settings',
    })
  })

  it('PUT 生成参数后 GET 返回参数值', async () => {
    const response = await callPut({
      generateTemperature: 0.3,
      generateMaxTokens: 2048,
    })
    expect(response.status).toBe(200)

    const body = (await response.json()) as SettingsBody
    expect(body.settings.params.generate.temperature.value).toBe(0.3)
    expect(body.settings.params.generate.maxTokens.value).toBe(2048)
  })

  it('PUT optimizeTemperature null 恢复继承生成参数', async () => {
    await callPut({ generateTemperature: 0.3, generateMaxTokens: 2048 })
    await callPut({ optimizeTemperature: 1.2 })

    const own = (await (await callPut({})).json()) as SettingsBody
    expect(own.settings.params.optimize.temperature).toEqual({
      value: 1.2,
      source: 'settings',
    })

    const inherited = (await (
      await callPut({ optimizeTemperature: null })
    ).json()) as SettingsBody
    expect(inherited.settings.params.optimize.temperature).toEqual({
      value: 0.3,
      source: 'inherited',
    })
    expect(inherited.settings.params.optimize.maxTokens).toEqual({
      value: 2048,
      source: 'inherited',
    })
  })

  it('PUT 预算并清除', async () => {
    const saved = await callPut({ budgetMonthlyCny: 100 })
    expect(saved.status).toBe(200)
    expect(((await saved.json()) as SettingsBody).budget.monthlyCny).toBe(100)
    expect(await getBudgetSetting()).toBe(100)

    const cleared = await callPut({ budgetMonthlyCny: null })
    expect(cleared.status).toBe(200)
    expect(((await cleared.json()) as SettingsBody).budget.monthlyCny).toBeNull()
    expect(await getBudgetSetting()).toBeNull()
  })

  it('PUT 类型与范围错误返回 400', async () => {
    const stringTemperature = await callPut({ generateTemperature: '0.3' })
    expect(stringTemperature.status).toBe(400)
    expect(await stringTemperature.json()).toMatchObject({
      error: { code: 'INVALID_BODY' },
    })

    const fractionalTokens = await callPut({ generateMaxTokens: 1.5 })
    expect(fractionalTokens.status).toBe(400)
    expect(await fractionalTokens.json()).toMatchObject({
      error: { code: 'INVALID_MODEL_PARAM' },
    })

    const negativeBudget = await callPut({ budgetMonthlyCny: -1 })
    expect(negativeBudget.status).toBe(400)
    expect(await negativeBudget.json()).toMatchObject({
      error: { code: 'INVALID_BUDGET' },
    })
  })

  it('响应不包含密钥明文', async () => {
    await callPut({ apiKey: SECRET, generateTemperature: 0.4 })
    const response = await getSettingsRoute()
    expect(JSON.stringify(await response.json())).not.toContain(SECRET)
  })
})
