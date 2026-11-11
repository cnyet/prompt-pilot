import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'

const GROUPS: Array<{
  name: string
  note: string
  sample: string
  icon: IconName
  tint: string
  iconBox: string
  featured?: boolean
}> = [
  {
    name: '通用问答',
    note: '需要明确受众与答案粒度，避免泛泛而谈',
    sample: '解释一下什么是向量数据库，面向非技术读者。',
    icon: 'spark',
    tint: 'bg-tint-gold',
    iconBox: 'size-10',
  },
  {
    name: '内容创作',
    note: '强调语气、篇幅与禁用词，边界比风格更重要',
    sample: '帮我写一篇关于远程办公的产品博客。',
    icon: 'studio',
    tint: 'bg-tint-red',
    iconBox: 'size-16',
    featured: true,
  },
  {
    name: '代码生成',
    note: '锁定语言版本、依赖与错误处理方式',
    sample: '用 TypeScript 写一个解析 CSV 的函数，包含错误处理。',
    icon: 'terminal',
    tint: 'bg-tint-purple',
    iconBox: 'size-12',
  },
  {
    name: '数据分析',
    note: '规定口径、缺失值处理与结论的置信表述',
    sample: '分析这份月度销售数据，找出下降原因。',
    icon: 'eval',
    tint: 'bg-tint-green',
    iconBox: 'size-10',
  },
  {
    name: '客服对话',
    note: '必须写清越界话术与转人工条件',
    sample: '把这段客服话术改成更专业的版本。',
    icon: 'library',
    tint: 'bg-tint-gold',
    iconBox: 'size-9',
  },
  {
    name: '结构化抽取',
    note: '字段、类型、缺失与冲突优先级要逐条定义',
    sample: '从订单邮件里抽取订单号、金额和收货城市。',
    icon: 'template',
    tint: 'bg-tint-purple',
    iconBox: 'size-14',
  },
]

export default function TemplatesPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 py-8 lg:px-10">
      <p className="max-w-[68ch] text-balance text-body text-ink-muted">
        模板只调整字段权重与默认约束，不替代你的需求。选一个接近的场景，从它的示例开始。
      </p>

      <Section>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((group) => (
            <li
              key={group.name}
              className={cn(
                'flex flex-col gap-4 rounded-panel border border-line-subtle bg-surface p-5 transition-colors duration-150 hover:border-line-strong',
                group.featured && 'border-t-2 border-t-accent sm:col-span-2',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-control text-ink-muted',
                    group.tint,
                    group.iconBox,
                  )}
                >
                  <Icon
                    name={group.icon}
                    size={group.featured ? 24 : 17}
                  />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-body-lg font-medium text-ink">
                    {group.name}
                  </span>
                  <p className="text-caption text-ink-muted">{group.note}</p>
                </div>
              </div>
              <p className="rounded-control bg-bg-sunken px-3 py-2 text-caption text-ink-muted">
                例：{group.sample}
              </p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                <span className="text-caption text-ink-faint">
                  调整字段权重与默认约束
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconRight="chevron-right"
                  disabled
                  title="模板功能在后续版本开放"
                >
                  用它开始
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}