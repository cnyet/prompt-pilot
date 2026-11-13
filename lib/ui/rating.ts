/**
 * 评分键盘 reducer（FR-6.6 / DESIGN.md Rating）。
 *
 * 与渲染分离成纯函数，便于在 node 环境下单测；返回 `undefined` 表示该键
 * 不属于评分交互，调用方应放行浏览器默认行为。
 */
export function ratingKeyToValue(
  current: number | null,
  key: string,
): number | null | undefined {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      if (current === null) return 1
      return Math.min(5, current + 1)
    case 'ArrowLeft':
    case 'ArrowDown':
      if (current === null) return 1
      return Math.max(1, current - 1)
    case 'Home':
      return 1
    case 'End':
      return 5
    case 'Delete':
    case 'Backspace':
      return null
    default:
      return /^[1-5]$/.test(key) ? Number(key) : undefined
  }
}
