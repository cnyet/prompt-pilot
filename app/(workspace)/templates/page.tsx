const GROUPS = [
  {
    name: '通用问答',
    note: '需要明确受众与答案粒度，避免泛泛而谈',
  },
  {
    name: '内容创作',
    note: '强调语气、篇幅与禁用词，边界比风格更重要',
  },
  {
    name: '代码生成',
    note: '锁定语言版本、依赖与错误处理方式',
  },
  {
    name: '数据分析',
    note: '规定口径、缺失值处理与结论的置信表述',
  },
  {
    name: '客服对话',
    note: '必须写清越界话术与转人工条件',
  },
  {
    name: '结构化抽取',
    note: '字段、类型、缺失与冲突优先级要逐条定义',
  },
]

export default function TemplatesPage() {
  return (
    <div className="px-6 py-8">
      <h1 className="text-h2 font-medium">模板</h1>
      <p className="mt-1 text-body text-ink-muted">
        模板只调整字段权重与默认约束，不替代你的需求。
      </p>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {GROUPS.map((group) => (
          <li
            key={group.name}
            className="flex items-baseline justify-between gap-6 py-3"
          >
            <span className="w-32 shrink-0 text-body font-medium">
              {group.name}
            </span>
            <span className="flex-1 text-body text-ink-muted">{group.note}</span>
            <button
              type="button"
              disabled
              title="M1 接入"
              className="shrink-0 rounded-control border border-line px-2 py-1 text-caption text-ink-faint disabled:cursor-not-allowed"
            >
              用这个新建
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
