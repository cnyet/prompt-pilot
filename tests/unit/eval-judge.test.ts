import { describe, expect, it } from 'vitest'
import {
  buildJudgeMessages,
  comparisonFromTarget,
  parseJudgeResult,
  reconcileComparison,
  summarizeEval,
} from '@/lib/eval/judge'

describe('判定结果解析', () => {
  it('解析标准 JSON', () => {
    const result = parseJudgeResult(
      '{"verdicts":[{"index":1,"verdict":"satisfied","note":"覆盖了受众"}],"comparison":"better"}',
    )
    expect(result.verdicts).toEqual([
      { criterionIndex: 1, verdict: 'satisfied', note: '覆盖了受众' },
    ])
    expect(result.comparison).toBe('better')
  })

  it('容忍代码围栏与前后废话', () => {
    const raw = '好的，结果如下：\n```json\n{"verdicts":[{"index":2,"verdict":"partial"}],"comparison":null}\n```'
    const result = parseJudgeResult(raw)
    expect(result.verdicts).toHaveLength(1)
    expect(result.verdicts[0]?.verdict).toBe('partial')
    expect(result.comparison).toBeNull()
  })

  it('丢弃非法判定与非法对比值，不猜测', () => {
    const raw = '{"verdicts":[{"index":1,"verdict":"great"},{"index":2,"verdict":"unsatisfied"}],"comparison":"much-better"}'
    const result = parseJudgeResult(raw)
    expect(result.verdicts).toEqual([
      { criterionIndex: 2, verdict: 'unsatisfied', note: null },
    ])
    expect(result.comparison).toBeNull()
  })

  it('非 JSON 输入返回空结果而不是抛错', () => {
    expect(parseJudgeResult('模型今天不想输出 JSON')).toEqual({
      verdicts: [],
      comparison: null,
    })
  })
})

describe('聚合', () => {
  it('部分满足按 0.5 计入通过率', () => {
    const summary = summarizeEval({
      verdicts: ['satisfied', 'partial', 'unsatisfied', 'satisfied'],
      comparisons: ['better', 'worse'],
    })
    expect(summary.passRate).toBeCloseTo((2 + 0.5) / 4)
    expect(summary.winRate).toBeCloseTo(0.5)
    expect(summary.counts.satisfied).toBe(2)
  })

  it('没有任何判定时是 null，不是 0', () => {
    const summary = summarizeEval({ verdicts: [], comparisons: [] })
    expect(summary.passRate).toBeNull()
    expect(summary.winRate).toBeNull()
    expect(summary.judgedSamples).toBe(0)
  })

  it('只有平局时胜率为 null（没有可比的胜负）', () => {
    const summary = summarizeEval({
      verdicts: ['satisfied'],
      comparisons: ['same', 'same'],
    })
    expect(summary.winRate).toBeNull()
  })
})

describe('判定提示词', () => {
  it('没有基线时不包含 B 段', () => {
    const messages = buildJudgeMessages({
      criteria: [{ index: 1, text: '结构完整' }],
      targetOutput: 'A 的输出',
      baselineOutput: null,
    })
    const user = messages.find((message) => message.role === 'user')?.content ?? ''
    expect(user).toContain('结构完整')
    expect(user).not.toContain('B 的输出')
    expect(user).toContain('comparison 输出 null')
  })

  it('target-first 把目标放在 A 位', () => {
    const messages = buildJudgeMessages({
      criteria: [{ index: 1, text: '结构完整' }],
      targetOutput: '目标输出',
      baselineOutput: '基线输出',
      order: 'target-first',
    })
    const user = messages.find((message) => message.role === 'user')?.content ?? ''
    expect(user.indexOf('目标输出')).toBeLessThan(user.indexOf('基线输出'))
  })

  it('baseline-first 交换 A/B 位置，输出里不带版本标签', () => {
    const messages = buildJudgeMessages({
      criteria: [{ index: 1, text: '结构完整' }],
      targetOutput: '目标输出',
      baselineOutput: '基线输出',
      order: 'baseline-first',
    })
    const user = messages.find((message) => message.role === 'user')?.content ?? ''
    expect(user.indexOf('基线输出')).toBeLessThan(user.indexOf('目标输出'))
    expect(user).not.toContain('v0')
    expect(user).not.toContain('当前版本')
  })
})

describe('双向判定合并', () => {
  it('反向结果翻回目标视角', () => {
    expect(comparisonFromTarget('target-first', 'better')).toBe('better')
    expect(comparisonFromTarget('baseline-first', 'better')).toBe('worse')
    expect(comparisonFromTarget('baseline-first', 'worse')).toBe('better')
    expect(comparisonFromTarget('baseline-first', 'same')).toBe('same')
    expect(comparisonFromTarget('baseline-first', null)).toBeNull()
  })

  it('两个方向一致才采用，冲突记相当', () => {
    expect(reconcileComparison('better', 'better')).toBe('better')
    expect(reconcileComparison('worse', 'worse')).toBe('worse')
    expect(reconcileComparison('better', 'worse')).toBe('same')
    expect(reconcileComparison(null, 'better')).toBe('better')
    expect(reconcileComparison('worse', null)).toBe('worse')
    expect(reconcileComparison(null, null)).toBeNull()
  })
})
