import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BUDGET_SETTING_KEY,
  getBudgetSetting,
  getLlmSettingsView,
  invalidateSettingsCache,
  saveBudgetSetting,
  saveLlmSettings,
} from '@/lib/settings/store'
import { getPrisma } from '@/lib/db/prisma'

describe('v3 settings: modelOptimize 与预算', () => {
  beforeEach(() => {
    invalidateSettingsCache()
  })
  afterEach(async () => {
    const prisma = getPrisma()
    if (!prisma) return
    await prisma.appSetting.deleteMany({
      where: { key: { in: ['llm.modelOptimize', BUDGET_SETTING_KEY] } },
    })
    invalidateSettingsCache()
  })

  it('modelOptimize 未单独配置时回退生成模型（FR-8.3）', async () => {
    const view = await getLlmSettingsView()
    expect(view.modelOptimize.value).toBe(view.modelGenerate.value)
    expect(view.modelOptimize.source).toBe(view.modelGenerate.source)
  })

  it('modelOptimize 可保存、校验与清除', async () => {
    // 无效 ID 被拒绝，覆盖未写入
    await expect(saveLlmSettings({ modelOptimize: 'bad model id' })).rejects.toThrow()
    expect((await getLlmSettingsView()).modelOptimize.value).not.toBe('bad model id')
    await saveLlmSettings({ modelOptimize: 'gpt-5.6-luna' })
    expect((await getLlmSettingsView()).modelOptimize).toEqual({
      value: 'gpt-5.6-luna',
      source: 'settings',
    })
    await saveLlmSettings({ modelOptimize: null })
    const after = await getLlmSettingsView()
    expect(after.modelOptimize.value).toBe(after.modelGenerate.value)
  })

  it('预算未设置读出 null，不是 0（FR-9.6）', async () => {
    expect(await getBudgetSetting()).toBeNull()
  })

  it('预算可保存正数并清除', async () => {
    await saveBudgetSetting(30.5)
    expect(await getBudgetSetting()).toBe(30.5)
    await saveBudgetSetting(null)
    expect(await getBudgetSetting()).toBeNull()
  })

  it('预算拒绝非法值', async () => {
    await expect(saveBudgetSetting(-1)).rejects.toThrow()
    await expect(saveBudgetSetting(Number.NaN)).rejects.toThrow()
    await expect(saveBudgetSetting(Number.POSITIVE_INFINITY)).rejects.toThrow()
  })
})
