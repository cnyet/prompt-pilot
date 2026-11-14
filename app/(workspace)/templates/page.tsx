import { TemplateLibrary } from '@/components/templates-v3/TemplateLibrary'
import { listTemplates } from '@/lib/db/templates'
import { toTemplateCard, type TemplateCard } from '@/lib/templates-v3'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  let initialTemplates: TemplateCard[] = []
  let initialLoadFailed = false

  // 数据库失败不阻断页面骨架：客户端展示可重试的错误态。
  try {
    initialTemplates = (await listTemplates()).map(toTemplateCard)
  } catch {
    initialLoadFailed = true
  }

  return (
    <TemplateLibrary
      initialTemplates={initialTemplates}
      initialLoadFailed={initialLoadFailed}
    />
  )
}
