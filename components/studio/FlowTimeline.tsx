'use client'

import { cn } from '@/lib/utils'

/**
 * 流程时间轴（编辑部 bento，ADR 0004）。
 *
 * 需求 → 生成 → 试运行 → 评估 → 优化 五个阶段横排在页面顶部，
 * 当前阶段赤陶块加 now 脉冲点，诊断 error 数进当前阶段徽标。
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
  className,
}: FlowTimelineProps) {
  const currentIndex = STAGES.findIndex((item) => item.id === stage)

  return (
    <nav
      aria-label="流程阶段"
      className={cn(
        'flex items-stretch gap-0 overflow-hidden rounded-panel border border-line bg-surface',
        className,
      )}
    >
      {STAGES.map((item, index) => {
        const done = currentIndex > index
        const current = currentIndex === index
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
              'flex min-w-0 flex-1 items-center gap-2 px-4 py-3',
              index > 0 && 'border-l border-line-subtle',
              done && 'bg-bg-sunken',
              current && 'bg-accent-subtle',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'numeral shrink-0 text-label',
                done ? 'text-ink-faint' : current ? 'text-accent' : 'text-ink-faint',
              )}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <span
              className={cn(
                'truncate text-label',
                done
                  ? 'text-ink-muted'
                  : current
                    ? 'font-medium text-ink'
                    : 'text-ink-faint',
              )}
            >
              {item.label}
            </span>
            {progressText ? (
              <span className="text-caption text-ink-muted tnum">
                {progressText}
              </span>
            ) : null}
            {current && errorCount > 0 ? (
              <span
                className="ml-auto shrink-0 rounded-chip bg-diff-del px-1.5 py-0.5 text-caption text-danger tnum"
                title="诊断有错误级问题"
              >
                {errorCount}
              </span>
            ) : null}
            {current ? (
              <span
                aria-hidden
                className={cn(
                  'ml-auto size-1.5 shrink-0 rounded-full bg-accent',
                  errorCount > 0 && 'hidden',
                  'now-pulse',
                )}
              />
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}
