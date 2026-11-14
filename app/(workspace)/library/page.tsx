import { LibraryV3 } from '@/components/library-v3/LibraryV3'
import { getOptimizeProvider } from '@/lib/llm/registry'
import { getEffectiveLlmEnv } from '@/lib/settings/store'

// 模型可用性随设置变化，必须按请求计算，不能在构建期预渲染成静态页。
export const dynamic = 'force-dynamic'

export default async function LibraryPage() {
  // 可用性只在服务端计算；配置读取失败按不可用处理。
  let optimizeAvailable = false
  try {
    const env = await getEffectiveLlmEnv()
    optimizeAvailable = Boolean(getOptimizeProvider(env, { allowValidMock: true }))
  } catch {}

  return <LibraryV3 optimizeAvailable={optimizeAvailable} />
}
