'use client'

import { useRef } from 'react'
import { t } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import { ratingKeyToValue } from '@/lib/ui/rating'
import { Icon } from './Icon'

const STARS = [1, 2, 3, 4, 5] as const

export interface RatingProps {
  value: number | null
  onChange: (value: number | null) => void
  readOnly?: boolean
  disabled?: boolean
  label?: string
}

/**
 * 评分（DESIGN.md Rating）。1 到 5 星，未评分显示「未评分」，不显示 0 星。
 *
 * 键盘：左右方向键按 `ratingKeyToValue` 调整，Home / End 跳到两端，
 * 数字键直接选中，Delete / Backspace 清除。选中态同时有文字标签，
 * 不靠颜色单独表达。
 */
export function Rating({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  label,
}: RatingProps) {
  const groupRef = useRef<HTMLDivElement>(null)
  const interactive = !readOnly && !disabled
  const hasValue = value !== null && value >= 1 && value <= 5

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return
    const next = ratingKeyToValue(value, event.key)
    if (next === undefined) return
    event.preventDefault()
    onChange(next)
    if (next !== null) {
      const buttons =
        groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      buttons?.[next - 1]?.focus()
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={label ?? t('rating.label')}
        aria-readonly={readOnly || undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center gap-0.5"
      >
        {STARS.map((star) => {
          const selected = hasValue && star <= value
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={t('rating.starAria', { value: star })}
              tabIndex={
                hasValue ? (value === star ? 0 : -1) : star === 1 ? 0 : -1
              }
              disabled={disabled}
              onClick={() => {
                if (interactive) onChange(star)
              }}
              className={cn(
                'inline-flex size-6 items-center justify-center rounded-control transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40',
                selected
                  ? 'text-accent'
                  : 'text-line-strong hover:text-accent',
              )}
            >
              <Icon
                name="star"
                size={18}
                className={selected ? 'fill-current' : undefined}
              />
            </button>
          )
        })}
      </div>
      <span className="text-caption text-ink-muted tabular-nums">
        {hasValue
          ? t('rating.starAria', { value })
          : t('common.unrated')}
      </span>
      {interactive && hasValue ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-chip text-caption text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t('rating.clear')}
        </button>
      ) : null}
    </div>
  )
}
