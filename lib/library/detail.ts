/**
 * 记录详情的纯选择逻辑。
 */
import type { IterationDto } from '@/components/studio-v3/api'

/** 取 seq 最大的一轮；不依赖数组顺序，空列表返回 null。 */
export function latestIteration(
  iterations: readonly IterationDto[],
): IterationDto | null {
  let latest: IterationDto | null = null
  for (const iteration of iterations) {
    if (latest === null || iteration.seq > latest.seq) {
      latest = iteration
    }
  }
  return latest
}
