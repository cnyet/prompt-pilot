import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST as testSettingsRoute } from '@/app/api/settings/test/route'

const ping = vi.fn(async () => ({ ok: true, latencyMs: 123 }))

vi.mock('@/lib/settings/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/settings/store')>()
  return {
    ...actual,
    // 不碰数据库：测试只关心路由如何把 provider 结果组装成响应。
    getEffectiveLlmEnv: vi.fn(async () => ({ ...process.env })),
  }
})

vi.mock('@/lib/llm/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/registry')>()
  return {
    ...actual,
    // 保持与真实实现一致：没有密钥就不创建 provider，避免测试打到网络。
    createProvider: vi.fn(
      (_config: unknown, env: Record<string, string | undefined>) =>
        env.ARK_API_KEY ? { ping } : null,
    ),
  }
})

async function readBody(response: Response): Promise<{
  result: {
    ok: boolean
    configured: boolean
    models: Array<{
      role: string
      configured: boolean
      ok: boolean
      latencyMs: number | null
      error?: string
    }>
  }
}> {
  return (await response.json()) as never
}

afterEach(() => {
  ping.mockClear()
  vi.unstubAllEnvs()
})

describe('设置连通性测试接口', () => {
  it('未配置密钥时报告离线模式，且不发真实请求', async () => {
    vi.stubEnv('ARK_API_KEY', '')

    const response = await testSettingsRoute()
    const body = await readBody(response)

    expect(response.status).toBe(200)
    expect(body.result.configured).toBe(false)
    expect(body.result.ok).toBe(false)
    expect(body.result.models).toHaveLength(2)
    for (const model of body.result.models) {
      expect(model.configured).toBe(false)
      expect(model.latencyMs).toBeNull()
    }
    expect(ping).not.toHaveBeenCalled()
  })

  it('生成与优化各测一次，只回模型标识与耗时', async () => {
    vi.stubEnv('ARK_API_KEY', 'ark-secret-key-1234567890')

    const response = await testSettingsRoute()
    const body = await readBody(response)

    expect(response.status).toBe(200)
    expect(body.result.configured).toBe(true)
    expect(body.result.ok).toBe(true)
    expect(body.result.models.map((model) => model.role)).toEqual([
      'generate',
      'optimize',
    ])
    expect(ping).toHaveBeenCalledTimes(2)
    for (const model of body.result.models) {
      expect(model.ok).toBe(true)
      expect(model.latencyMs).toBe(123)
    }
    expect(JSON.stringify(body)).not.toContain('ark-secret-key-1234567890')
  })
})