'use client'

import { useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { Rating } from '@/components/ui/Rating'
import type { RecordSummaryDto } from '@/components/studio-v3/api'
import { t, type MessageKey } from '@/lib/i18n/zh'
import {
  formatRecordCost,
  formatRecordModel,
  formatRecordTime,
  isValidRecordTitle,
  recordExcerpt,
  toProcessMode,
  toTargetType,
} from '@/lib/library/format'
import type { LibraryTargetType } from '@/lib/library/query'
import type { MetaPending } from './useRecordMeta'
import { cn } from '@/lib/utils'

const MODE_KEYS: Record<'generate' | 'optimize', MessageKey> = {
  generate: 'library.filter.generate',
  optimize: 'library.filter.optimize',
}

const TARGET_KEYS: Record<LibraryTargetType, MessageKey> = {
  text: 'library.target.text',
  image: 'library.target.image',
  video: 'library.target.video',
}

export interface RecordRowProps {
  record: RecordSummaryDto
  pending: MetaPending
  selected?: boolean
  onOpen: (id: string) => void
  onFavorite: (record: RecordSummaryDto) => void
  onRating: (record: RecordSummaryDto, value: number | null) => void
  onRename: (record: RecordSummaryDto, title: string) => Promise<boolean>
}

/**
 * 提示词库记录行（DESIGN.md Library Record Row）。
 *
 * 标题与摘要截断不换行，右侧是模式、目标类型、评分、收藏、时间、模型与费用。
 * 收藏与评分只对完成或已中断的记录开放；在途写不原生禁用控件，仅以
 * `aria-busy` 与读屏文案提示，避免方向键调整评分时焦点丢失。
 */
export function RecordRow({
  record,
  pending,
  selected = false,
  onOpen,
  onFavorite,
  onRating,
  onRename,
}: RecordRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(record.title)
  const [saving, setSaving] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const canRate = record.status === 'completed' || record.status === 'canceled'
  const busy = pending.favorite || pending.rating
  const mode = toProcessMode(record.mode)
  const targetType = toTargetType(record.targetType)

  function startEditing() {
    setDraft(record.title)
    setRenameError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setRenameError(null)
  }

  async function commitRename() {
    const title = draft.trim()
    if (!isValidRecordTitle(title)) {
      setRenameError(t('library.rename.invalid'))
      return
    }
    setSaving(true)
    setRenameError(null)
    const saved = await onRename(record, title)
    setSaving(false)
    if (saved) {
      setEditing(false)
    } else {
      setRenameError(t('library.rename.failed'))
    }
  }

  return (
    <li
      aria-current={selected ? 'true' : undefined}
      aria-busy={busy || undefined}
      className={cn(
        'min-h-14 px-4 py-3 transition-colors hover:bg-surface-raised',
        selected && 'bg-accent-subtle',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitRename()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelEditing()
                    }
                  }}
                  aria-label={t('library.rename')}
                  invalid={Boolean(renameError)}
                  disabled={saving}
                  autoFocus
                  className="h-8 max-w-xs text-label"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void commitRename()}
                  disabled={saving}
                >
                  {saving ? t('library.rename.saving') : t('library.rename.save')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  {t('library.rename.cancel')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(record.id)}
                className="block max-w-full truncate rounded-chip text-left text-label font-medium text-ink transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {record.title}
              </button>
            )}
            <p className="truncate text-caption text-ink-muted">
              {recordExcerpt(record.sourceInput)}
            </p>
            {renameError ? (
              <p role="alert" className="text-caption text-danger">
                {renameError}
              </p>
            ) : null}
          </div>
          {!editing ? (
            <IconButton
              icon="studio"
              size="sm"
              label={t('library.rename')}
              onClick={startEditing}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <Chip>{t(MODE_KEYS[mode])}</Chip>
          <Chip>{t(TARGET_KEYS[targetType])}</Chip>
          <Rating
            value={record.rating}
            onChange={(value) => onRating(record, value)}
            disabled={!canRate}
            label={`${record.title} ${t('rating.label')}`}
          />
          <button
            type="button"
            aria-label={
              record.favorite ? t('library.unfavorite') : t('library.favorite')
            }
            aria-pressed={record.favorite}
            disabled={!canRate}
            onClick={() => onFavorite(record)}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-control transition-colors duration-150 hover:bg-surface-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40',
              record.favorite ? 'text-accent' : 'text-ink-muted',
            )}
          >
            <Icon
              name="bookmark"
              size={16}
              className={record.favorite ? 'fill-current' : undefined}
            />
          </button>
          <span className="text-caption text-ink-faint tabular-nums">
            <span className="sr-only">{t('library.updatedAt')}：</span>
            {formatRecordTime(record.updatedAt)}
          </span>
          <span className="text-caption text-ink-faint">
            <span className="sr-only">{t('library.model')}：</span>
            {formatRecordModel(record.modelId)}
          </span>
          <span className="text-caption text-ink-faint tabular-nums">
            <span className="sr-only">{t('library.cost')}：</span>
            {formatRecordCost(record.costCny)}
          </span>
        </div>
      </div>
      <span aria-live="polite" className="sr-only">
        {busy ? t('library.row.pending') : ''}
      </span>
    </li>
  )
}
