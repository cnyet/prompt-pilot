import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPrisma } from '@/lib/db/prisma'
import {
  DEFAULT_MODEL_MAX_TOKENS,
  DEFAULT_MODEL_TEMPERATURE,
  MODEL_PARAM_SETTING_KEYS,
  getEffectiveModelParams,
  getLlmSettingsView,
  invalidateSettingsCache,
  saveLlmSettings,
} from '@/lib/settings/store'

const PARAM_KEYS = Object.values(MODEL_PARAM_SETTING_KEYS)

async function clearParamRows(): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) return
  await prisma.appSetting.deleteMany({ where: { key: { in: PARAM_KEYS } } })
  invalidateSettingsCache()
}

describe('v3 settings: 模型参数与继承（AC-26）', () => {
  beforeEach(async () => {
    await clearParamRows()
  })

  afterEach(async () => {
    await clearParamRows()
  })

  it('无任何覆盖时两个角色都用默认值', async () => {
    await expect(getEffectiveModelParams('generate')).resolves.toEqual({
      temperature: DEFAULT_MODEL_TEMPERATURE,
      maxTokens: DEFAULT_MODEL_MAX_TOKENS,
    })
    await expect(getEffectiveModelParams('optimize')).resolves.toEqual({
      temperature: DEFAULT_MODEL_TEMPERATURE,
      maxTokens: DEFAULT_MODEL_MAX_TOKENS,
    })
  })

  it('只设置生成参数时优化角色继承生成参数', async () => {
    await saveLlmSettings({ generateTemperature: 0.2, generateMaxTokens: 4096 })

    await expect(getEffectiveModelParams('generate')).resolves.toEqual({
      temperature: 0.2,
      maxTokens: 4096,
    })
    await expect(getEffectiveModelParams('optimize')).resolves.toEqual({
      temperature: 0.2,
      maxTokens: 4096,
    })

    const view = await getLlmSettingsView()
    expect(view.params.generate.temperature).toEqual({ value: 0.2, source: 'settings' })
    expect(view.params.generate.maxTokens).toEqual({ value: 4096, source: 'settings' })
    expect(view.params.optimize.temperature).toEqual({ value: 0.2, source: 'inherited' })
    expect(view.params.optimize.maxTokens).toEqual({ value: 4096, source: 'inherited' })
  })

  it('优化角色单独设置时不再继承，生成角色保持自己的设置', async () => {
    await saveLlmSettings({ generateTemperature: 0.2, generateMaxTokens: 4096 })
    await saveLlmSettings({ optimizeTemperature: 1.4, optimizeMaxTokens: 2048 })

    await expect(getEffectiveModelParams('generate')).resolves.toEqual({
      temperature: 0.2,
      maxTokens: 4096,
    })
    await expect(getEffectiveModelParams('optimize')).resolves.toEqual({
      temperature: 1.4,
      maxTokens: 2048,
    })

    const view = await getLlmSettingsView()
    expect(view.params.optimize.temperature.source).toBe('settings')
    expect(view.params.optimize.maxTokens.source).toBe('settings')
  })

  it('清除优化参数后恢复继承生成参数', async () => {
    await saveLlmSettings({ generateTemperature: 0.2, generateMaxTokens: 4096 })
    await saveLlmSettings({ optimizeTemperature: 1.4, optimizeMaxTokens: 2048 })
    await saveLlmSettings({ optimizeTemperature: null, optimizeMaxTokens: null })

    await expect(getEffectiveModelParams('optimize')).resolves.toEqual({
      temperature: 0.2,
      maxTokens: 4096,
    })
    expect((await getLlmSettingsView()).params.optimize.temperature.source).toBe('inherited')
  })

  it('清除生成参数后两个角色回到默认值', async () => {
    await saveLlmSettings({ generateTemperature: 0.2, generateMaxTokens: 4096 })
    await saveLlmSettings({ generateTemperature: null, generateMaxTokens: null })

    await expect(getEffectiveModelParams('generate')).resolves.toEqual({
      temperature: DEFAULT_MODEL_TEMPERATURE,
      maxTokens: DEFAULT_MODEL_MAX_TOKENS,
    })
    await expect(getEffectiveModelParams('optimize')).resolves.toEqual({
      temperature: DEFAULT_MODEL_TEMPERATURE,
      maxTokens: DEFAULT_MODEL_MAX_TOKENS,
    })
  })

  it('损坏或越界的存量值被忽略并回落到有效默认值', async () => {
    const prisma = getPrisma()
    if (!prisma) throw new Error('测试数据库不可用')
    await prisma.appSetting.createMany({
      data: [
        { key: MODEL_PARAM_SETTING_KEYS.generateTemperature, value: 'not-a-number' },
        { key: MODEL_PARAM_SETTING_KEYS.generateMaxTokens, value: '4096.5' },
        { key: MODEL_PARAM_SETTING_KEYS.optimizeTemperature, value: '9' },
      ],
    })
    invalidateSettingsCache()

    await expect(getEffectiveModelParams('generate')).resolves.toEqual({
      temperature: DEFAULT_MODEL_TEMPERATURE,
      maxTokens: DEFAULT_MODEL_MAX_TOKENS,
    })
    await expect(getEffectiveModelParams('optimize')).resolves.toEqual({
      temperature: DEFAULT_MODEL_TEMPERATURE,
      maxTokens: DEFAULT_MODEL_MAX_TOKENS,
    })
  })

  it('视图参数来源在保存后为 settings，清除后为 default', async () => {
    await saveLlmSettings({ generateTemperature: 0.5 })
    expect((await getLlmSettingsView()).params.generate.temperature).toEqual({
      value: 0.5,
      source: 'settings',
    })

    await saveLlmSettings({ generateTemperature: null })
    expect((await getLlmSettingsView()).params.generate.temperature).toEqual({
      value: DEFAULT_MODEL_TEMPERATURE,
      source: 'default',
    })
  })

  it('保存时校验温度与最大输出 token 的范围', async () => {
    await expect(saveLlmSettings({ generateTemperature: 2.1 })).rejects.toThrow(
      '生成温度必须是 0 到 2 之间的数字。',
    )
    await expect(saveLlmSettings({ optimizeTemperature: -0.1 })).rejects.toThrow(
      '优化温度必须是 0 到 2 之间的数字。',
    )
    await expect(saveLlmSettings({ generateTemperature: Number.NaN })).rejects.toThrow()
    await expect(saveLlmSettings({ generateMaxTokens: 0 })).rejects.toThrow(
      '生成最大输出 token 必须是 1 到 65536 的整数。',
    )
    await expect(saveLlmSettings({ optimizeMaxTokens: 1.5 })).rejects.toThrow(
      '优化最大输出 token 必须是 1 到 65536 的整数。',
    )
    await expect(saveLlmSettings({ generateMaxTokens: 65537 })).rejects.toThrow()
  })
})
