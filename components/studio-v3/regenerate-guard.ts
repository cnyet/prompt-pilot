import type { ProcessMode } from './api'

/**
 * 重新生成的可用性守卫（I3、M11）。
 *
 * 只在生成模式记录上开放：优化记录「重新生成」会把原始提示词当需求走生成管线，
 * 与用户意图相悖；结算期间与请求进行中同样拒绝，与继续优化/修复一致。
 */
export function canRegenerateRecord(input: {
  recordId: string | null
  active: boolean
  settling: boolean
  generateAvailable: boolean
  mode: ProcessMode
}): boolean {
  return (
    input.recordId !== null &&
    !input.active &&
    !input.settling &&
    input.generateAvailable &&
    input.mode === 'generate'
  )
}
