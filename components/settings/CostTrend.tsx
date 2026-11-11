import type { CostDay } from '@/lib/llm/ledger'

/**
 * 近 14 天调用与成本。
 *
 * 柱是每日调用次数，线是每日已知金额。两者量纲不同，左右各一条轴，
 * 图例与坐标文字同时标出单位。金额未知的调用不计入折线，并在图下说明。
 */

const WIDTH = 760
const HEIGHT = 236
const PADDING = { top: 16, right: 58, bottom: 28, left: 42 }
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const GRID_LINES = 4

function formatCalls(value: number): string {
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)}万`
  }
  return String(Math.round(value))
}

function formatCny(value: number): string {
  if (value === 0) {
    return '¥0'
  }
  if (value < 0.01) {
    return `¥${value.toFixed(4)}`
  }
  return `¥${value.toFixed(2)}`
}

export function CostTrend({ days }: { days: readonly CostDay[] }) {
  if (days.length === 0) {
    return null
  }

  const maxCalls = Math.max(1, ...days.map((day) => day.calls))
  const maxCost = Math.max(0, ...days.map((day) => day.costCny))
  const costScale = maxCost > 0 ? maxCost : 1
  const hasCostLine = days.some((day) => day.knownCostCalls > 0)
  const unknownCostCalls = days.reduce(
    (sum, day) => sum + day.unknownCostCalls,
    0,
  )
  const step = PLOT_WIDTH / days.length
  const barWidth = Math.min(24, step * 0.48)

  const x = (index: number) => PADDING.left + step * (index + 0.5)
  const yCalls = (value: number) =>
    PADDING.top + PLOT_HEIGHT - (value / maxCalls) * PLOT_HEIGHT
  const yCost = (value: number) =>
    PADDING.top + PLOT_HEIGHT - (value / costScale) * PLOT_HEIGHT

  const costPoints = days
    .map((day, index) => `${x(index)},${yCost(day.costCny)}`)
    .join(' ')

  return (
    <figure className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-label font-medium text-ink">近 14 天调用与成本</h3>
          <p className="mt-1 text-caption text-ink-faint">
            按上海时区切日；金额只统计拿到用量的调用。
          </p>
        </div>
        <ul className="flex items-center gap-4 text-caption text-ink-muted">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[2px] bg-accent/45"
            />
            调用次数
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-info" />
            金额
          </li>
        </ul>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[236px] min-w-[560px] w-full"
          role="img"
          aria-label="近 14 天调用次数柱状图与每日金额折线图"
        >
          {Array.from({ length: GRID_LINES + 1 }, (_, index) => {
            const ratio = index / GRID_LINES
            const y = PADDING.top + PLOT_HEIGHT * ratio
            return (
              <g key={index}>
                <line
                  x1={PADDING.left}
                  y1={y}
                  x2={WIDTH - PADDING.right}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <text
                  x={PADDING.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--text-faint)"
                >
                  {formatCalls(maxCalls * (1 - ratio))}
                </text>
                {maxCost > 0 || ratio === 1 ? (
                  <text
                    x={WIDTH - PADDING.right + 8}
                    y={y + 3}
                    textAnchor="start"
                    fontSize="10"
                    fill="var(--text-faint)"
                  >
                    {formatCny(maxCost * (1 - ratio))}
                  </text>
                ) : null}
              </g>
            )
          })}

          {days.map((day, index) => {
            const barHeight = (day.calls / maxCalls) * PLOT_HEIGHT
            const isToday = index === days.length - 1
            return (
              <g key={day.date}>
                <rect
                  x={x(index) - barWidth / 2}
                  y={PADDING.top + PLOT_HEIGHT - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx="2"
                  fill="var(--accent)"
                  fillOpacity={isToday ? 0.68 : 0.4}
                >
                  <title>
                    {`${day.label}：${day.calls} 次调用，${formatCny(day.costCny)}`}
                  </title>
                </rect>
                <text
                  x={x(index)}
                  y={HEIGHT - 9}
                  textAnchor="middle"
                  fontSize="10"
                  fill={isToday ? 'var(--text-muted)' : 'var(--text-faint)'}
                >
                  {day.label}
                </text>
              </g>
            )
          })}

          {hasCostLine ? (
            <>
              <polyline
                points={costPoints}
                fill="none"
                stroke="var(--info)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {days.map((day, index) => (
                <circle
                  key={`${day.date}-cost`}
                  cx={x(index)}
                  cy={yCost(day.costCny)}
                  r="2.6"
                  fill="var(--surface)"
                  stroke="var(--info)"
                  strokeWidth="1.6"
                >
                  <title>{`${day.label} 金额：${formatCny(day.costCny)}`}</title>
                </circle>
              ))}
            </>
          ) : null}
        </svg>
      </div>

      <figcaption className="mt-2 text-caption text-ink-faint">
        {hasCostLine
          ? unknownCostCalls > 0
            ? `另有 ${unknownCostCalls} 次调用未拿到金额，未计入折线。`
            : '折线统计本次窗口内的每日金额。'
          : '本次窗口内还没有已知金额，折线暂不显示，柱状图仍按调用次数绘制。'}
      </figcaption>

      <table className="sr-only">
        <caption>近 14 天调用与成本明细</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">调用次数</th>
            <th scope="col">金额</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{day.calls}</td>
              <td>
                {day.knownCostCalls > 0 ? formatCny(day.costCny) : '未知'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}