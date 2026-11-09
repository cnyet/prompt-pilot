export default function SettingsPage() {
  const hasKey = Boolean(process.env.ARK_API_KEY)
  const baseUrl =
    process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3'
  const modelGenerate =
    process.env.ARK_MODEL_GENERATE ?? 'doubao-seed-2-1-pro-260915'
  const modelEvaluate =
    process.env.ARK_MODEL_EVALUATE ?? 'doubao-seed-2-1-lite-260915'

  const rows = [
    { label: '提供方', value: '火山方舟（OpenAI 兼容端点）' },
    { label: '端点', value: baseUrl },
    { label: '生成模型', value: modelGenerate },
    { label: '评估模型', value: modelEvaluate },
    {
      label: '密钥',
      value: hasKey ? '已配置' : '未配置，当前为 L1 离线模板模式',
    },
  ]

  return (
    <div className="max-w-[760px] px-6 py-8">
      <h1 className="text-h2 font-medium">设置</h1>

      <section className="mt-6">
        <h2 className="text-h3 font-medium">模型</h2>
        <p className="mt-1 text-body text-ink-muted">
          密钥只从服务端环境变量读取，界面不显示明文。
        </p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-6 py-2.5">
              <dt className="w-20 shrink-0 text-label text-ink-muted">
                {row.label}
              </dt>
              <dd className="flex-1 break-all font-mono text-label">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-caption text-ink-faint">
          在 `.env.local` 里设置 `ARK_API_KEY` 后重启即可切到 L0 完整模式。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-h3 font-medium">数据</h2>
        <p className="mt-1 text-body text-ink-muted">
          全部数据只存在本机 SQLite，不上传任何第三方。
        </p>
        <p className="mt-3 text-caption text-ink-faint">
          导入、导出与从备份恢复在 M5 接入。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-h3 font-medium">快捷键</h2>
        <dl className="mt-3 grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-label">
          {[
            ['⌘Enter', '生成 / 运行'],
            ['⌘S', '保存版本'],
            ['⌘K', '命令面板'],
            ['Esc', '中断流'],
            ['\\', '折叠左栏'],
          ].map(([key, action]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-ink-muted">{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-caption text-ink-faint">
          快捷键在 M2 起逐步生效，当前仅有主题切换与左栏折叠可用。
        </p>
      </section>
    </div>
  )
}
