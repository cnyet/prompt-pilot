import { NextResponse } from 'next/server'
import {
  DEFAULT_GENERATE_MODEL_CONFIG_ID,
  DEFAULT_OPTIMIZE_MODEL_CONFIG_ID,
  createProvider,
  getModelConfig,
  modelDisplayLabel,
} from '@/lib/llm/registry'
import { getEffectiveLlmEnv } from '@/lib/settings/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 设置页的连通性测试不能等满 provider 默认的 120 秒。 */
const TEST_TIMEOUT_MS = 15_000

const TARGETS = [
  {
    role: 'generate',
    roleLabel: '生成',
    configId: DEFAULT_GENERATE_MODEL_CONFIG_ID,
  },
  {
    role: 'optimize',
    roleLabel: '优化',
    configId: DEFAULT_OPTIMIZE_MODEL_CONFIG_ID,
  },
] as const

interface ModelTestResult {
  role: 'generate' | 'optimize'
  roleLabel: string
  modelId: string | null
  modelLabel: string | null
  configured: boolean
  ok: boolean
  latencyMs: number | null
  error?: string
}

/**
 * 用已保存的配置各发一次最小请求，确认密钥、端点和模型 ID 真的能用。
 * 只回模型标识与耗时，永不回传密钥。
 */
export async function POST(): Promise<NextResponse> {
  try {
    const env = await getEffectiveLlmEnv()
    const models = await Promise.all(
      TARGETS.map(async (target): Promise<ModelTestResult> => {
        const config = getModelConfig(target.configId, env)
        if (!config) {
          return {
            role: target.role,
            roleLabel: target.roleLabel,
            modelId: null,
            modelLabel: null,
            configured: false,
            ok: false,
            latencyMs: null,
            error: '模型配置不存在。',
          }
        }

        const base = {
          role: target.role,
          roleLabel: target.roleLabel,
          modelId: config.modelId,
          modelLabel: modelDisplayLabel(config.modelId),
        }
        const provider = createProvider(config, env, {
          timeoutMs: TEST_TIMEOUT_MS,
        })
        if (!provider) {
          return {
            ...base,
            configured: false,
            ok: false,
            latencyMs: null,
          }
        }

        const ping = await provider.ping()
        return {
          ...base,
          configured: true,
          ok: ping.ok,
          latencyMs: ping.latencyMs,
          ...(ping.error ? { error: ping.error } : {}),
        }
      }),
    )

    const configured = models.every((model) => model.configured)
    return NextResponse.json(
      {
        result: {
          ok: configured && models.every((model) => model.ok),
          configured,
          checkedAt: new Date().toISOString(),
          models,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.warn('[settings] 连通性测试失败：', error)
    return NextResponse.json(
      {
        error: {
          code: 'TEST_FAILED',
          message: '连通性测试没有完成，请稍后重试。',
        },
      },
      { status: 500 },
    )
  }
}