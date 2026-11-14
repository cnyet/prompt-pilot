'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import {
  budgetLevel,
  formatBudgetPercent,
} from '@/lib/budget'
import { cn } from '@/lib/utils'

const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

function formatCny(value: number): string {
  return `¥${cnyFormatter.format(value)}`
}

function readError(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string' && message.length > 0) {
        return message
      }
    }
  }
  return fallback
}

export function BudgetSetting({
  initialBudgetCny,
  usage,
}: {
  initialBudgetCny: number | null
  usage: number | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(
    initialBudgetCny === null ? '' : String(initialBudgetCny),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const put = async (budget: number | null) => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetMonthlyCny: budget }),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(readError(body, '预算保存失败，请稍后重试。'))
      }
      setMessage(budget === null ? '预算已清除。' : '预算已保存。')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '预算保存失败。')
    } finally {
      setSaving(false)
    }
  }

  const onSave = () => {
    const parsed = Number(value.trim())
    if (value.trim().length === 0 || !Number.isFinite(parsed) || parsed <= 0) {
      setMessage(null)
      setError('填一个大于 0 的预算金额。')
      return
    }
    void put(parsed)
  }

  const onClear = () => {
    setValue('')
    void put(null)
  }

  const level = budgetLevel(usage)
  const percentText = usage === null ? null : formatBudgetPercent(usage)

  return (
    <div className="mt-6 rounded-panel border border-line bg-surface p-4 sm:p-5">
      <h3 className="text-label font-medium text-ink">月度预算</h3>
      <p className="mt-1 text-caption text-ink-faint">
        达到 80% 提示，达到 100% 强提示，但不阻断调用。
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <label
            htmlFor="setting-budget"
            className="text-caption font-medium text-ink"
          >
            预算金额（元）
          </label>
          <input
            id="setting-budget"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="未设置"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setMessage(null)
              setError(null)
            }}
            className="h-9 w-full rounded-control border border-line bg-surface px-2.5 text-label text-ink tnum shadow-[inset_0_1px_0_oklch(0.5_0.01_80/0.03)] transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:outline-none"
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '保存中' : '保存预算'}
        </Button>
        {initialBudgetCny !== null ? (
          <Button
            variant="ghost"
            size="md"
            onClick={onClear}
            disabled={saving}
          >
            清除预算
          </Button>
        ) : null}
        {message ? (
          <span role="status" className="text-caption text-success">
            {message}
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="text-caption text-danger">
            {error}
          </span>
        ) : null}
      </div>

      {initialBudgetCny === null ? (
        <p className="mt-3 text-caption text-ink-faint">未设置预算</p>
      ) : usage === null || percentText === null ? (
        <p className="mt-3 text-caption text-ink-faint">
          费用未知，暂时无法计算使用率
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-caption text-ink-muted tnum">
            已用 {formatCny(initialBudgetCny * usage)} /{' '}
            {formatCny(initialBudgetCny)}（{percentText}）
          </p>
          <div
            role="progressbar"
            aria-label="预算使用率"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(usage, 1) * 100)}
            aria-valuetext={percentText}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-sunken"
          >
            <div
              className={cn(
                'h-full rounded-full',
                level === 'over'
                  ? 'bg-danger'
                  : level === 'warning'
                    ? 'bg-warning'
                    : 'bg-accent',
              )}
              style={{
                width: `${Math.min(100, Math.max(0, usage * 100))}%`,
              }}
            />
          </div>
          {level === 'warning' ? (
            <p
              role="status"
              className="mt-1.5 flex items-center gap-1.5 text-caption text-warning"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-warning" />
              已达到预算的 {percentText}，请留意后续调用。
            </p>
          ) : null}
          {level === 'over' ? (
            <p
              role="alert"
              className="mt-1.5 flex items-center gap-1.5 text-caption text-danger"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-danger" />
              已达到预算的 {percentText}，调用仍会继续，不会被阻断。
            </p>
          ) : null}
        </div>
      )}

    </div>
  )
}
