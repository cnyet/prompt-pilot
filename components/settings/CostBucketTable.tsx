'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { CostBucket } from '@/lib/llm/ledger'

const PAGE_SIZE = 10
const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

function hasKnownUsage(bucket: CostBucket): boolean {
  return bucket.calls > 0 && bucket.unknownUsageCalls < bucket.calls
}

function hasKnownCost(bucket: CostBucket): boolean {
  return bucket.calls > 0 && bucket.unknownCostCalls < bucket.calls
}

function usageCell(bucket: CostBucket, value: number): string {
  if (!hasKnownUsage(bucket)) {
    return '—'
  }
  return `${formatNumber(value)}${bucket.unknownUsageCalls > 0 ? ' *' : ''}`
}

function cachedCell(bucket: CostBucket): string {
  if (bucket.cachedKnownCalls === 0) {
    return '—'
  }
  const tokens = formatNumber(bucket.cachedTokens)
  const rate =
    bucket.cacheHitRate === null ? '' : `（${bucket.cacheHitRate.toFixed(1)}%）`
  return `${tokens}${rate}${bucket.cachedKnownCalls < bucket.calls ? ' *' : ''}`
}

function reasoningCell(bucket: CostBucket): string {
  if (bucket.reasoningKnownCalls === 0) {
    return '—'
  }
  return `${formatNumber(bucket.reasoningTokens)}${
    bucket.reasoningKnownCalls < bucket.calls ? ' *' : ''
  }`
}

function costCell(bucket: CostBucket): string {
  if (!hasKnownCost(bucket)) {
    return '—'
  }
  return `¥${cnyFormatter.format(bucket.costCny)}${
    bucket.unknownCostCalls > 0 ? ' *' : ''
  }`
}

/**
 * 成本明细表。调用账本会随模型数量增长，默认每页 10 行，
 * 避免几十上百个模型把设置页拉成一条长表。
 */
export function CostBucketTable({
  buckets,
  firstHeader,
}: {
  buckets: readonly CostBucket[]
  firstHeader: string
}) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(buckets.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const start = current * PAGE_SIZE
  const rows = buckets.slice(start, start + PAGE_SIZE)
  const rangeStart = buckets.length === 0 ? 0 : start + 1
  const rangeEnd = Math.min(start + PAGE_SIZE, buckets.length)

  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-label">
          <thead>
            <tr className="border-b border-line-subtle text-left text-caption text-ink-faint">
              <th scope="col" className="py-2 pr-4 font-normal">
                {firstHeader}
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                调用
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                输入 token
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                输出 token
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                缓存
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                思考 token
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                金额
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.map((bucket) => (
              <tr key={bucket.key} className="tnum">
                <td className="py-2 pr-4">{bucket.label}</td>
                <td className="py-2 pr-4 text-right">{bucket.calls}</td>
                <td className="py-2 pr-4 text-right">
                  {usageCell(bucket, bucket.tokensIn)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {usageCell(bucket, bucket.tokensOut)}
                </td>
                <td className="py-2 pr-4 text-right">{cachedCell(bucket)}</td>
                <td className="py-2 pr-4 text-right">
                  {reasoningCell(bucket)}
                </td>
                <td className="py-2 text-right">{costCell(bucket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {buckets.length > PAGE_SIZE ? (
        <nav
          aria-label={`${firstHeader}分页`}
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-3"
        >
          <p className="text-caption text-ink-faint tnum">
            第 {rangeStart}–{rangeEnd} 条，共 {buckets.length} 条
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
            >
              上一页
            </Button>
            <span className="min-w-16 text-center text-caption text-ink-muted tnum">
              {current + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
            >
              下一页
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}