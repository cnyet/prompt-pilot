import { LlmSettingsForm } from '@/components/settings/LlmSettingsForm'
import { SettingsNav } from '@/components/settings/SettingsNav'
import { PageHeader, Section } from '@/components/ui/Section'
import { getLlmSettingsView } from '@/lib/settings/store'
import { cn } from '@/lib/utils'
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
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-label">
        <thead>
          <tr className="border-b border-line-subtle text-left text-caption text-ink-faint">
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
        <tbody className="divide-y divide-line-subtle">
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
  const llmSettings = await getLlmSettingsView()
  const summary = await getCostSummary()
  const total = summary?.total
  const unknownUsage = total?.unknownUsageCalls ?? 0
  const unknownCost = total?.unknownCostCalls ?? 0

  return (
    <div className="mx-auto flex w-full max-w-[1080px] gap-10 px-6 py-8 lg:px-10">
      <SettingsNav />
      <div className="flex min-w-0 flex-1 flex-col gap-12">
      <PageHeader
        title="设置"
        description="模型接入、成本汇总与本机数据都在这一个页面里。"
      />

      <div id="settings-model" className="scroll-mt-8">
      <Section
        title="模型"
        description="设置页写入的值优先于环境变量。密钥只存在本机数据库，界面不显示明文，也不会回传浏览器。"
      >
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel bg-bg-sunken px-4 py-3">
          <span className="inline-flex items-center gap-2 text-label font-medium text-ink">
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                llmSettings.apiKey.configured ? 'bg-success' : 'bg-warning',
              )}
            />
            {llmSettings.apiKey.configured ? '已接入真实模型' : '离线模板模式'}
          </span>
          <span aria-hidden className="text-ink-faint">·</span>
          <span className="text-caption text-ink-muted tnum">
            {llmSettings.modelGenerate.value}
          </span>
          <span aria-hidden className="text-ink-faint">·</span>
          <span className="text-caption text-ink-faint">
            {llmSettings.baseUrl.value}
          </span>
        </div>
        <LlmSettingsForm initial={llmSettings} />
      </Section>
      </div>

      <div id="settings-cost" className="scroll-mt-8">
      <Section
        title="成本"
        description="数据来自本机调用账本，按阶段与模型汇总 token、缓存命中与人民币金额。"
      >

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
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-panel bg-bg-sunken px-4 py-3">
                <dt className="text-caption text-ink-muted">调用次数</dt>
                <dd className="mt-1 font-mono text-h3 tnum">
                  {formatNumber(total.calls)}
                </dd>
              </div>
              <div className="rounded-panel bg-bg-sunken px-4 py-3">
                <dt className="text-caption text-ink-muted">总金额</dt>
                <dd className="mt-1 font-mono text-h3 tnum">
                  {hasKnownCost(total)
                    ? `¥${cnyFormatter.format(total.costCny)}`
                    : '未知'}
                </dd>
              </div>
              <div className="rounded-panel bg-bg-sunken px-4 py-3">
                <dt className="text-caption text-ink-muted">输入与输出 token</dt>
                <dd className="mt-1 font-mono text-label tnum">
                  {hasKnownUsage(total)
                    ? `${formatNumber(total.tokensIn)} / ${formatNumber(
                        total.tokensOut,
                      )}`
                    : '未知'}
                </dd>
              </div>
              <div className="rounded-panel bg-bg-sunken px-4 py-3">
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

            <h3 className="mt-8 text-label font-medium text-ink">按阶段</h3>
            <BucketTable buckets={summary.byStage} firstHeader="阶段" />

            <h3 className="mt-8 text-label font-medium text-ink">按模型</h3>
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
      </Section>

      </div>

      <div id="settings-data" className="scroll-mt-8">
      <Section title="数据" description="全部数据只存在本机 SQLite，不上传任何第三方。">
        <p className="text-caption text-ink-faint">
          导入、导出与从备份恢复在 M5 接入。
        </p>
      </Section>

      </div>

      <div id="settings-shortcuts" className="scroll-mt-8">
      <Section title="快捷键">
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-label">
          {[
            ['⌘Enter', '生成 / 运行'],
            ['⌘S', '保存新版本'],
            ['⌘K', '命令面板'],
            ['⌘Z / ⌘⇧Z', '撤销 / 重做'],
            ['⌥1 / ⌥2 / ⌥3', '结构化 / 渲染文本 / JSON'],
            ['Esc', '中断生成 / 关闭浮层'],
            ['\\', '折叠侧栏'],
          ].map(([key, action]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-ink-muted">{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-caption text-ink-faint">
          在输入框里按 `\` 不会触发折叠，避免打断写作。`⌥1` 到 `⌥3` 只在工作台生效。
        </p>
      </Section>
      </div>
      </div>
    </div>
  )
}
