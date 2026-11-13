import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/zh'
import { formatCost, formatLatency, formatModel, formatTokens } from './format'

/** 结果元信息。每一项都可能是未知值，格式化函数统一输出「—」。 */
export interface MetaValues {
  modelId: string | null
  latencyMs: number | null
  tokensIn: number | null
  tokensOut: number | null
  costCny: number | null
}

export interface MetaRowProps {
  values: MetaValues
}

/**
 * 模型 / 耗时 / 输入输出 token / 估算费用（FR-2.4）。
 * 未知显示「—」，不写 0；数字等宽并启用 tabular-nums。
 */
export function MetaRow({ values }: MetaRowProps): ReactElement {
  const items = [
    { key: 'model', label: t('studio.meta.model'), value: formatModel(values.modelId) },
    { key: 'latency', label: t('studio.meta.latency'), value: formatLatency(values.latencyMs) },
    { key: 'tokensIn', label: t('studio.meta.tokensIn'), value: formatTokens(values.tokensIn) },
    {
      key: 'tokensOut',
      label: t('studio.meta.tokensOut'),
      value: formatTokens(values.tokensOut),
    },
    { key: 'cost', label: t('studio.meta.cost'), value: formatCost(values.costCny) },
  ]

  return (
    <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-caption">
      {items.map((item) => (
        <div key={item.key} className="flex items-baseline gap-1.5">
          <dt className="text-ink-faint">{item.label}</dt>
          <dd className="font-mono tabular-nums text-ink-muted">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
