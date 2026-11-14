import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as generateRoute } from '@/app/api/generate/route'
import type { ChatRequest } from '@/lib/llm/types'
import { getPrisma } from '@/lib/db/prisma'
import {
  MODEL_PARAM_SETTING_KEYS,
  invalidateSettingsCache,
  saveLlmSettings,
} from '@/lib/settings/store'

const MARKER = '生成参数接线测试'

const state = vi.hoisted(() => ({
  captured: [] as ChatRequest[],
}))

vi.mock('@/lib/llm/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/registry')>()
  return {
    ...actual,
    // 只替换 provider，模型配置与错误分类保持真实实现。
    getGenerateProvider: vi.fn(() => ({
      id: 'test-provider',
      label: '测试模型',
      chat: async () => {
        throw new Error('unused')
      },
      structured: async () => {
        throw new Error('unused')
      },
      ping: async () => ({ ok: true, latencyMs: 1 }),
      async *stream(request: ChatRequest) {
        state.captured.push(request)
        yield { delta: '正文' }
        yield {
          delta:
            '\n<<<PROMPTPILOT_META>>>{"title":"测试参数","notes":[]}',
        }
        yield {
          delta: '',
          finishReason: 'stop' as const,
          usage: { tokensIn: 1, tokensOut: 1 },
        }
      },
    })),
  }
})

async function clearSettings(): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) return
  await prisma.appSetting.deleteMany({
    where: { key: { in: Object.values(MODEL_PARAM_SETTING_KEYS) } },
  })
  invalidateSettingsCache()
}

async function clearRecords(): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) return
  await prisma.promptRecord.deleteMany({ where: { sourceInput: MARKER } })
}

function generateRequest(): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'generate',
      sourceInput: MARKER,
      requestId: randomUUID(),
    }),
  })
}

describe('v3 生成路由使用已保存的模型参数（AC-26）', () => {
  beforeEach(async () => {
    await clearSettings()
    await clearRecords()
    state.captured.length = 0
  })

  afterEach(async () => {
    await clearSettings()
    await clearRecords()
  })

  it('把生成角色的 temperature 与 maxTokens 传给 provider', async () => {
    await saveLlmSettings({
      generateTemperature: 0.25,
      generateMaxTokens: 1024,
    })

    const response = await generateRoute(generateRequest())
    expect(response.status).toBe(200)
    await response.text()

    expect(state.captured).toHaveLength(1)
    expect(state.captured[0]?.temperature).toBe(0.25)
    expect(state.captured[0]?.maxTokens).toBe(1024)
  })
})
