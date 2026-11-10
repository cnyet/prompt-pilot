import { PageHeader, Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/components/ui/Icon'

const GROUPS: Array<{ name: string; note: string; icon: IconName }> = [
  {
    name: '通用问答',
    note: '需要明确受众与答案粒度，避免泛泛而谈',
    icon: 'terminal',
  },
  {
    name: '内容创作',
    note: '强调语气、篇幅与禁用词，边界比风格更重要',
    icon: 'spark',
  },
  {
    name: '代码生成',
    note: '锁定语言版本、依赖与错误处理方式',
    icon: 'terminal',
  },
  {
    name: '数据分析',
    note: '规定口径、缺失值处理与结论的置信表述',
    icon: 'eval',
  },
  {
    name: '客服对话',
    note: '必须写清越界话术与转人工条件',
    icon: 'library',
  },
  {
    name: '结构化抽取',
    note: '字段、类型、缺失与冲突优先级要逐条定义',
    icon: 'template',
  },
]

export default function TemplatesPage() {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-10 px-6 py-8 lg:px-10">
      <PageHeader
        title="模板"
        description="模板只调整字段权重与默认约束，不替代你的需求。"
      />

      <Section>
        <ul className="divide-y divide-line-subtle border-t border-line-subtle">
          {GROUPS.map((group) => (
            <li
              key={group.name}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 transition-colors hover:bg-bg-sunken"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-bg-sunken text-ink-muted">
                <Icon name={group.icon} size={15} />
              </span>
              <span className="w-28 shrink-0 text-body font-medium text-ink">
                {group.name}
              </span>
              <span className="min-w-0 flex-1 text-body text-ink-muted">
                {group.note}
              </span>
              <Button size="sm" variant="quiet" disabled title="后续版本开放">
                用这个新建
              </Button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
