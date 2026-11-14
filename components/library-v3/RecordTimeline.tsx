import { Chip, type ChipTone } from '@/components/ui/Chip'
import type { IterationDto } from '@/components/studio-v3/api'
import { t, type MessageKey } from '@/lib/i18n/zh'
import { formatRecordTime } from '@/lib/library/format'

const KIND_KEYS: Readonly<Record<string, MessageKey>> = {
  generate: 'studio.iteration.kind.generate',
  optimize: 'studio.iteration.kind.optimize',
  repair: 'studio.iteration.kind.repair',
}

const STATUS: Readonly<
  Record<string, { key: MessageKey; tone: ChipTone }>
> = {
  running: { key: 'library.timeline.status.running', tone: 'info' },
  completed: { key: 'library.timeline.status.completed', tone: 'success' },
  canceled: { key: 'library.timeline.status.canceled', tone: 'warning' },
  failed: { key: 'library.timeline.status.failed', tone: 'error' },
}

const UNKNOWN_STATUS = {
  key: 'common.unknown' as MessageKey,
  tone: 'default' as ChipTone,
}

export interface RecordTimelineProps {
  iterations: readonly IterationDto[]
}

/**
 * 记录内的迭代时间线（FR-4.3 / FR-6.7）。
 *
 * 按 seq 升序展示每一轮：序号、类型、状态、时间与优化要求。失败与中断
 * 用带圆点的语义 chip 加文字表达，不靠颜色单独传达。
 */
export function RecordTimeline({ iterations }: RecordTimelineProps) {
  if (iterations.length === 0) {
    return (
      <p className="text-caption text-ink-muted">{t('library.timeline.empty')}</p>
    )
  }

  const ordered = [...iterations].sort((a, b) => a.seq - b.seq)

  return (
    <ol className="flex flex-col gap-2">
      {ordered.map((iteration) => {
        const kindKey = KIND_KEYS[iteration.kind]
        const status = STATUS[iteration.status] ?? UNKNOWN_STATUS
        return (
          <li
            key={iteration.id}
            className="rounded-control border border-line-subtle bg-surface-inset px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
              <span className="font-medium text-ink tabular-nums">
                {t('studio.compare.iteration', { seq: iteration.seq })}
              </span>
              <Chip>{kindKey ? t(kindKey) : t('common.unknown')}</Chip>
              <Chip tone={status.tone}>{t(status.key)}</Chip>
              <time className="text-ink-faint tabular-nums">
                {formatRecordTime(iteration.createdAt)}
              </time>
            </div>
            {iteration.instruction ? (
              <p className="mt-1 text-caption text-ink-muted">
                {t('library.timeline.instruction', {
                  instruction: iteration.instruction,
                })}
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
