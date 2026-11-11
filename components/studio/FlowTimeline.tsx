'use client'

import { cn } from '@/lib/utils'

/**
 * 流程时间轴（DESIGN.md 5.9）。
 *
 * 需求 → 生成 → 试运行 → 评估 → 优化 五个阶段横排在页面顶部：
 * 已过阶段用凹陷底，当前阶段金色底加 glow 与 now 脉冲点，
 * 未到阶段用虚线描边。诊断 error 数进当前阶段徽标。
 * 只动 opacity（now-pulse），reduced-motion 下静止。
 */

export type FlowStage =
  | 'requirement'
  | 'generate'
  | 'trial'
  | 'eval'
  | 'optimize'

export interface FlowTimelineProps {
  /** 当前所在阶段；评估与优化在工作台内尚未发生，由调用方判定后传入 */
  stage: FlowStage
  /** 诊断 error 数，进当前阶段徽标；0 表示无 */
  errorCount: number
  /** 生成进度：已填充字段数（含流式 pending），仅在生成阶段显示 */
  filledFields?: number
  totalFields?: number
  /** 各阶段的补充说明，如「6 个假设」「已完成 8 字段」；窄屏隐藏。 */
  details?: Partial<Record<FlowStage, string>>
  className?: string
}

const STAGES: ReadonlyArray<{
  id: FlowStage
  label: string
}> = [
  { id: 'requirement', label: '需求' },
  { id: 'generate', label: '生成' },
  { id: 'trial', label: '试运行' },
  { id: 'eval', label: '评估' },
  { id: 'optimize', label: '优化' },
]

export function FlowTimeline({
  stage,
  errorCount,
  filledFields = 0,
  totalFields = 0,
  details,
  className,
}: FlowTimelineProps) {
  const currentIndex = STAGES.findIndex((item) => item.id === stage)

  return (
    <nav
      aria-label="流程阶段"
      className={cn(
        'flex items-stretch gap-0 rounded-panel border border-line bg-surface shadow-sm',
        className,
      )}
    >
      {STAGES.map((item, index) => {
        const done = currentIndex > index
        const current = currentIndex === index
        const future = !done && !current
        const progressText =
          current &&
          item.id === 'generate' &&
          totalFields > 0 &&
          filledFields > 0
            ? `${filledFields} / ${totalFields}`
            : null
        return (
          <div
            key={item.id}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5 py-2.5 sm:px-4 sm:py-3',
              'first:rounded-l-panel last:rounded-r-panel',
              index > 0 && 'border-l border-line-subtle',
              done && 'bg-bg-sunken',
              current && 'bg-accent text-on-accent shadow-glow',
              future && 'border-l border-dashed border-line',
            )}
          >
            <div className="flex min-w-0 items-center justify-center gap-1 sm:justify-start sm:gap-2">
            <span
              aria-hidden
              className={cn(
                'numeral hidden shrink-0 text-label sm:inline',
                current
                  ? 'text-on-accent/80'
                  : done
                    ? 'text-ink-faint'
                    : 'text-ink-faint',
              )}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <span
              className={cn(
                'truncate text-caption sm:text-label',
                current
                  ? 'font-medium text-on-accent'
                  : done
                    ? 'text-ink-muted'
                    : 'text-ink-faint',
              )}
            >
              {item.label}
            </span>
            {progressText ? (
              <span className="hidden text-caption text-on-accent/80 tnum sm:inline">
                {progressText}
              </span>
            ) : null}
            {current && errorCount > 0 ? (
              <span
                className="ml-auto shrink-0 rounded-chip bg-tint-red px-1.5 py-0.5 text-caption text-danger tnum"
                title="诊断有错误级问题"
              >
                {errorCount}
              </span>
            ) : null}
            {current && errorCount === 0 ? (
              <span
                aria-hidden
                className="ml-auto hidden size-1.5 shrink-0 rounded-full bg-on-accent now-pulse sm:inline-block"
              />
            ) : null}
            </div>
            {details?.[item.id] ? (
              <span
                className={cn(
                  'hidden truncate text-caption sm:block',
                  current ? 'text-on-accent/80' : 'text-ink-faint',
                )}
              >
                {details[item.id]}
              </span>
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}
