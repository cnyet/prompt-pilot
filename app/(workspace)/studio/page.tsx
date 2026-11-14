import { StudioWorkspace } from '@/components/studio-v3/StudioWorkspace'
import { getTemplate } from '@/lib/db/templates'
import { getGenerateProvider, getOptimizeProvider } from '@/lib/llm/registry'
import { getEffectiveLlmEnv } from '@/lib/settings/store'
import { resolveTemplatePrefill, type TemplatePrefill } from '@/lib/templates-v3'

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>
}) {
  const { template } = await searchParams
  let initialDraft: TemplatePrefill | null = null

  // 模板预填只在服务端解析；无效 id、重复参数或数据库失败都回落为空工作台。
  if (typeof template === 'string' && template.length > 0) {
    try {
      const row = await getTemplate(template)
      initialDraft = row ? resolveTemplatePrefill(row) : null
    } catch {}
  }

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
      key={initialDraft?.originTemplateId ?? 'studio'}
      initialDraft={initialDraft}
      generateAvailable={generateAvailable}
      optimizeAvailable={optimizeAvailable}
    />
  )
}
