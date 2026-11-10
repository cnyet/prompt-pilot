import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader, Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { MeterBar } from '@/components/ui/MeterBar'
import { StatTile } from '@/components/ui/StatTile'

const STEPS: ReadonlyArray<{ title: string; detail: string; tint: string }> = [
  {
    title: '选一组固定样本',
    detail: '同一批输入重复跑，结果才可比。样本数量建议 5 到 20 条。',
    tint: 'bg-tint-coral',
  },
  {
    title: '对照成功标准逐条判定',
    detail: '判定的是真实输出，不是提示词文本。每条标准给出通过或不通过。',
    tint: 'bg-tint-butter',
  },
  {
    title: '与第一版比胜率',
    detail: '拿基线 v0 当对照组盲评，得出「比原来好多少」这个可引用的数字。',
    tint: 'bg-tint-sage',
  },
]

const DIMENSIONS = ['判定口径', '事实性', '结构完整', '语气匹配'] as const

export default function EvalPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-10 px-6 py-8 lg:px-10">
      <PageHeader
        title="评估"
        description="评估跑的是输出，不是提示词文本：用固定样本跑出真实结果，对照成功标准逐条判定。"
        actions={
          <Button
            variant="primary"
            size="md"
            icon="plus"
            disabled
            title="后续版本开放"
          >
            新建评估
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="rounded-panel border border-line-subtle bg-surface">
          <EmptyState
            icon="eval"
            title="还没有评估"
            hint="用固定样本跑出真实结果，对照成功标准逐条判定，再和你的第一版对比胜率。每次约 0.002 元。"
          />
        </div>

        <div className="flex flex-col gap-4 rounded-panel border border-line-subtle bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-h3 font-medium text-ink">结果会长这样</h2>
            <span className="text-caption text-ink-faint">版式示意 · 暂无数据</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile label="样本数" value="—" hint="固定输入条数" />
            <StatTile label="通过率" value="—" hint="逐条判定后汇总" />
          </div>

          <MeterBar label="与基线 v0 相比的胜率" value={0} empty />
          <div className="flex flex-col gap-3 pt-1">
            {DIMENSIONS.map((dimension) => (
              <MeterBar
                key={dimension}
                label={dimension}
                value={0}
                empty
                tone="muted"
              />
            ))}
          </div>
          <p className="text-caption text-ink-faint">
            数值全部留空。评估尚未接入，这里只说明结果页的版式，不预填任何示例数字。
          </p>
        </div>
      </div>

      <Section
        title="一次评估要经过三步"
        description="现在还不能新建，先把流程摆在这里，后续版本按这个顺序开放。"
      >
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-panel border border-line-subtle bg-surface p-4"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-caption font-medium text-ink ${step.tint}`}
                >
                  {index + 1}
                </span>
                <span className="text-label font-medium text-ink">
                  {step.title}
                </span>
              </span>
              <span className="text-caption leading-relaxed text-ink-muted">
                {step.detail}
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
