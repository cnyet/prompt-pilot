'use client'

import { useId, useMemo, useState, type ReactElement } from 'react'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Input'
import { diffPromptLines } from '@/lib/engine/diff'
import { t, type MessageKey } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import type { IterationDto } from './api'
import { DiffView } from './DiffView'

const KIND_KEYS: Readonly<Record<string, MessageKey>> = {
  generate: 'studio.iteration.kind.generate',
  optimize: 'studio.iteration.kind.optimize',
  repair: 'studio.iteration.kind.repair',
}

type CompareView = 'inline' | 'side-by-side'

export interface IterationCompareProps {
  iterations: readonly IterationDto[]
  className?: string
}

function optionLabel(iteration: IterationDto): string {
  const seq = t('studio.compare.iteration', { seq: iteration.seq })
  const kindKey = KIND_KEYS[iteration.kind]
  return kindKey ? `${seq} · ${t(kindKey)}` : seq
}

/**
 * 任意两轮迭代对比（FR-4.3 / FR-6.7）。
 *
 * 两个 select 选择轮次，默认上一轮 vs 当前轮；少于 2 轮不渲染。
 * diff 由 `diffPromptLines` 计算，视图默认行内，可切并排。
 */
export function IterationCompare({
  iterations,
  className,
}: IterationCompareProps): ReactElement | null {
  if (iterations.length < 2) return null
  return (
    <IterationCompareBody iterations={iterations} className={className} />
  )
}

function IterationCompareBody({
  iterations,
  className,
}: {
  iterations: readonly IterationDto[]
  className?: string
}): ReactElement {
  const fromSelectId = useId()
  const toSelectId = useId()
  const [fromId, setFromId] = useState(
    () => iterations[iterations.length - 2]?.id ?? '',
  )
  const [toId, setToId] = useState(
    () => iterations[iterations.length - 1]?.id ?? '',
  )
  const [view, setView] = useState<CompareView>('inline')

  // 迭代列表变化时（例如继续优化后）把失效的选择回落到最近两轮
  const from =
    iterations.find((iteration) => iteration.id === fromId) ??
    iterations[iterations.length - 2]
  const to =
    iterations.find((iteration) => iteration.id === toId) ??
    iterations[iterations.length - 1]

  const result = useMemo(
    () => diffPromptLines(from?.output ?? '', to?.output ?? ''),
    [from?.output, to?.output],
  )

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <div>
            <label
              htmlFor={fromSelectId}
              className="text-caption text-ink-faint"
            >
              {t('studio.compare.from')}
            </label>
            <Select
              id={fromSelectId}
              value={from?.id ?? ''}
              onChange={(event) => setFromId(event.target.value)}
              className="mt-1"
            >
              {iterations.map((iteration) => (
                <option key={iteration.id} value={iteration.id}>
                  {optionLabel(iteration)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor={toSelectId} className="text-caption text-ink-faint">
              {t('studio.compare.to')}
            </label>
            <Select
              id={toSelectId}
              value={to?.id ?? ''}
              onChange={(event) => setToId(event.target.value)}
              className="mt-1"
            >
              {iterations.map((iteration) => (
                <option key={iteration.id} value={iteration.id}>
                  {optionLabel(iteration)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div
          role="group"
          aria-label={t('studio.compare.view.label')}
          className="flex items-center gap-1"
        >
          <Chip
            selected={view === 'inline'}
            aria-pressed={view === 'inline'}
            onClick={() => setView('inline')}
          >
            {t('studio.compare.view.inline')}
          </Chip>
          <Chip
            selected={view === 'side-by-side'}
            aria-pressed={view === 'side-by-side'}
            onClick={() => setView('side-by-side')}
          >
            {t('studio.compare.view.sideBySide')}
          </Chip>
        </div>
      </div>

      <div role="group" aria-label={t('studio.compare.label')}>
        <DiffView result={result} view={view} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-faint">
        <span className="tabular-nums">
          {t('studio.compare.stats', result.stats)}
        </span>
        {result.degraded ? <span>{t('studio.compare.degraded')}</span> : null}
      </div>
    </div>
  )
}
