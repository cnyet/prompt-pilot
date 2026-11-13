'use client'

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { Input, Textarea } from '@/components/ui/Input'
import { t, type MessageKey } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import {
  TEMPLATE_BODY_LIMIT,
  TEMPLATE_DESCRIPTION_LIMIT,
  TEMPLATE_STYLE_LIMIT,
  TEMPLATE_TITLE_LIMIT,
  validateTemplateForm,
  type TemplateFormInvalidReason,
  type TemplateFormValues,
} from '@/lib/ui/template-form'
import {
  ApiError,
  createTemplate,
  type ProcessMode,
  type TargetType,
} from './api'

const TARGET_KEYS: Readonly<Record<TargetType, MessageKey>> = {
  text: 'studio.target.text',
  image: 'studio.target.image',
  video: 'studio.target.video',
}

const REASON_KEYS: Readonly<Record<TemplateFormInvalidReason, MessageKey>> = {
  emptyTitle: 'studio.template.reason.emptyTitle',
  emptyDescription: 'studio.template.reason.emptyDescription',
  emptyStyle: 'studio.template.reason.emptyStyle',
  bodyTooLong: 'studio.template.reason.bodyTooLong',
}

export interface SaveTemplateFormProps {
  source: string
  targetType: TargetType
  mode: ProcessMode
  /** 记录不可用或流式进行中：不可打开表单。 */
  disabled: boolean
}

/**
 * 当前结果存为自定义模板（FR-7.5）。
 *
 * 内联表单；分类固定为记录的目标类型，模式沿用记录模式。title / description /
 * style 由 maxLength 限长，body 8000 字双保险：超过时显示计数并禁用保存。
 * 成功后关闭表单并就地提示，不打断阅读。
 */
export function SaveTemplateForm({
  source,
  targetType,
  mode,
  disabled,
}: SaveTemplateFormProps): ReactElement {
  const titleId = useId()
  const styleId = useId()
  const descriptionId = useId()
  const bodyId = useId()
  const bodyCountId = useId()

  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<TemplateFormValues>({
    title: '',
    description: '',
    style: '',
    body: '',
  })

  // 流开始或记录失效时收起表单，避免用旧正文保存
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const validation = validateTemplateForm(values)
  const bodyOver = validation.bodyCount > TEMPLATE_BODY_LIMIT

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setValues({ title: '', description: '', style: '', body: source })
    setAttempted(false)
    setError(null)
    setSaved(false)
    setOpen(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (!validation.valid || busy) return

    setBusy(true)
    setError(null)
    try {
      await createTemplate({
        category: targetType,
        style: values.style.trim(),
        title: values.title.trim(),
        description: values.description.trim(),
        body: values.body,
        mode,
      })
      setOpen(false)
      setSaved(true)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('studio.template.saveFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="border-t border-line-subtle px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="ghost"
          size="sm"
          icon="template"
          aria-expanded={open}
          onClick={toggle}
          disabled={disabled}
        >
          {t('studio.template.action')}
        </Button>
        {saved ? (
          <p
            role="status"
            className="flex flex-wrap items-center gap-2 text-caption text-success"
          >
            <Icon name="check" size={14} />
            <span>{t('studio.template.saved')}</span>
            <Link
              href="/templates"
              className="text-accent underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-hover"
            >
              {t('studio.template.savedLink')}
            </Link>
          </p>
        ) : null}
      </div>

      {open ? (
        <form
          onSubmit={submit}
          onKeyDown={handleKeyDown}
          className="mt-3 flex flex-col gap-3 rounded-panel border border-line bg-bg-sunken p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-label font-medium text-ink">
              {t('studio.template.heading')}
            </h3>
            <span className="flex items-center gap-2 text-caption text-ink-faint">
              {t('studio.template.field.category')}
              <Chip>{t(TARGET_KEYS[targetType])}</Chip>
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={titleId}
                className="text-label font-medium text-ink"
              >
                {t('studio.template.field.title')}
              </label>
              <Input
                id={titleId}
                value={values.title}
                maxLength={TEMPLATE_TITLE_LIMIT}
                onChange={(event) =>
                  setValues({ ...values, title: event.target.value })
                }
                placeholder={t('studio.template.placeholder.title')}
                className="mt-1.5"
              />
            </div>
            <div>
              <label
                htmlFor={styleId}
                className="text-label font-medium text-ink"
              >
                {t('studio.template.field.style')}
              </label>
              <Input
                id={styleId}
                value={values.style}
                maxLength={TEMPLATE_STYLE_LIMIT}
                onChange={(event) =>
                  setValues({ ...values, style: event.target.value })
                }
                placeholder={t('studio.template.placeholder.style')}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={descriptionId}
              className="text-label font-medium text-ink"
            >
              {t('studio.template.field.description')}
            </label>
            <Input
              id={descriptionId}
              value={values.description}
              maxLength={TEMPLATE_DESCRIPTION_LIMIT}
              onChange={(event) =>
                setValues({ ...values, description: event.target.value })
              }
              placeholder={t('studio.template.placeholder.description')}
              className="mt-1.5"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor={bodyId}
                className="text-label font-medium text-ink"
              >
                {t('studio.template.field.body')}
              </label>
              <span
                id={bodyCountId}
                className={cn(
                  'text-caption tabular-nums',
                  bodyOver ? 'text-danger' : 'text-ink-faint',
                )}
              >
                {t('studio.template.bodyCount', {
                  count: validation.bodyCount,
                  limit: TEMPLATE_BODY_LIMIT,
                })}
              </span>
            </div>
            <Textarea
              id={bodyId}
              value={values.body}
              maxLength={TEMPLATE_BODY_LIMIT}
              onChange={(event) =>
                setValues({ ...values, body: event.target.value })
              }
              invalid={bodyOver}
              aria-describedby={bodyCountId}
              className="mt-1.5 min-h-40 resize-y font-mono text-[0.875rem] leading-6"
            />
          </div>

          {attempted && validation.reason ? (
            <p role="alert" className="text-caption text-danger">
              {validation.reason === 'bodyTooLong'
                ? t(REASON_KEYS.bodyTooLong, { limit: TEMPLATE_BODY_LIMIT })
                : t(REASON_KEYS[validation.reason])}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-caption text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="submit"
              disabled={busy || bodyOver}
            >
              {busy ? t('studio.template.saving') : t('studio.template.save')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
