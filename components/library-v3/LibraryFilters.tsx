'use client'

import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { Input, Select } from '@/components/ui/Input'
import { t, type MessageKey } from '@/lib/i18n/zh'
import {
  hasActiveQuery,
  type LibraryFilter,
  type LibraryTargetType,
} from '@/lib/library/query'

const FILTERS: Array<{ value: LibraryFilter; key: MessageKey }> = [
  { value: 'all', key: 'library.filter.all' },
  { value: 'favorite', key: 'library.filter.favorite' },
  { value: 'rated', key: 'library.filter.rated' },
  { value: 'generate', key: 'library.filter.generate' },
  { value: 'optimize', key: 'library.filter.optimize' },
]

const TARGETS: Array<{ value: LibraryTargetType; key: MessageKey }> = [
  { value: 'text', key: 'library.target.text' },
  { value: 'image', key: 'library.target.image' },
  { value: 'video', key: 'library.target.video' },
]

export interface LibraryFiltersProps {
  query: string
  filter: LibraryFilter
  targetType: LibraryTargetType | null
  from: string | null
  to: string | null
  onQueryChange: (query: string) => void
  onFilterChange: (filter: LibraryFilter) => void
  onTargetTypeChange: (targetType: LibraryTargetType | null) => void
  onFromChange: (from: string | null) => void
  onToChange: (to: string | null) => void
  onClear: () => void
}

/**
 * 提示词库筛选栏：搜索、五个筛选 chip、目标类型与起止日期。
 *
 * 清空搜索时同时清掉防抖值，由父组件负责；这里只发事件。
 */
export function LibraryFilters({
  query,
  filter,
  targetType,
  from,
  to,
  onQueryChange,
  onFilterChange,
  onTargetTypeChange,
  onFromChange,
  onToChange,
  onClear,
}: LibraryFiltersProps) {
  const active = hasActiveQuery({ q: query, filter, targetType, from, to })

  return (
    <section
      aria-label={t('library.filter.label')}
      className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 shadow-sm"
    >
      <div className="relative min-w-[220px] flex-1">
        <label htmlFor="library-search" className="sr-only">
          {t('library.search.label')}
        </label>
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <Input
          id="library-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('library.search.placeholder')}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-caption text-ink-faint">
          {t('library.filter.label')}
        </span>
        {FILTERS.map((item) => (
          <Chip
            key={item.value}
            selected={filter === item.value}
            onClick={() => onFilterChange(item.value)}
          >
            {t(item.key)}
          </Chip>
        ))}

        <label className="flex items-center gap-2 text-caption text-ink-muted">
          <span>{t('library.target.label')}</span>
          <Select
            value={targetType ?? ''}
            onChange={(event) =>
              onTargetTypeChange(
                event.target.value === ''
                  ? null
                  : (event.target.value as LibraryTargetType),
              )
            }
            className="h-9 w-auto"
          >
            <option value="">{t('library.target.all')}</option>
            {TARGETS.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.key)}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex items-center gap-2 text-caption text-ink-muted">
          <span>{t('library.date.from')}</span>
          <Input
            type="date"
            value={from ?? ''}
            onChange={(event) => onFromChange(event.target.value || null)}
            className="h-9 w-auto"
          />
        </label>
        <label className="flex items-center gap-2 text-caption text-ink-muted">
          <span>{t('library.date.to')}</span>
          <Input
            type="date"
            value={to ?? ''}
            onChange={(event) => onToChange(event.target.value || null)}
            className="h-9 w-auto"
          />
        </label>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={!active}
        >
          {t('library.clear')}
        </Button>
      </div>
    </section>
  )
}
