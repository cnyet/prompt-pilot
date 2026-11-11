import Link from 'next/link'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SCENE_TEMPLATES } from '@/lib/templates'
import { cn } from '@/lib/utils'

export default function TemplatesPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 py-8 lg:px-10">
      <p className="max-w-[68ch] text-balance text-body text-ink-muted">
        模板只调整字段权重与默认约束，不替代你的需求。选一个接近的场景，从它的示例开始。
      </p>

      <Section>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCENE_TEMPLATES.map((group) => (
            <li
              key={group.id}
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
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/studio?template=${group.id}`}>
                    用它开始
                    <Icon name="chevron-right" size={14} />
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}