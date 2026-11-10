'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'
import { FIELD_KEYS, FIELD_LABELS } from '@/lib/engine/schema'
import { useModelStatus } from './modelStatus'

const TEMPLATES: readonly {
  label: string
  sample: string
  icon: IconName
  tint: string
}[] = [
  {
    label: '通用问答',
    sample: '解释一下什么是向量数据库，面向非技术读者。',
    icon: 'spark',
    tint: 'bg-tint-butter',
  },
  {
    label: '内容创作',
    sample: '帮我写一篇关于远程办公的产品博客。',
    icon: 'studio',
    tint: 'bg-tint-coral',
  },
  {
    label: '代码生成',
    sample: '用 TypeScript 写一个解析 CSV 的函数，包含错误处理。',
    icon: 'terminal',
    tint: 'bg-tint-lavender',
  },
  {
    label: '数据分析',
    sample: '分析这份月度销售数据，找出下降原因。',
    icon: 'eval',
    tint: 'bg-tint-sage',
  },
  {
    label: '客服对话',
    sample: '把这段客服话术改成更专业的版本。',
    icon: 'library',
    tint: 'bg-tint-butter',
  },
  {
    label: '结构化抽取',
    sample: '从订单邮件里抽取订单号、金额和收货城市。',
    icon: 'template',
    tint: 'bg-tint-lavender',
  },
]

const EXAMPLES: readonly string[] = [
  '帮我写个周报',
  '把这段客服话术改成更专业的版本',
  '给产品评审会写一份议程',
]

export function RequirementInput({
  onSubmit,
  busy,
}: {
  onSubmit: (input: string) => void
  busy: boolean
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const model = useModelStatus()

  useEffect(() => {
    textareaRef.current?.focus()
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
        <p className="text-caption text-ink-faint">工作台</p>
        <h1 className="mt-1.5 text-display font-semibold text-ink">
          把一句话变成结构化提示词
        </h1>
        <p className="mt-2 max-w-[56ch] text-body text-ink-muted">
          先写清要做什么，生成后可以逐字段修改、诊断与试运行。
        </p>
      </div>

      <div className="rounded-panel border border-transparent bg-surface-inset p-4 transition-colors duration-150 focus-within:border-line-strong focus-within:bg-surface focus-within:ring-1 focus-within:ring-accent/20">
        <label htmlFor="requirement" className="sr-only">
          需求或已有提示词
        </label>
        <textarea
          id="requirement"
          ref={textareaRef}
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="用一句话说清你要做什么，也可以直接粘贴一份已有的提示词。"
          aria-describedby="requirement-hint"
          className="h-24 w-full resize-none bg-transparent text-body-lg text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-4">
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
              size="sm"
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TEMPLATES.map((template) => (
          <button
            key={template.label}
            type="button"
            onClick={() => applySample(template.sample)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 py-2 text-left text-caption font-medium text-ink transition-colors duration-150 hover:brightness-[0.97]',
              template.tint,
            )}
          >
            <Icon name={template.icon} size={15} className="text-ink-muted" />
            {template.label}
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
              <li
                key={field}
                className="rounded-chip bg-bg-sunken px-2 py-1 text-caption text-ink-muted"
              >
                {FIELD_LABELS[field]}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-8 text-caption text-ink-faint">
        {model.status === 'loading'
          ? '正在确认模型可用性。'
          : model.status === 'available'
            ? model.providerId === 'mock'
              ? '离线模板模式：生成使用本地模板，试运行使用本地 Mock 模型。配置 ARK_API_KEY 后可用真实模型。'
              : `当前模型：${model.modelLabel ?? '可用模型'}。生成仍可使用离线模板兜底。`
            : model.status === 'error'
              ? '无法确认模型状态。生成、编辑与导出仍可用，试运行可能不可用。'
              : '当前为离线模板模式。生成、编辑与导出可用，试运行需要先配置 ARK_API_KEY。'}
      </p>
    </div>
  )
}
