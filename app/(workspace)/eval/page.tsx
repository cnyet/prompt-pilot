import { EmptyState } from '@/components/ui/EmptyState'

export default function EvalPage() {
  return (
    <div className="px-6 py-8">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h1 className="text-h2 font-medium">评估</h1>
        <button
          type="button"
          disabled
          title="M4 接入"
          className="h-8 rounded-control bg-accent px-3 text-label text-bg disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
        >
          新建评估
        </button>
      </div>

      <EmptyState
        title="还没有评估"
        hint="评估跑的是输出，不是提示词文本：用固定样本跑出真实结果，对照成功标准逐条判定，再和你的第一版对比胜率。每次约 0.002 元。"
      />
    </div>
  )
}
