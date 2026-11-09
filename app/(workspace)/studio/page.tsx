const TEMPLATES = [
  '通用问答',
  '内容创作',
  '代码生成',
  '数据分析',
  '客服对话',
  '结构化抽取',
]

const EXAMPLES = [
  '帮我写个周报',
  '把这段客服话术改成更专业的版本',
  '给产品评审会写一份议程',
]

export default function StudioPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[880px] flex-col justify-center px-6 py-20">
      <div className="rounded-panel border border-line bg-surface p-4">
        <label htmlFor="requirement" className="sr-only">
          需求或已有提示词
        </label>
        <textarea
          id="requirement"
          rows={4}
          placeholder="用一句话说清你要做什么，也可以直接粘贴一份已有的提示词。"
          className="w-full resize-none bg-transparent text-body-lg text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="text-caption text-ink-faint">
            粘贴长文本会自动切到改进模式
          </p>
          <button
            type="button"
            disabled
            title="生成能力在 M1 接入"
            className="rounded-control bg-accent px-3 py-1.5 text-label font-medium text-bg disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
          >
            生成
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TEMPLATES.map((name) => (
          <span
            key={name}
            className="rounded-chip border border-line px-2 py-1 text-caption text-ink-muted"
          >
            {name}
          </span>
        ))}
      </div>

      <div className="mt-10 border-t border-line pt-4">
        <p className="text-caption text-ink-faint">试试这些</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {EXAMPLES.map((text) => (
            <li key={text} className="text-body text-ink-muted">
              {text}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-10 text-caption text-ink-faint">
        M0 骨架：输入与结构已就位，生成、诊断、试运行在 M1 到 M4 接入。
      </p>
    </div>
  )
}
