'use client'

import { cn } from '@/lib/utils'
import { diffLines } from './diff'

export function FieldSuggestionDiff({
  current,
  suggested,
}: {
  current: string
  suggested: string
}) {
  const lines = diffLines(current, suggested)

  return (
    <div className="border-t border-line-subtle bg-surface-inset px-3 py-3">
      <div className="flex flex-wrap items-center gap-4 text-caption text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-danger" />
          当前版本
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          AI 建议
        </span>
        <span>减号是当前版本，加号是 AI 建议</span>
      </div>
      <ol className="mt-2 max-h-64 overflow-auto rounded-control bg-surface py-1 font-mono text-caption">
        {lines.map((line, index) => (
          <li
            key={`${index}-${line.kind}`}
            className={cn(
              'whitespace-pre-wrap break-words px-3 py-0.5',
              line.kind === 'same' && 'text-ink-muted',
              line.kind === 'add' && 'bg-diff-add text-ink',
              line.kind === 'remove' && 'bg-diff-del text-ink',
            )}
          >
            <span
              aria-hidden
              className="mr-2 inline-block w-3 select-none text-ink-faint"
            >
              {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
            </span>
            {line.text.length > 0 ? line.text : ' '}
          </li>
        ))}
      </ol>
    </div>
  )
}
