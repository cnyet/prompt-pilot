'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import {
  fetchRecordList,
  patchRecordMeta,
  type RecordSummaryDto,
} from '@/components/studio-v3/api'
import { t } from '@/lib/i18n/zh'
import {
  hasActiveQuery,
  LIBRARY_PAGE_SIZE,
  nextOffset,
  type LibraryFilter,
  type LibraryListParams,
  type LibraryTargetType,
} from '@/lib/library/query'
import { removeRecordFromList, replaceRecord } from '@/lib/library/rows'
import { LibraryFilters } from './LibraryFilters'
import { RecordDetailDrawer } from './RecordDetailDrawer'
import { RecordRow } from './RecordRow'
import { useRecordMeta } from './useRecordMeta'

export interface LibraryV3Props {
  optimizeAvailable: boolean
}

/**
 * 提示词库（PRODUCT.md FR-6 + DESIGN.md Library Record Row）。
 *
 * 搜索 300ms 防抖，筛选立即生效；请求带 AbortController 与递增请求号双守卫，
 * 旧响应直接丢弃。列表按最近处理倒序，完成即入库，收藏/评分/重命名就地更新。
 * 选中行打开右侧详情抽屉；抽屉内删除后同步移除列表行并递减总数。
 */
export function LibraryV3({ optimizeAvailable }: LibraryV3Props) {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [targetType, setTargetType] = useState<LibraryTargetType | null>(null)
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)

  const [records, setRecords] = useState<RecordSummaryDto[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setActiveQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const listParams = useCallback(
    (nextOffsetValue: number): LibraryListParams => ({
      q: activeQuery,
      filter,
      targetType,
      from,
      to,
      limit: LIBRARY_PAGE_SIZE,
      offset: nextOffsetValue,
    }),
    [activeQuery, filter, targetType, from, to],
  )

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    setOffset(0)

    void fetchRecordList(listParams(0), controller.signal)
      .then((dto) => {
        if (requestIdRef.current !== requestId) return
        setRecords(dto.records)
        setTotal(dto.total)
        setOffset(dto.records.length)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || requestIdRef.current !== requestId) return
        setError(cause instanceof Error ? cause.message : t('library.error'))
        setLoading(false)
      })

    return () => controller.abort()
  }, [listParams, reloadToken])

  const updateRecord = useCallback((next: RecordSummaryDto) => {
    setRecords((current) => replaceRecord(current, next))
  }, [])

  const handleDeleted = useCallback((id: string) => {
    setRecords((current) => removeRecordFromList(current, id))
    setTotal((current) => Math.max(0, current - 1))
    setOffset((current) => Math.max(0, current - 1))
    setSelectedId((current) => (current === id ? null : current))
  }, [])

  const onMetaError = useCallback(() => {
    setNotice(t('library.meta.saveFailed'))
  }, [])

  const { isPending, toggleFavorite, setRating } = useRecordMeta(
    updateRecord,
    onMetaError,
  )

  const renameRecord = useCallback(
    async (record: RecordSummaryDto, title: string): Promise<boolean> => {
      try {
        const { record: updated } = await patchRecordMeta(record.id, { title })
        updateRecord(updated)
        return true
      } catch {
        return false
      }
    },
    [updateRecord],
  )

  const clearFilters = useCallback(() => {
    setQuery('')
    setActiveQuery('')
    setFilter('all')
    setTargetType(null)
    setFrom(null)
    setTo(null)
  }, [])

  async function loadMore() {
    if (loading || loadingMore) return
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoadingMore(true)
    try {
      const dto = await fetchRecordList(listParams(offset))
      if (requestIdRef.current !== requestId) return
      setRecords((current) => {
        const seen = new Set(current.map((record) => record.id))
        const additions = dto.records.filter((record) => !seen.has(record.id))
        return [...current, ...additions]
      })
      setTotal(dto.total)
      setOffset((current) => nextOffset(current, dto.records.length))
    } catch (cause) {
      if (requestIdRef.current !== requestId) return
      setNotice(cause instanceof Error ? cause.message : t('library.error'))
    } finally {
      setLoadingMore(false)
    }
  }

  const active = hasActiveQuery({ q: activeQuery, filter, targetType, from, to })
  const hasMore = offset < total

  return (
    <PageShell variant="grid">
      <div className="flex flex-col gap-4">
        <LibraryFilters
          query={query}
          filter={filter}
          targetType={targetType}
          from={from}
          to={to}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          onTargetTypeChange={setTargetType}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={clearFilters}
        />

        <div className="flex min-h-6 flex-wrap items-center justify-between gap-2">
          <p aria-live="polite" className="text-caption text-ink-muted tabular-nums">
            {t('library.count', { total })}
          </p>
          {notice ? (
            <p role="alert" className="text-caption text-danger">
              {notice}
            </p>
          ) : null}
          {!optimizeAvailable ? (
            <p className="text-caption text-ink-faint">
              {t('studio.continue.unavailable')}
            </p>
          ) : null}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <span className="sr-only">{t('library.loading')}</span>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-14 animate-pulse rounded-panel border border-line bg-bg-sunken"
              />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon="alert"
            title={t('library.error')}
            hint={error}
            action={
              <Button
                variant="secondary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                {t('common.retry')}
              </Button>
            }
          />
        ) : records.length === 0 ? (
          active ? (
            <EmptyState
              icon="search"
              title={t('library.emptyFiltered.title')}
              hint={t('library.emptyFiltered.hint')}
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  {t('library.emptyFiltered.action')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="library"
              title={t('library.empty.title')}
              hint={t('library.empty.hint')}
              action={
                <Button asChild variant="primary">
                  <Link href="/studio">{t('library.empty.action')}</Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-sm">
              <ul className="divide-y divide-line-subtle">
                {records.map((record) => (
                  <RecordRow
                    key={record.id}
                    record={record}
                    selected={selectedId === record.id}
                    pending={{
                      favorite: isPending(record.id, 'favorite'),
                      rating: isPending(record.id, 'rating'),
                    }}
                    onOpen={setSelectedId}
                    onFavorite={toggleFavorite}
                    onRating={setRating}
                    onRename={renameRecord}
                  />
                ))}
              </ul>
            </div>
            {hasMore ? (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? t('library.loading') : t('library.loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {selectedId ? (
        <RecordDetailDrawer
          key={selectedId}
          recordId={selectedId}
          optimizeAvailable={optimizeAvailable}
          onClose={() => setSelectedId(null)}
          onDeleted={handleDeleted}
          onMetaChanged={updateRecord}
        />
      ) : null}
    </PageShell>
  )
}
