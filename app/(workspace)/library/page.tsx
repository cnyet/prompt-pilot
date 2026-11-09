import { EmptyState } from '@/components/ui/EmptyState'

export default function LibraryPage() {
  return (
    <div className="px-6 py-8">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h1 className="text-h2 font-medium">提示词库</h1>
        <div className="flex items-center gap-2">
          <input
            type="search"
            disabled
            placeholder="搜索标题、标签、正文"
            className="h-8 w-64 rounded-control border border-line bg-surface px-2 text-label text-ink placeholder:text-ink-faint disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            title="M5 接入"
            className="h-8 rounded-control bg-accent px-3 text-label text-bg disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
          >
            新建
          </button>
        </div>
      </div>

      <EmptyState
        title="这里还没有提示词"
        hint="保存过的提示词会出现在这里，带版本历史和与首版的对比胜率。第一次生成后会有一条。"
      />
    </div>
  )
}
