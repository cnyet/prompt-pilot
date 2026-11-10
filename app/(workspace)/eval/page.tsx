import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'

export default function EvalPage() {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-10 px-6 py-8 lg:px-10">
      <PageHeader
        title="评估"
        description="评估跑的是输出，不是提示词文本：用固定样本跑出真实结果，对照成功标准逐条判定。"
        actions={
          <Button variant="primary" size="md" icon="plus" disabled title="后续版本开放">
            新建评估
          </Button>
        }
      />

      <div className="rounded-panel border border-line-subtle bg-surface">
        <EmptyState
          icon="eval"
          title="还没有评估"
          hint="用固定样本跑出真实结果，对照成功标准逐条判定，再和你的第一版对比胜率。每次约 0.002 元。"
        />
      </div>
    </div>
  )
}
