import {
  getCostSummary,
  type CostBucket,
  type CostSummary,
} from '@/lib/llm/ledger'

export const dynamic = 'force-dynamic'

const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

function hasKnownUsage(bucket: CostBucket): boolean {
  return bucket.calls > 0 && bucket.unknownUsageCalls < bucket.calls
}

function hasKnownCost(bucket: CostBucket): boolean {
  return bucket.calls > 0 && bucket.unknownCostCalls < bucket.calls
}

function usageCell(bucket: CostBucket, value: number): string {
  if (!hasKnownUsage(bucket)) {
    return '未知'
  }
  return `${formatNumber(value)}${bucket.unknownUsageCalls > 0 ? ' *' : ''}`
}

function cachedCell(bucket: CostBucket): string {
  if (bucket.cachedKnownCalls === 0) {
    return '未知'
  }
  const tokens = formatNumber(bucket.cachedTokens)
  const rate =
    bucket.cacheHitRate === null
      ? ''
      : `（${bucket.cacheHitRate.toFixed(1)}%）`
  return `${tokens}${rate}${bucket.cachedKnownCalls < bucket.calls ? ' *' : ''}`
}

function reasoningCell(bucket: CostBucket): string {
  if (bucket.reasoningKnownCalls === 0) {
    return '未知'
  }
  return `${formatNumber(bucket.reasoningTokens)}${
    bucket.reasoningKnownCalls < bucket.calls ? ' *' : ''
  }`
}

function costCell(bucket: CostBucket): string {
  if (!hasKnownCost(bucket)) {
    return '未知'
  }
  return `¥${cnyFormatter.format(bucket.costCny)}${
    bucket.unknownCostCalls > 0 ? ' *' : ''
  }`
}

function statusLine(summary: CostSummary): string {
  const { total } = summary
  const parts = [
    `成功 ${total.succeededCalls} 次`,
    `失败 ${total.failedCalls} 次`,
    `取消 ${total.canceledCalls} 次`,
    `中断 ${total.interruptedCalls} 次`,
  ]
  return parts.join('，')
}

function BucketTable({
  buckets,
  firstHeader,
}: {
  buckets: readonly CostBucket[]
  firstHeader: string
}) {
  return (
    <div className="mt-3 overflow-x-auto border-y border-line">
      <table className="w-full min-w-[680px] text-label">
        <thead>
          <tr className="text-left text-caption text-ink-muted">
            <th scope="col" className="py-2 pr-4 font-normal">
              {firstHeader}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              调用
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              输入 token
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              输出 token
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              缓存
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              思考 token
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              金额
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {buckets.map((bucket) => (
            <tr key={bucket.key} className="tnum">
              <td className="py-2 pr-4">{bucket.label}</td>
              <td className="py-2 pr-4 text-right">{bucket.calls}</td>
              <td className="py-2 pr-4 text-right">
                {usageCell(bucket, bucket.tokensIn)}
              </td>
              <td className="py-2 pr-4 text-right">
                {usageCell(bucket, bucket.tokensOut)}
              </td>
              <td className="py-2 pr-4 text-right">{cachedCell(bucket)}</td>
              <td className="py-2 pr-4 text-right">
                {reasoningCell(bucket)}
              </td>
              <td className="py-2 text-right">{costCell(bucket)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function SettingsPage() {
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

  const summary = await getCostSummary()
  const total = summary?.total
  const unknownUsage = total?.unknownUsageCalls ?? 0
  const unknownCost = total?.unknownCostCalls ?? 0

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
        <h2 className="text-h3 font-medium">成本</h2>
        <p className="mt-1 text-body text-ink-muted">
          数据来自本机调用账本，按阶段与模型汇总 token、缓存命中与人民币金额。
        </p>

        {summary === null ? (
          <p className="mt-4 border-y border-line py-3 text-label text-ink-muted">
            数据库暂不可用，成本数据暂时无法读取。
          </p>
        ) : total === undefined || total.calls === 0 ? (
          <p className="mt-4 border-y border-line py-3 text-label text-ink-muted">
            还没有调用记录。生成、评估或优化后，这里会显示成本汇总。
          </p>
        ) : (
          <>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-panel border border-line bg-surface p-4">
                <dt className="text-caption text-ink-muted">调用次数</dt>
                <dd className="mt-1 font-mono text-h3 tnum">
                  {formatNumber(total.calls)}
                </dd>
              </div>
              <div className="rounded-panel border border-line bg-surface p-4">
                <dt className="text-caption text-ink-muted">总金额</dt>
                <dd className="mt-1 font-mono text-h3 tnum">
                  {hasKnownCost(total)
                    ? `¥${cnyFormatter.format(total.costCny)}`
                    : '未知'}
                </dd>
              </div>
              <div className="rounded-panel border border-line bg-surface p-4">
                <dt className="text-caption text-ink-muted">输入与输出 token</dt>
                <dd className="mt-1 font-mono text-label tnum">
                  {hasKnownUsage(total)
                    ? `${formatNumber(total.tokensIn)} / ${formatNumber(
                        total.tokensOut,
                      )}`
                    : '未知'}
                </dd>
              </div>
              <div className="rounded-panel border border-line bg-surface p-4">
                <dt className="text-caption text-ink-muted">缓存命中率</dt>
                <dd className="mt-1 font-mono text-h3 tnum">
                  {total.cacheHitRate === null
                    ? '未知'
                    : `${total.cacheHitRate.toFixed(1)}%`}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-caption text-ink-faint tnum">
              {statusLine(summary)}
            </p>

            <h3 className="mt-6 text-label font-medium">按阶段</h3>
            <BucketTable buckets={summary.byStage} firstHeader="阶段" />

            <h3 className="mt-6 text-label font-medium">按模型</h3>
            <BucketTable buckets={summary.byModel} firstHeader="模型" />

            {unknownUsage > 0 || unknownCost > 0 ? (
              <p className="mt-3 text-caption text-ink-faint">
                带 * 的数字只统计已拿到数据的调用。共有 {unknownUsage}{' '}
                次调用未拿到用量，{unknownCost}{' '}
                次调用未拿到价格，这些调用不按 0 计入合计。缓存命中率只统计同时拿到输入
                token 与缓存明细的调用。
              </p>
            ) : null}

            <p className="mt-3 text-caption text-ink-faint">
              单价默认取代码内价格表，可在 AppSetting 的 `llm.pricing.cny`
              中按模型覆盖，单位是元每百万 token。取不到价格时显示「未知」。
            </p>
          </>
        )}
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
