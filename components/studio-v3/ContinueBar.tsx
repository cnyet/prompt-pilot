'use client'

import { useId, useState, type KeyboardEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { Textarea } from '@/components/ui/Input'
import { t } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import { OPTIMIZE_INSTRUCTION_LIMIT } from './composer'

/** 继续优化快捷 chip（FR-4.2）：只把对应中文填入输入框，不直接提交。 */
export const CONTINUE_CHIPS = [
  { id: 'concise', labelKey: 'studio.continue.chip.concise' },
  { id: 'specific', labelKey: 'studio.continue.chip.specific' },
  { id: 'strict', labelKey: 'studio.continue.chip.strict' },
  { id: 'restyle', labelKey: 'studio.continue.chip.restyle' },
] as const

export interface ContinueBarProps {
  /** 流式进行中：可以继续输入，但不能再次提交。 */
  busy: boolean
  /** 优化模型是否可用；不可用时禁用发送并就地说明原因。 */
  available: boolean
  onContinue: (instruction: string) => void
}

/**
 * 继续优化（FR-4）：结果下方常驻输入框，1 到 500 字。
 *
 * 快捷 chip 只填入输入框，由用户确认后发送；`⌘/Ctrl+Enter` 与发送按钮同守卫。
 * 没有可用优化模型时禁用发送并给设置入口，不伪造结果。
 */
export function ContinueBar({
  busy,
  available,
  onContinue,
}: ContinueBarProps): ReactElement {
  const [value, setValue] = useState('')
  const inputId = useId()
  const countId = useId()

  const count = value.length
  const over = count > OPTIMIZE_INSTRUCTION_LIMIT
  const empty = value.trim().length === 0
  const canSend = available && !busy && !empty && !over

  function fillChip(label: string) {
    setValue(label)
    document.getElementById(inputId)?.focus()
  }

  function submit() {
    if (!canSend) return
    onContinue(value.trim())
    setValue('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-line-subtle px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-label font-medium text-ink">
          {t('studio.continue.label')}
        </label>
        <span
          id={countId}
          className={cn(
            'text-caption tabular-nums',
            over ? 'text-danger' : 'text-ink-faint',
          )}
        >
          {t('studio.count', {
            count,
            limit: OPTIMIZE_INSTRUCTION_LIMIT,
          })}
        </span>
      </div>

      <Textarea
        id={inputId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('studio.continue.placeholder')}
        invalid={over}
        aria-describedby={countId}
        className="mt-2 min-h-20 resize-y"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label={t('studio.continue.chip.label')}
          className="flex flex-wrap items-center gap-1.5"
        >
          {CONTINUE_CHIPS.map((chip) => (
            <Chip key={chip.id} onClick={() => fillChip(t(chip.labelKey))}>
              {t(chip.labelKey)}
            </Chip>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={submit}
          disabled={!canSend}
        >
          {t('studio.continue.send')}
        </Button>
      </div>

      {over ? (
        <p role="alert" className="mt-1.5 text-caption text-danger">
          {t('studio.count.over', { limit: OPTIMIZE_INSTRUCTION_LIMIT })}
        </p>
      ) : null}

      {!available ? (
        <p
          role="status"
          className="mt-2 flex flex-wrap items-center gap-2 rounded-control bg-tint-gold px-3 py-2 text-caption text-warning"
        >
          <Icon name="alert" size={14} />
          <span>{t('studio.continue.unavailable')}</span>
          <Link
            href="/settings"
            className="text-accent underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-hover"
          >
            {t('studio.settingsLink')}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
