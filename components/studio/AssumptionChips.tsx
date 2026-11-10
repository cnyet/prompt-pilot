'use client'

import { useId, useState } from 'react'
import {
  ASSUMPTION_SOURCE_LABELS,
  type AssumptionChip,
} from '@/lib/engine/assumptions'
import { cn } from '@/lib/utils'

function chipTitle(chip: AssumptionChip): string {
  if (!chip.applicable) {
    return '当前字段有无法识别的手写行，补这一行可能丢内容，已禁用'
  }
  const source = ASSUMPTION_SOURCE_LABELS[chip.source]
  return `${chip.label}：当前 ${chip.value}，来源：${source}。点开可改`
}

/**
 * 假设 chip。生成完成后显示在中栏顶部，点开可以从候选值里改一条假设。
 *
 * 组件只负责展示与选择，写回由 `useGeneration` 的 reducer 完成：一次只改
 * 该假设路径对应的一个字段。没有模型 Key 时这条链路同样可用，因为写回
 * 完全走本地纯函数，不发起网络请求。
 */
export function AssumptionChips({
  chips,
  exportWithoutAssumptions,
  onSelect,
  onToggleExport,
  disabled = false,
}: {
  chips: readonly AssumptionChip[]
  exportWithoutAssumptions: boolean
  onSelect: (path: string, value: string) => void
  onToggleExport: (value: boolean) => void
  disabled?: boolean
}) {
  const [openPath, setOpenPath] = useState<string | null>(null)
  const panelId = useId()
  const openChip =
    chips.find((chip) => chip.path === openPath) ?? null

  return (
    <section
      aria-label="生成假设"
      className="mt-4 rounded-panel border border-line bg-surface px-3 py-2.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption text-ink-faint">模型替你做的决定</p>
          <p className="mt-0.5 text-caption text-ink-muted">
            点开可改。只重算受影响的字段，其余字段保持原样。
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-caption text-ink-muted">
          <input
            type="checkbox"
            checked={exportWithoutAssumptions}
            onChange={(event) => onToggleExport(event.target.checked)}
            className="size-3.5 rounded-chip border-line accent-[var(--accent)]"
          />
          导出时剔除假设注释
        </label>
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const open = openPath === chip.path
          const blocked = disabled || !chip.applicable
          return (
            <li key={chip.path}>
              <button
                type="button"
                onClick={() =>
                  setOpenPath(open ? null : chip.path)
                }
                disabled={blocked}
                aria-expanded={open}
                aria-controls={`${panelId}-${chip.path}`}
                title={chipTitle(chip)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-chip border px-2 py-1 text-caption transition-colors',
                  chip.modified
                    ? 'border-accent bg-accent-subtle text-accent'
                    : 'border-line bg-bg-sunken text-ink-muted hover:border-line-strong hover:text-ink',
                  blocked &&
                    'cursor-not-allowed opacity-60 hover:border-line hover:text-ink-muted',
                )}
              >
                <span
                  className={
                    chip.modified ? 'text-accent' : 'text-ink-faint'
                  }
                >
                  {chip.label}
                </span>
                <span aria-hidden className="text-ink-faint">
                  ·
                </span>
                <span className="font-medium">{chip.value}</span>
                {chip.modified ? (
                  <span className="ml-0.5 inline-flex items-center gap-1 text-accent">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full bg-accent"
                    />
                    已改
                  </span>
                ) : null}
                <span aria-hidden className="text-ink-faint">
                  {open ? '▴' : '▾'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {openChip ? (
        <div
          id={`${panelId}-${openChip.path}`}
          className="mt-2 border-t border-line pt-2"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-caption text-ink-faint">
              把「{openChip.label}」改成
            </p>
            {openChip.candidates.map((candidate) => {
              const current = candidate === openChip.value
              return (
                <button
                  key={candidate}
                  type="button"
                  disabled={disabled || !openChip.applicable}
                  onClick={() => {
                    onSelect(openChip.path, candidate)
                    setOpenPath(null)
                  }}
                  className={cn(
                    'rounded-control border px-2 py-0.5 text-caption transition-colors',
                    current
                      ? 'border-accent text-accent'
                      : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                    'disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:border-line',
                  )}
                >
                  {candidate}
                  {current ? (
                    <span className="ml-1 text-ink-faint">当前</span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-caption text-ink-faint">
            {`来源：${ASSUMPTION_SOURCE_LABELS[openChip.source]}。只重算受这条假设影响的字段，其余字段保持原样。`}
          </p>
        </div>
      ) : null}
    </section>
  )
}
