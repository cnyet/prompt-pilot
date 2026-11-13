import { StudioWorkspace } from '@/components/studio-v3/StudioWorkspace'
import { getGenerateProvider, getOptimizeProvider } from '@/lib/llm/registry'
import { getEffectiveLlmEnv } from '@/lib/settings/store'
import { findSceneTemplate } from '@/lib/templates'

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>
}) {
  const { template } = await searchParams
  const scene = findSceneTemplate(template)

  // 可用性只在服务端计算，客户端只拿到布尔值；配置读取失败按不可用处理。
  let generateAvailable = false
  let optimizeAvailable = false
  try {
    const env = await getEffectiveLlmEnv()
    generateAvailable = Boolean(getGenerateProvider(env, { allowValidMock: true }))
    optimizeAvailable = Boolean(getOptimizeProvider(env, { allowValidMock: true }))
  } catch {}

  return (
    <StudioWorkspace
      initialGenerateInput={scene?.sample ?? ''}
      generateAvailable={generateAvailable}
      optimizeAvailable={optimizeAvailable}
    />
  )
}
