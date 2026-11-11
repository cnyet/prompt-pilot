/**
 * 评估的纯函数层：判定提示词、宽容解析、聚合指标。
 * 不碰数据库、不碰网络，便于单测覆盖边界。
 */

export type Verdict = 'satisfied' | 'partial' | 'unsatisfied'
export type Comparison = 'better' | 'same' | 'worse'

export interface CriterionVerdict {
  criterionIndex: number
  verdict: Verdict
  note: string | null
}

export interface JudgeResult {
  verdicts: CriterionVerdict[]
  comparison: Comparison | null
}

export interface CriterionInput {
  index: number
  text: string
}

/**
 * 盲评里哪一个版本被放在 A 位。两个方向各跑一次，
 * 用来抵消评委对位置的偏好（PRODUCT.md FR-6.4）。
 */
export type JudgeOrder = 'target-first' | 'baseline-first'

/**
 * 组装判定用的提示词：只给标准与输出，不给版本标签。
 * `order` 决定目标版本在 A 位还是 B 位；标准判定始终针对 A 位输出。
 */
export function buildJudgeMessages(params: {
  criteria: readonly CriterionInput[]
  targetOutput: string
  baselineOutput: string | null
  order?: JudgeOrder
}): Array<{ role: 'system' | 'user'; content: string }> {
  const criteriaBlock = params.criteria
    .map((criterion) => `${criterion.index}. ${criterion.text}`)
    .join('\n')

  const order = params.order ?? 'target-first'
  const hasBaseline = params.baselineOutput !== null
  const firstOutput =
    hasBaseline && order === 'baseline-first'
      ? params.baselineOutput
      : params.targetOutput
  const secondOutput =
    hasBaseline && order === 'baseline-first'
      ? params.targetOutput
      : params.baselineOutput

  const compareBlock =
    secondOutput === null
      ? ''
      : `

另外判断 A 与 B 哪一份更接近这些标准：
- better：A 明显更好
- same：两者相当
- worse：A 明显更差
只比较是否满足标准，不比较篇幅长短与文风偏好。

B 的输出：
"""
${secondOutput}
"""`

  return [
    {
      role: 'system',
      content:
        '你是严格的评审，只依据给定的成功标准判断，不做主观喜好判断。只输出 JSON。',
    },
    {
      role: 'user',
      content: `成功标准：
${criteriaBlock}

A 的输出：
"""
${firstOutput}
"""${compareBlock}

只输出如下 JSON，不要解释：
{"verdicts":[{"index":1,"verdict":"satisfied|partial|unsatisfied","note":"简短理由"}],"comparison":"better|same|worse"}

没有 B 时 comparison 输出 null。每条标准都要给出判定。`,
    },
  ]
}

/** 把某一次判定的 comparison 统一到「目标版本视角」。 */
export function comparisonFromTarget(
  order: JudgeOrder,
  comparison: Comparison | null,
): Comparison | null {
  if (comparison === null || order === 'target-first') {
    return comparison
  }
  if (comparison === 'better') {
    return 'worse'
  }
  if (comparison === 'worse') {
    return 'better'
  }
  return 'same'
}

/**
 * 合并双向判定：两边一致才采用，冲突时记为「相当」。
 * 只有一侧可用时采用可用的一侧，两侧都没有则返回 null。
 */
export function reconcileComparison(
  forward: Comparison | null,
  reverse: Comparison | null,
): Comparison | null {
  if (forward === null) {
    return reverse
  }
  if (reverse === null) {
    return forward
  }
  return forward === reverse ? forward : 'same'
}

const VERDICTS: ReadonlySet<string> = new Set(['satisfied', 'partial', 'unsatisfied'])
const COMPARISONS: ReadonlySet<string> = new Set(['better', 'same', 'worse'])

/**
 * 宽容解析判定结果。
 * 模型常把 JSON 包在代码围栏里，或漏字段；这里只取能识别的部分，
 * 认不出的标准留给调用方补成"未判定"，不猜。
 */
export function parseJudgeResult(raw: string): JudgeResult {
  const text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    return { verdicts: [], comparison: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { verdicts: [], comparison: null }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { verdicts: [], comparison: null }
  }

  const record = parsed as Record<string, unknown>
  const verdicts: CriterionVerdict[] = []
  if (Array.isArray(record.verdicts)) {
    for (const item of record.verdicts) {
      if (typeof item !== 'object' || item === null) {
        continue
      }
      const entry = item as Record<string, unknown>
      const index = entry.index
      const verdict = entry.verdict
      if (
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        typeof verdict !== 'string' ||
        !VERDICTS.has(verdict)
      ) {
        continue
      }
      const note =
        typeof entry.note === 'string' && entry.note.trim().length > 0
          ? entry.note.trim().slice(0, 200)
          : null
      verdicts.push({ criterionIndex: index, verdict: verdict as Verdict, note })
    }
  }

  const comparison =
    typeof record.comparison === 'string' && COMPARISONS.has(record.comparison)
      ? (record.comparison as Comparison)
      : null

  return { verdicts, comparison }
}

export interface EvalSummary {
  /** 满足 + 部分满足 记为通过；部分满足按 0.5 计 */
  passRate: number | null
  /** better / (better + worse)；两者都为 0 时为 null */
  winRate: number | null
  counts: {
    satisfied: number
    partial: number
    unsatisfied: number
    better: number
    same: number
    worse: number
  }
  judgedSamples: number
}

/** 聚合判定结果。没有任何判定时返回 null 而不是 0，避免把"没判"展示成"全是 0 分" */
export function summarizeEval(params: {
  verdicts: readonly Verdict[]
  comparisons: readonly Comparison[]
}): EvalSummary {
  const counts = {
    satisfied: 0,
    partial: 0,
    unsatisfied: 0,
    better: 0,
    same: 0,
    worse: 0,
  }
  for (const verdict of params.verdicts) {
    counts[verdict] += 1
  }
  for (const comparison of params.comparisons) {
    counts[comparison] += 1
  }

  const judged = params.verdicts.length
  const passRate =
    judged === 0
      ? null
      : (counts.satisfied + counts.partial * 0.5) / judged

  const decisive = counts.better + counts.worse
  const winRate = decisive === 0 ? null : counts.better / decisive

  return {
    passRate,
    winRate,
    counts,
    judgedSamples: params.comparisons.length,
  }
}
