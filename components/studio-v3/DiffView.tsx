import type { ReactElement } from 'react'
import type { DiffResult, DiffRow, InlineSegment } from '@/lib/engine/diff'
import { cn } from '@/lib/utils'

export interface DiffViewProps {
  result: DiffResult
  view: 'inline' | 'side-by-side'
}

type Tone = 'same' | 'add' | 'remove'
type Highlight = 'add' | 'remove'

const ROW_BG: Record<Tone, string> = {
  same: '',
  add: 'bg-diff-add',
  remove: 'bg-diff-del',
}

const SEGMENT_BG: Record<Highlight, string> = {
  add: 'bg-diff-add-mark',
  remove: 'bg-diff-del-mark',
}

const MARK: Record<Tone, string> = {
  same: '',
  add: '+',
  remove: '-',
}

interface LineProps {
  tone: Tone
  text: string
  segments?: InlineSegment[]
  highlight?: Highlight
}

/**
 * 纯展示 diff 结果（FR-3.3）。不计算 diff，只消费 `DiffResult`。
 * 新增用 `+`、删除用 `-` 作为颜色之外的第二重编码；颜色只做底色。
 */
export function DiffView({ result, view }: DiffViewProps): ReactElement {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-control border border-line font-mono text-[0.875rem] leading-6 text-ink',
      )}
      data-view={view}
      data-degraded={result.degraded ? 'true' : undefined}
    >
      {view === 'inline' ? (
        <div>
          {result.rows.map((row, index) => (
            <InlineRow key={index} row={row} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-line">
          {result.rows.map((row, index) => (
            <SideBySideRow key={index} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

function InlineRow({ row }: { row: DiffRow }): ReactElement {
  if (row.kind === 'same') {
    return <DiffLine tone="same" text={row.before ?? ''} />
  }
  if (row.kind === 'add') {
    return (
      <DiffLine tone="add" text={row.after ?? ''} segments={row.afterSegments} highlight="add" />
    )
  }
  if (row.kind === 'remove') {
    return (
      <DiffLine
        tone="remove"
        text={row.before ?? ''}
        segments={row.beforeSegments}
        highlight="remove"
      />
    )
  }
  return (
    <>
      <DiffLine
        tone="remove"
        text={row.before ?? ''}
        segments={row.beforeSegments}
        highlight="remove"
      />
      <DiffLine
        tone="add"
        text={row.after ?? ''}
        segments={row.afterSegments}
        highlight="add"
      />
    </>
  )
}

function SideBySideRow({ row }: { row: DiffRow }): ReactElement {
  if (row.kind === 'same') {
    return (
      <>
        <DiffLine tone="same" text={row.before ?? ''} />
        <DiffLine tone="same" text={row.after ?? ''} />
      </>
    )
  }
  if (row.kind === 'add') {
    return (
      <>
        <EmptyCell />
        <DiffLine tone="add" text={row.after ?? ''} segments={row.afterSegments} highlight="add" />
      </>
    )
  }
  if (row.kind === 'remove') {
    return (
      <>
        <DiffLine
          tone="remove"
          text={row.before ?? ''}
          segments={row.beforeSegments}
          highlight="remove"
        />
        <EmptyCell />
      </>
    )
  }
  return (
    <>
      <DiffLine
        tone="remove"
        text={row.before ?? ''}
        segments={row.beforeSegments}
        highlight="remove"
      />
      <DiffLine
        tone="add"
        text={row.after ?? ''}
        segments={row.afterSegments}
        highlight="add"
      />
    </>
  )
}

function DiffLine({ tone, text, segments, highlight }: LineProps): ReactElement {
  return (
    <div className={cn('flex min-h-6 min-w-0 gap-2 px-2 py-0.5', ROW_BG[tone])}>
      <span className="w-3 shrink-0 select-none text-ink-faint">{MARK[tone]}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">
        {segments !== undefined && highlight !== undefined ? (
          <Segments segments={segments} highlight={highlight} />
        ) : (
          text
        )}
      </span>
    </div>
  )
}

function Segments({
  segments,
  highlight,
}: {
  segments: InlineSegment[]
  highlight: Highlight
}): ReactElement {
  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={segment.kind === highlight ? SEGMENT_BG[highlight] : undefined}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
}

function EmptyCell(): ReactElement {
  return <div className="min-h-6 bg-bg-sunken" aria-hidden="true" />
}
