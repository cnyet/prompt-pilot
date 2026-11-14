'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  patchRecordMeta,
  type RecordSummaryDto,
} from '@/components/studio-v3/api'
import {
  patchAgainstConfirmed,
  queueMetaPatch,
  type MetaPatch,
} from '@/lib/ui/meta-coalesce'

export type MetaField = 'favorite' | 'rating'

export interface MetaPending {
  favorite: boolean
  rating: boolean
}

export interface RecordMetaControls {
  isPending(id: string, field: MetaField): boolean
  toggleFavorite(record: RecordSummaryDto): void
  setRating(record: RecordSummaryDto, value: number | null): void
}

interface Entry {
  queued: MetaPatch | null
  confirmed: MetaPatch
  latest: RecordSummaryDto
  inFlight: boolean
}

const EMPTY_PENDING: MetaPending = { favorite: false, rating: false }

/**
 * 库列表的收藏与评分写入。
 *
 * 点击先乐观更新列表，PATCH 在途时不原生禁用控件；同一记录的在途请求
 * 只保留每个字段的最新值，落定后按已确认值差量补发一次（I1 同款合并）。
 * 失败时回滚到已确认值并交给调用方提示。
 */
export function useRecordMeta(
  updateRecord: (record: RecordSummaryDto) => void,
  onError: (error: unknown) => void,
): RecordMetaControls {
  const entriesRef = useRef(new Map<string, Entry>())
  const [pendingById, setPendingById] = useState<Record<string, MetaPending>>({})
  const updateRef = useRef(updateRecord)
  const errorRef = useRef(onError)

  useEffect(() => {
    updateRef.current = updateRecord
    errorRef.current = onError
  }, [updateRecord, onError])

  const markPending = useCallback((id: string, patch: MetaPatch, value: boolean) => {
    setPendingById((current) => {
      const previous = current[id] ?? EMPTY_PENDING
      const next: MetaPending = {
        favorite:
          patch.favorite === undefined ? previous.favorite : value,
        rating: patch.rating === undefined ? previous.rating : value,
      }
      return { ...current, [id]: next }
    })
  }, [])

  const clearPending = useCallback((id: string) => {
    setPendingById((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  const entryFor = useCallback((record: RecordSummaryDto): Entry => {
    const existing = entriesRef.current.get(record.id)
    if (existing) {
      existing.latest = record
      return existing
    }
    const created: Entry = {
      queued: null,
      confirmed: { favorite: record.favorite, rating: record.rating },
      latest: record,
      inFlight: false,
    }
    entriesRef.current.set(record.id, created)
    return created
  }, [])

  const flush = useCallback(
    async (id: string): Promise<void> => {
      const entry = entriesRef.current.get(id)
      if (!entry || entry.inFlight) return
      entry.inFlight = true
      try {
        while (entry.queued !== null) {
          const patch = entry.queued
          entry.queued = null
          markPending(id, patch, true)
          const { record } = await patchRecordMeta(id, patch)
          entry.confirmed = { ...entry.confirmed, ...patch }
          entry.latest = record
          updateRef.current(record)
        }
      } catch (error) {
        entry.queued = null
        const rollback: RecordSummaryDto = { ...entry.latest, ...entry.confirmed }
        entry.latest = rollback
        updateRef.current(rollback)
        errorRef.current(error)
      } finally {
        entry.inFlight = false
        clearPending(id)
      }
    },
    [clearPending, markPending],
  )

  const toggleFavorite = useCallback(
    (record: RecordSummaryDto): void => {
      const entry = entryFor(record)
      const favorite = !record.favorite
      const optimistic = { ...record, favorite }
      entry.latest = optimistic
      updateRef.current(optimistic)
      entry.queued = queueMetaPatch(entry.queued, { favorite })
      void flush(record.id)
    },
    [entryFor, flush],
  )

  const setRating = useCallback(
    (record: RecordSummaryDto, value: number | null): void => {
      const entry = entryFor(record)
      const optimistic = { ...record, rating: value }
      entry.latest = optimistic
      updateRef.current(optimistic)
      entry.queued = queueMetaPatch(entry.queued, { rating: value })
      void flush(record.id)
    },
    [entryFor, flush],
  )

  const isPending = useCallback(
    (id: string, field: MetaField): boolean =>
      (pendingById[id] ?? EMPTY_PENDING)[field],
    [pendingById],
  )

  return { isPending, toggleFavorite, setRating }
}
