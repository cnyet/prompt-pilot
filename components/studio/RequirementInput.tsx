'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'
import { FIELD_KEYS, FIELD_LABELS } from '@/lib/engine/schema'
import { SCENE_TEMPLATES } from '@/lib/templates'
import { useModelStatus } from './modelStatus'

const EXAMPLES: readonly string[] = [
  '帮我写个周报',
  '把这段客服话术改成更专业的版本',
  '给产品评审会写一份议程',
]

export function RequirementInput({
  onSubmit,
  busy,
  initialValue = '',
}: {
  onSubmit: (input: string) => void
  busy: boolean
  /** 从模板页带过来的示例需求。只作初值，之后由用户控制。 */
  initialValue?: string
}) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const model = useModelStatus()

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }
    textarea.focus()
    // 模板带进来的示例文本把光标放到末尾，用户可以直接续写。
    const end = textarea.value.length
    if (end > 0) {
      textarea.setSelectionRange(end, end)
    }
  }, [])

  const trimmed = value.trim()
  const canSubmit = trimmed.length >= 2 && !busy
  const improveMode = Array.from(trimmed).length > 120

  const submit = () => {
    if (!canSubmit) {
      return
    }
    onSubmit(trimmed)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    if (event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    submit()
  }

  const applySample = (sample: string) => {
    setValue(sample)
    const textarea = textareaRef.current
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(sample.length, sample.length)
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col justify-center px-6 py-16">
      <div className="mb-8">
        <h2 className="font-display text-display font-normal text-balance text-ink lg:text-display-lg">
          把一句话变成结构化提示词
        </h2>
        <p className="mt-3 max-w-[56ch] text-balance text-body text-ink-muted">
          先写清要做什么，生成后可以逐字段修改、诊断与试运行。
        </p>
      </div>

      <div className="rounded-panel border border-line bg-surface p-4 shadow-sm transition-colors duration-150 focus-within:border-accent/50 focus-within:ring-[3px] focus-within:ring-accent/25 sm:p-5">
        <label htmlFor="requirement" className="sr-only">
          需求或已有提示词
        </label>
        <textarea
          id="requirement"
          ref={textareaRef}
          rows={7}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="用一句话说清你要做什么，也可以直接粘贴一份已有的提示词。"
          aria-describedby="requirement-hint"
          className="min-h-[184px] w-full resize-y bg-transparent text-body-lg text-ink placeholder:text-ink-faint focus:outline-none lg:min-h-[240px]"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <p id="requirement-hint" className="text-caption text-ink-faint">
            {improveMode
              ? '改进模式：长文本会按已有内容优化'
              : '生成模式：输入一句话需求'}
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-ink-faint sm:inline">
              Enter 生成，Shift + Enter 换行
            </span>
            <Button
              variant="primary"
              icon="spark"
              onClick={submit}
              disabled={!canSubmit}
              aria-describedby="requirement-hint"
            >
              生成
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {SCENE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => applySample(template.sample)}
            className="group flex flex-col items-start gap-2 rounded-panel border border-line bg-surface px-3 py-3 text-left shadow-sm transition-colors duration-150 hover:border-line-strong hover:bg-surface-raised"
          >
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-control text-ink-muted',
                template.tint,
              )}
            >
              <Icon name={template.icon} size={15} />
            </span>
            <span className="text-label font-medium text-ink">
              {template.name}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-12 grid w-full gap-8 border-t border-line-subtle pt-6 sm:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-caption text-ink-faint">试试这些</p>
          <ul className="mt-2 flex flex-col">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => applySample(example)}
                  className="group flex w-full items-center justify-between gap-3 rounded-control px-2 py-2 text-left text-body text-ink-muted transition-colors duration-150 hover:bg-bg-sunken hover:text-ink"
                >
                  {example}
                  <span className="text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5">
                    <Icon name="chevron-right" size={13} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-caption text-ink-faint">你会得到</p>
          <p className="mt-2 text-body text-ink-muted">
            八个字段一次成型，边界拆成六个必须显式回答的问题。
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {FIELD_KEYS.map((field) => (
              <li key={field}>
                <Chip>{FIELD_LABELS[field]}</Chip>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-8 flex items-start gap-2 text-caption text-ink-faint">
        <span
          aria-hidden
          className={cn(
            'mt-1 size-1.5 shrink-0 rounded-full',
            model.status === 'available'
              ? model.providerId === 'mock'
                ? 'bg-warning'
                : 'bg-success'
              : model.status === 'error'
                ? 'bg-danger'
                : 'bg-ink-faint',
          )}
        />
        <span>
          {model.status === 'loading'
            ? '正在确认模型可用性。'
            : model.status === 'available'
              ? model.providerId === 'mock'
                ? '离线模板模式：生成使用本地模板，试运行使用本地 Mock 模型。配置 ARK_API_KEY 后可用真实模型。'
                : `当前模型：${model.modelLabel ?? '可用模型'}。生成仍可使用离线模板兜底。`
              : model.status === 'error'
                ? '无法确认模型状态。生成、编辑与导出仍可用，试运行可能不可用。'
                : '当前为离线模板模式。生成、编辑与导出可用，试运行需要先配置 ARK_API_KEY。'}
        </span>
      </p>
    </div>
  )
}
