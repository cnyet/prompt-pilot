/**
 * 结果面对比视图的纯逻辑（Task 6 review fix）。
 *
 * 对比入口有两种来源：已有的多轮迭代，以及优化记录保留的原文。
 * 这里只做可见性与默认轮次计算，不发请求、不碰 React，便于直接单元测试。
 */

/** FROM 下拉中代表记录原文的伪轮次值，不会与数据库迭代 id 冲突。 */
export const ORIGINAL_COMPARE_ID = 'original'

export interface CompareSelection {
  fromId: string
  toId: string
}

/** 优化记录有非空原文时，对比视图可以把原文作为起点。 */
export function isOriginalCompareAvailable(
  mode: 'generate' | 'optimize',
  sourceInput: string,
): boolean {
  return mode === 'optimize' && sourceInput.trim().length > 0
}

/** 至少两轮迭代，或优化记录带原文时显示对比入口。 */
export function showCompareView(
  mode: 'generate' | 'optimize',
  sourceInput: string,
  iterationCount: number,
): boolean {
  return iterationCount >= 2 || isOriginalCompareAvailable(mode, sourceInput)
}

/**
 * 对比默认选择：
 * - 只有一轮且有原文时，FROM 默认「原文」；
 * - 两轮及以上时保持上一轮 vs 当前轮，原文仍可手动选择；
 * - 没有迭代时返回空选择，由调用方决定是否渲染。
 */
export function defaultCompareSelection(
  iterationIds: readonly string[],
  originalAvailable: boolean,
): CompareSelection {
  const count = iterationIds.length

  if (count === 0) {
    return {
      fromId: originalAvailable ? ORIGINAL_COMPARE_ID : '',
      toId: '',
    }
  }

  if (count === 1) {
    const only = iterationIds[0] ?? ''
    return {
      fromId: originalAvailable ? ORIGINAL_COMPARE_ID : only,
      toId: only,
    }
  }

  const toId = iterationIds[count - 1] ?? ''
  return {
    fromId: iterationIds[count - 2] ?? toId,
    toId,
  }
}
