import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/zh'

const MAX_NOTES = 3

export interface ChangeNotesProps {
  notes: readonly string[]
}

/**
 * 改动说明（FR-3.4 / FR-4）：最多 3 条，label 字号，不进入提示词正文。
 * 没有说明时整块隐藏，不占位。
 */
export function ChangeNotes({ notes }: ChangeNotesProps): ReactElement | null {
  if (notes.length === 0) return null

  const visible = notes.slice(0, MAX_NOTES)

  return (
    <div className="mt-4 max-w-[68ch] border-t border-line-subtle pt-3">
      <h3 className="text-label font-medium text-ink-muted">
        {t('studio.notes.label')}
      </h3>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-label text-ink-muted">
        {visible.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ol>
    </div>
  )
}
