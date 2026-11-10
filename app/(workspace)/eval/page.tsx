import { PageHeader } from '@/components/ui/Section'
import { EvalWorkspace } from '@/components/eval/EvalWorkspace'

export default function EvalPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 py-8 lg:px-10">
      <PageHeader
        title="评估"
        description="评估跑的是输出，不是提示词文本：用固定样本跑出真实结果，对照成功标准逐条判定，再和基线 v0 比胜率。"
      />
      <EvalWorkspace />
    </div>
  )
}
