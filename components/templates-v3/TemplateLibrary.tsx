'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import { Tabs } from '@/components/ui/Tabs'
import { fetchTemplates } from '@/components/studio-v3/api'
import { t } from '@/lib/i18n/zh'
import {
  countTemplatesByCategory,
  filterTemplatesByStyle,
  resolveStyleSelection,
  stylesInCategory,
  TEMPLATE_CATEGORIES,
  templatesInCategory,
  toTemplateCard,
  toTemplateCategory,
  type TemplateCard as TemplateCardModel,
  type TemplateCategory,
} from '@/lib/templates-v3'
import { cn } from '@/lib/utils'
import { TemplateCard } from './TemplateCard'
import { COVER_ASPECT } from './TemplateCover'

const CATEGORY_LABEL = {
  text: 'studio.target.text',
  image: 'studio.target.image',
  video: 'studio.target.video',
} as const

/** 三类模板等宽等高，featured 不再跨列；只保留一条金色顶边区分重要模板。 */
const GRID = 'grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3'

/**
 * 模板库（PRODUCT.md FR-7 + DESIGN.md Template Card）。
 *
 * 服务端先给出首批模板；客户端只负责分类、风格筛选、重试与删除后的本地
 * 移除。分类计数始终基于全量模板，风格列表只来自当前分类；删除最后一个
 * 同风格模板后 `resolveStyleSelection` 让筛选自动回到「全部风格」。
 */
export function TemplateLibrary({
  initialTemplates,
  initialLoadFailed,
}: {
  initialTemplates: TemplateCardModel[]
  initialLoadFailed: boolean
}): ReactElement {
  const [templates, setTemplates] = useState(initialTemplates)
  const [category, setCategory] = useState<TemplateCategory>('text')
  const [style, setStyle] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(initialLoadFailed)
  const [notice, setNotice] = useState<string | null>(null)

  const retrySeq = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const counts = countTemplatesByCategory(templates)
  const categoryTemplates = templatesInCategory(templates, category)
  const styles = stylesInCategory(templates, category)
  const selectedStyle = resolveStyleSelection(styles, style)
  const visible = filterTemplatesByStyle(categoryTemplates, selectedStyle)

  const changeCategory = useCallback((next: string) => {
    setCategory(toTemplateCategory(next))
    setStyle(null)
  }, [])

  const handleDeleted = useCallback((id: string) => {
    setTemplates((current) => current.filter((template) => template.id !== id))
    setNotice(t('templates.deleted'))
  }, [])

  const retry = useCallback(async () => {
    const seq = retrySeq.current + 1
    retrySeq.current = seq
    setLoading(true)
    setLoadFailed(false)
    try {
      const { templates: rows } = await fetchTemplates()
      if (!mounted.current || retrySeq.current !== seq) return
      setTemplates(rows.map(toTemplateCard))
      setLoading(false)
    } catch {
      if (!mounted.current || retrySeq.current !== seq) return
      setLoadFailed(true)
      setLoading(false)
    }
  }, [])

  const showFilters = !loadFailed && !loading

  return (
    <PageShell variant="grid">
      <div className="flex flex-col gap-5">
        <div className="flex min-h-6 flex-wrap items-start justify-between gap-3">
          <p className="max-w-[68ch] text-balance text-body text-ink-muted">
            {t('templates.intro')}
          </p>
          <p role="status" className="text-caption text-success">
            {notice ?? ''}
          </p>
        </div>

        <Tabs
          ariaLabel={t('templates.category.label')}
          value={category}
          onValueChange={changeCategory}
          items={TEMPLATE_CATEGORIES.map((item) => ({
            value: item,
            label: t(CATEGORY_LABEL[item]),
            count: counts[item],
          }))}
        />

        {showFilters && styles.length > 0 ? (
          <div
            role="group"
            aria-label={t('templates.style.label')}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-caption text-ink-faint">
              {t('templates.style.label')}
            </span>
            <Chip
              selected={selectedStyle === null}
              aria-pressed={selectedStyle === null}
              onClick={() => setStyle(null)}
            >
              {t('templates.style.all')}
            </Chip>
            {styles.map((item) => (
              <Chip
                key={item}
                selected={selectedStyle === item}
                aria-pressed={selectedStyle === item}
                className="max-w-full min-w-0"
                title={item}
                onClick={() => setStyle(item)}
              >
                <span className="min-w-0 truncate">{item}</span>
              </Chip>
            ))}
          </div>
        ) : null}

        {showFilters && templates.length > 0 ? (
          <p aria-live="polite" className="text-caption text-ink-muted tabular-nums">
            {t('templates.count', { count: visible.length })}
          </p>
        ) : null}

        {loading ? (
          <TemplateSkeletons />
        ) : loadFailed ? (
          <EmptyState
            icon="alert"
            title={t('templates.error')}
            hint={t('templates.errorHint')}
            action={
              <Button variant="secondary" onClick={() => void retry()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : templates.length === 0 ? (
          <EmptyState
            icon="template"
            title={t('templates.empty.title')}
            hint={t('templates.empty.hint')}
            action={
              <Button asChild variant="primary">
                <Link href="/studio">{t('templates.empty.action')}</Link>
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="template"
            title={t('templates.emptyCategory.title')}
            hint={t('templates.emptyCategory.hint')}
            action={
              <Button asChild variant="primary">
                <Link href="/studio">
                  {t('templates.emptyCategory.action')}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className={GRID}>
            {visible.map((template) => (
              <li key={template.id} className="min-w-0">
                <TemplateCard
                  template={template}
                  onDeleted={handleDeleted}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  )
}

function TemplateSkeletons(): ReactElement {
  return (
    <div aria-busy="true" className={GRID}>
      <span className="sr-only">{t('templates.loading')}</span>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="overflow-hidden rounded-panel border border-line bg-surface shadow-sm"
        >
          <div className={cn('animate-pulse bg-bg-sunken', COVER_ASPECT)} />
          <div className="flex flex-col gap-2 p-4">
            <div className="h-5 w-2/3 animate-pulse rounded-chip bg-bg-sunken" />
            <div className="h-4 w-full animate-pulse rounded-chip bg-bg-sunken" />
            <div className="h-4 w-1/2 animate-pulse rounded-chip bg-bg-sunken" />
          </div>
        </div>
      ))}
    </div>
  )
}
