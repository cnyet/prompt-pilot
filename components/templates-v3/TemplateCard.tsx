'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/Button'
import { cardStyles } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { deleteTemplate } from '@/components/studio-v3/api'
import { t } from '@/lib/i18n/zh'
import {
  templateHref,
  type TemplateCard as TemplateCardModel,
} from '@/lib/templates-v3'
import { cn } from '@/lib/utils'
import { TemplateCover } from './TemplateCover'

const TARGET_LABEL = {
  text: 'studio.target.text',
  image: 'studio.target.image',
  video: 'studio.target.video',
} as const

/**
 * 模板卡（DESIGN.md Template Card）。
 *
 * 网格里所有卡共用 2px 顶边与等高正文：featured 的顶边是金色，其余是默认
 * 描边，几何完全一致。封面优先、内容真实：标题、说明、风格与目标类型、模式
 * 与入口。内置模板不渲染删除控件；自定义模板先在卡内二次确认再调用 DELETE，
 * 删除期间按钮禁用并拦截重复提交，失败就地显示原因。
 */
export function TemplateCard({
  template,
  onDeleted,
  className,
}: {
  template: TemplateCardModel
  onDeleted: (id: string) => void
  className?: string
}): ReactElement {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)

  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus()
      return
    }
    if (restoreFocus.current) {
      restoreFocus.current = false
      deleteTriggerRef.current?.focus()
    }
  }, [confirming])

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteFailed(false)
    try {
      await deleteTemplate(template.id)
      onDeleted(template.id)
    } catch {
      restoreFocus.current = true
      setDeleteFailed(true)
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <article
      className={cardStyles({
        variant: template.featured ? 'accent' : 'default',
        padding: 'none',
        className: cn(
          'flex h-full min-w-0 flex-col overflow-hidden border-t-2',
          className,
        ),
      })}
    >
      <TemplateCover template={template} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="line-clamp-2 text-balance break-words font-display text-h3 font-semibold text-ink">
            {template.title}
          </h2>
          {!template.builtin ? (
            <Chip tone="info" className="mt-0.5 shrink-0">
              {t('templates.custom')}
            </Chip>
          ) : null}
        </div>

        <p className="line-clamp-2 break-words text-body text-ink-muted">
          {template.description}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {template.style.length > 0 ? (
            <Chip className="max-w-full min-w-0" title={template.style}>
              <span className="min-w-0 truncate">{template.style}</span>
            </Chip>
          ) : null}
          <Chip>{t(TARGET_LABEL[template.category])}</Chip>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption text-ink-faint">
              {t(
                template.mode === 'optimize'
                  ? 'templates.mode.optimize'
                  : 'templates.mode.generate',
              )}
            </span>
            <div className="flex items-center gap-1">
              {!template.builtin ? (
                <Button
                  ref={deleteTriggerRef}
                  variant="ghost"
                  size="sm"
                  aria-label={t('templates.deleteAria', {
                    title: template.title,
                  })}
                  aria-expanded={confirming}
                  onClick={() => setConfirming(true)}
                  disabled={deleting}
                >
                  {t('templates.delete')}
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm">
                <Link
                  href={templateHref(template.id)}
                  aria-label={t('templates.useAria', { title: template.title })}
                >
                  {t('templates.use')}
                  <Icon name="chevron-right" size={14} />
                </Link>
              </Button>
            </div>
          </div>

          {!template.builtin && (deleteFailed || confirming) ? (
            <div className="border-t border-line-subtle pt-2">
              {deleteFailed ? (
                <p role="alert" className="mb-2 text-caption text-danger">
                  {t('templates.deleteFailed')}
                </p>
              ) : null}
              {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-caption text-ink-muted">
                    {t('templates.deleteConfirm')}
                  </p>
                  <Button
                    ref={confirmRef}
                    variant="destructive"
                    size="sm"
                    aria-label={t('templates.deleteConfirmAria', {
                      title: template.title,
                    })}
                    onClick={() => void confirmDelete()}
                    disabled={deleting}
                  >
                    {deleting
                      ? t('templates.deleting')
                      : t('templates.deleteConfirmAction')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('templates.deleteCancelAria', {
                      title: template.title,
                    })}
                    onClick={() => {
                      restoreFocus.current = true
                      setConfirming(false)
                      setDeleteFailed(false)
                    }}
                    disabled={deleting}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
