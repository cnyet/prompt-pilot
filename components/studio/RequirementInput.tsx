'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useModelStatus } from './modelStatus'

const TEMPLATES: readonly { label: string; sample: string }[] = [
  { label: '通用问答', sample: '解释一下什么是向量数据库，面向非技术读者。' },
  { label: '内容创作', sample: '帮我写一篇关于远程办公的产品博客。' },
  { label: '代码生成', sample: '用 TypeScript 写一个解析 CSV 的函数，包含错误处理。' },
  { label: '数据分析', sample: '分析这份月度销售数据，找出下降原因。' },
  { label: '客服对话', sample: '把这段客服话术改成更专业的版本。' },
  { label: '结构化抽取', sample: '从订单邮件里抽取订单号、金额和收货城市。' },
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
    <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-6 py-16">
      <div className="w-full max-w-[640px] self-center rounded-panel border border-line bg-surface p-4 transition-colors focus-within:border-accent">
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
          className="h-24 w-full resize-none rounded-control bg-transparent text-body-lg text-ink placeholder:text-ink-faint"
        />
        <div className="mt-2 flex items-center justify-between gap-4">
          <p id="requirement-hint" className="text-caption text-ink-faint">
            {improveMode
              ? '改进模式：长文本会按已有内容优化'
              : '生成模式：输入一句话需求'}
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-ink-faint sm:inline">
              Enter 或 ⌘Enter 生成，Shift + Enter 换行
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              aria-describedby="requirement-hint"
              className="rounded-control bg-accent px-3 py-1.5 text-label font-medium text-bg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
            >
              生成
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {TEMPLATES.map((template) => (
          <button
            key={template.label}
            type="button"
            onClick={() => applySample(template.sample)}
            className="rounded-chip border border-line px-2 py-1 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {template.label}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-10 w-full max-w-[640px] border-t border-line pt-4">
        <p className="text-caption text-ink-faint">试试这些</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => applySample(example)}
                className="text-left text-body text-ink-muted transition-colors hover:text-ink"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 text-center text-caption text-ink-faint">
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
