'use client'

import { useId, type KeyboardEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { t, type MessageKey } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import type { ProcessMode, TargetType } from './api'
import {
  OPTIMIZE_INSTRUCTION_LIMIT,
  SOURCE_LIMITS,
  activeDraft,
  validateComposer,
  type ComposerDraft,
  type ComposerState,
} from './composer'

const TARGET_OPTIONS: ReadonlyArray<{
  value: TargetType
  labelKey: MessageKey
}> = [
  { value: 'text', labelKey: 'studio.target.text' },
  { value: 'image', labelKey: 'studio.target.image' },
  { value: 'video', labelKey: 'studio.target.video' },
]

export interface PromptComposerProps {
  state: ComposerState
  onChange: (state: ComposerState) => void
  onSubmit: () => void
  onCancel: () => void
  /** 流式进行中：主按钮禁用，改出停止按钮。 */
  active: boolean
  unavailable: boolean
  error: string | null
}

/**
 * 工作台输入区（DESIGN.md Workspace Result Surface）。
 *
 * 模式 tabs 切换生成 / 优化，两侧草稿互不影响；目标类型只在生成模式出现。
 * ⌘Enter 提交、Esc 停止；输入法合成中不触发提交。没有可用模型时禁用主操作，
 * 就地说明原因并给出设置入口，绝不伪造输出。
 */
export function PromptComposer({
  state,
  onChange,
  onSubmit,
  onCancel,
  active,
  unavailable,
  error,
}: PromptComposerProps): ReactElement {
  const sourceId = useId()
  const instructionId = useId()
  const sourceCountId = useId()
  const instructionCountId = useId()

  const draft = activeDraft(state)
  const validation = validateComposer(state, { unavailable })
  const sourceLimit = SOURCE_LIMITS[state.mode]
  const sourceOver = validation.counts.source > sourceLimit
  const instructionOver =
    state.mode === 'optimize' &&
    validation.counts.instruction > OPTIMIZE_INSTRUCTION_LIMIT
  const submitDisabled = !validation.valid || active

  function updateDraft(patch: Partial<ComposerDraft>) {
    if (state.mode === 'generate') {
      onChange({
        ...state,
        generate: { ...state.generate, ...patch },
      })
      return
    }
    onChange({
      ...state,
      optimize: { ...state.optimize, ...patch },
    })
  }

  function handleModeChange(value: string) {
    if (value !== 'generate' && value !== 'optimize') return
    if (value === state.mode) return
    onChange({ ...state, mode: value })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 输入法合成中的 Enter 属于选词，不是提交；keyCode 229 兼容旧版浏览器。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      // 与主按钮同一守卫：不可用、空值、超限或进行中都不发请求。
      if (!submitDisabled) onSubmit()
      return
    }
    if (event.key === 'Escape' && active) {
      event.preventDefault()
      onCancel()
    }
  }

  const unavailableMessage =
    state.mode === 'generate'
      ? t('studio.unavailable.generate')
      : t('studio.unavailable.optimize')
  const primaryLabel =
    state.mode === 'generate'
      ? t('studio.primary.generate')
      : t('studio.primary.optimize')

  return (
    <section
      aria-label={t('studio.mode.label')}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 shadow-sm"
    >
      <Tabs
        items={[
          { value: 'generate', label: t('studio.mode.generate') },
          { value: 'optimize', label: t('studio.mode.optimize') },
        ]}
        value={state.mode}
        onValueChange={handleModeChange}
        ariaLabel={t('studio.mode.label')}
      />

      {state.mode === 'generate' ? (
        <div
          role="group"
          aria-label={t('studio.target.label')}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-caption text-ink-faint">
            {t('studio.target.label')}
          </span>
          {TARGET_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              selected={draft.targetType === option.value}
              onClick={() => updateDraft({ targetType: option.value })}
            >
              {t(option.labelKey)}
            </Chip>
          ))}
        </div>
      ) : null}

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={sourceId} className="text-label font-medium text-ink">
            {state.mode === 'generate'
              ? t('studio.source.generateLabel')
              : t('studio.source.optimizeLabel')}
          </label>
          <span
            id={sourceCountId}
            className={cn(
              'text-caption tabular-nums',
              sourceOver ? 'text-danger' : 'text-ink-faint',
            )}
          >
            {t('studio.count', {
              count: validation.counts.source,
              limit: sourceLimit,
            })}
          </span>
        </div>
        <Textarea
          id={sourceId}
          value={draft.sourceInput}
          onChange={(event) => updateDraft({ sourceInput: event.target.value })}
          onKeyDown={handleKeyDown}
          placeholder={
            state.mode === 'generate'
              ? t('studio.source.generatePlaceholder')
              : t('studio.source.optimizePlaceholder')
          }
          invalid={sourceOver}
          aria-describedby={sourceCountId}
          className="mt-2 min-h-[184px] resize-y bg-surface py-3 text-body-lg leading-[1.75]"
        />
        {sourceOver && !unavailable ? (
          <p role="alert" className="mt-1.5 text-caption text-danger">
            {t('studio.count.over', { limit: sourceLimit })}
          </p>
        ) : null}
      </div>

      {state.mode === 'optimize' ? (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor={instructionId}
              className="text-label font-medium text-ink"
            >
              {t('studio.instruction.label')}
            </label>
            <span
              id={instructionCountId}
              className={cn(
                'text-caption tabular-nums',
                instructionOver ? 'text-danger' : 'text-ink-faint',
              )}
            >
              {t('studio.count', {
                count: validation.counts.instruction,
                limit: OPTIMIZE_INSTRUCTION_LIMIT,
              })}
            </span>
          </div>
          <Textarea
            id={instructionId}
            value={draft.instruction}
            onChange={(event) =>
              updateDraft({ instruction: event.target.value })
            }
            onKeyDown={handleKeyDown}
            placeholder={t('studio.instruction.placeholder')}
            invalid={instructionOver}
            aria-describedby={instructionCountId}
            className="mt-2 min-h-24 resize-y bg-surface"
          />
          {instructionOver && !unavailable ? (
            <p role="alert" className="mt-1.5 text-caption text-danger">
              {t('studio.count.over', { limit: OPTIMIZE_INSTRUCTION_LIMIT })}
            </p>
          ) : null}
        </div>
      ) : null}

      {unavailable ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-control bg-tint-gold px-3 py-2 text-caption text-warning"
        >
          <Icon name="alert" size={14} />
          <span>{unavailableMessage}</span>
          <Link
            href="/settings"
            className="text-accent underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-hover"
          >
            {t('studio.settingsLink')}
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-ink-faint">
          {t('studio.hint.shortcuts')}
        </p>
        <div className="flex items-center gap-2">
          {active ? (
            <Button variant="secondary" icon="stop" onClick={onCancel}>
              {t('studio.stop')}
            </Button>
          ) : null}
          <Button
            variant="primary"
            icon={state.mode === 'generate' ? 'spark' : 'wand'}
            onClick={onSubmit}
            disabled={submitDisabled}
            aria-describedby={sourceCountId}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </section>
  )
}
