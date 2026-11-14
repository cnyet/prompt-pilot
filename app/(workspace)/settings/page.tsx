import { BudgetSetting } from '@/components/settings/BudgetSetting'
import { CostBucketTable } from '@/components/settings/CostBucketTable'
import { CostTrend } from '@/components/settings/CostTrend'
import { LlmSettingsForm } from '@/components/settings/LlmSettingsForm'
import { SettingsNav } from '@/components/settings/SettingsNav'
import { Section } from '@/components/ui/Section'
import { formatBudgetUsage } from '@/lib/budget'
import { modelDisplayLabel } from '@/lib/llm/registry'
import { getV3Stats } from '@/lib/llm/stats-v3'
import { getLlmSettingsView } from '@/lib/settings/store'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

function formatCny(value: number | null): string {
  return value === null ? '—' : `¥${cnyFormatter.format(value)}`
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-panel bg-bg-sunken px-4 py-3">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="numeral mt-1 break-words text-h2 font-semibold tnum">
        {value}
      </dd>
    </div>
  )
}

export default async function SettingsPage() {
  const [llmSettings, stats] = await Promise.all([
    getLlmSettingsView(),
    getV3Stats(),
  ])
  const month = stats?.month
  const byModel =
    stats?.byModel.map((bucket) => ({
      ...bucket,
      label: modelDisplayLabel(bucket.label),
    })) ?? []

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 lg:flex-row lg:gap-10 lg:px-10">
      <SettingsNav />
      <div className="flex min-w-0 flex-1 flex-col gap-12">
        <p className="max-w-[68ch] text-balance text-body text-ink-muted">
          模型接入与成本汇总都在这一个页面里。
        </p>

        <div id="settings-model" className="scroll-mt-[7.5rem] lg:scroll-mt-8">
          <Section
            title="模型"
            description="设置页写入的值优先于环境变量。密钥只存在本机数据库，界面不显示明文，也不会回传浏览器。"
          >
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-line bg-surface-raised px-5 py-4">
              <span className="inline-flex items-center gap-2 text-body-lg font-medium text-ink">
                <span
                  aria-hidden
                  className={cn(
                    'size-2 rounded-full',
                    llmSettings.apiKey.configured ? 'bg-success' : 'bg-warning',
                  )}
                />
                {llmSettings.apiKey.configured ? '已接入真实模型' : '未配置模型'}
              </span>
              <span aria-hidden className="hidden text-ink-faint sm:inline">
                ·
              </span>
              <span className="text-caption text-ink-muted tnum">
                生成 {modelDisplayLabel(llmSettings.modelGenerate.value)}
              </span>
              <span aria-hidden className="hidden text-ink-faint sm:inline">
                ·
              </span>
              <span className="text-caption text-ink-muted tnum">
                优化 {modelDisplayLabel(llmSettings.modelOptimize.value)}
              </span>
              <span aria-hidden className="hidden text-ink-faint sm:inline">
                ·
              </span>
              <span className="truncate text-caption text-ink-faint">
                {llmSettings.baseUrl.value}
              </span>
            </div>
            <LlmSettingsForm initial={llmSettings} />
          </Section>
        </div>

        <div id="settings-cost" className="scroll-mt-[7.5rem] lg:scroll-mt-8">
          <Section
            title="成本"
            description="数据来自本机调用账本，按月汇总生成、优化与修复三个阶段的人民币金额，按上海时区切月。"
          >
            {stats === null || month === undefined ? (
              <p className="mt-4 border-y border-line py-3 text-label text-ink-muted">
                数据库暂不可用，成本数据暂时无法读取。
              </p>
            ) : (
              <>
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="本月费用" value={formatCny(month.costCny)} />
                  <Kpi label="本月调用" value={formatNumber(month.calls)} />
                  <Kpi
                    label="平均单次费用"
                    value={formatCny(month.averageCostCny)}
                  />
                  <Kpi
                    label="预算使用率"
                    value={formatBudgetUsage(month.budgetCny, month.budgetUsage)}
                  />
                </dl>

                {month.unknownCostCalls > 0 ? (
                  <p className="mt-3 text-caption text-ink-faint tnum">
                    有 {month.unknownCostCalls} 次调用未拿到价格，未按 0
                    计入合计。
                  </p>
                ) : null}

                <BudgetSetting
                  initialBudgetCny={month.budgetCny}
                  usage={month.budgetUsage}
                />

                {month.calls === 0 ? (
                  <p className="mt-6 border-y border-line py-3 text-label text-ink-muted">
                    完成一次生成后，这里会出现调用与成本明细。
                  </p>
                ) : (
                  <>
                    <CostTrend days={stats.daily} />

                    <h3 className="mt-8 text-label font-medium text-ink">
                      按阶段
                    </h3>
                    <CostBucketTable
                      buckets={stats.byStage}
                      firstHeader="阶段"
                    />

                    <h3 className="mt-8 text-label font-medium text-ink">
                      按模型
                    </h3>
                    <CostBucketTable buckets={byModel} firstHeader="模型" />
                  </>
                )}

                <p className="mt-3 text-caption text-ink-faint">
                  单价默认取代码内价格表，可在 AppSetting 的 `llm.pricing.cny`
                  中按模型覆盖，单位是元每百万 token。取不到价格时显示「—」，不按
                  0 计入合计。
                </p>
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
