import { describe, expect, it } from 'vitest'
import type { PromptVariable } from '@/lib/engine/schema'
import type { TrialRunAvailability } from '@/components/studio/types'
import {
  planAutoTrialRun,
  variablesHaveDefaults,
  type AutoTrialRunInput,
  type AutoTrialRunOutcome,
} from '@/components/studio/useTrialRun'

const READY: TrialRunAvailability = {
  status: 'ready',
  available: true,
  reason: '',
  model: { providerId: 'mock', modelId: 'mock', label: 'Mock 模型' },
}

const UNAVAILABLE: TrialRunAvailability = {
  status: 'unavailable',
  available: false,
  reason: '没有配置可用模型。',
  model: null,
}

const LOADING: TrialRunAvailability = {
  status: 'loading',
  available: false,
  reason: '正在确认可用模型。',
  model: null,
}

function variable(overrides: Partial<PromptVariable> = {}): PromptVariable {
  return {
    name: 'topic',
    label: '主题',
    type: 'text',
    required: true,
    ...overrides,
  }
}

function input(overrides: Partial<AutoTrialRunInput> = {}): AutoTrialRunInput {
  return {
    phase: 'done',
    prompt: '## 角色\n你是一位资深编辑。',
    roundId: 7,
    consumedRoundId: null,
    stopped: false,
    disabled: false,
    variables: [variable({ defaultValue: '秋季新品' })],
    availability: READY,
    ...overrides,
  }
}

/**
 * 模拟组件反复渲染：只有判定要求 consume 时才把轮次写进 ref，
 * 与 RunDrawer 中的实际消费方式一致。
 */
function planRepeatedly(
  times: number,
  overrides: Partial<AutoTrialRunInput> = {},
): AutoTrialRunOutcome[] {
  const base = input(overrides)
  let consumedRoundId: number | null = null
  const outcomes: AutoTrialRunOutcome[] = []
  for (let index = 0; index < times; index += 1) {
    const plan = planAutoTrialRun({ ...base, consumedRoundId })
    outcomes.push(plan.outcome)
    if (plan.consume) {
      consumedRoundId = base.roundId
    }
  }
  return outcomes
}

describe('生成结束后的自动试运行', () => {
  it('默认值齐全时自动触发一次', () => {
    const plan = planAutoTrialRun(input())
    expect(plan.outcome).toBe('run')
    expect(plan.consume).toBe(true)
    expect(plan.notice).toBe('生成完成，已自动试运行。')
  })

  it('缺必填且无默认值时不触发', () => {
    const plan = planAutoTrialRun(input({ variables: [variable()] }))
    expect(plan.outcome).toBe('skipped')
    expect(plan.consume).toBe(true)
    expect(plan.notice).toContain('必填变量没有默认值')
  })

  it('没有必填变量时也自动触发', () => {
    const plan = planAutoTrialRun(
      input({
        variables: [
          variable({ name: 'note', label: '补充说明', required: false }),
          variable({
            name: 'tone',
            label: '语气',
            type: 'enum',
            required: false,
            options: ['正式', '简洁'],
          }),
        ],
      }),
    )
    expect(plan.outcome).toBe('run')
  })

  it('无可用模型时不触发并在试运行区给原因', () => {
    const plan = planAutoTrialRun(input({ availability: UNAVAILABLE }))
    expect(plan.outcome).toBe('unavailable')
    expect(plan.consume).toBe(true)
    expect(plan.notice).toContain(UNAVAILABLE.reason)
    expect(plan.notice).not.toContain('！')
  })

  it('用户停止后本轮不再触发', () => {
    const stopped = planAutoTrialRun(input({ stopped: true }))
    expect(stopped.outcome).toBe('skipped')
    expect(stopped.consume).toBe(true)
    expect(stopped.notice).toContain('已停止生成本轮')

    // 停止后即使阶段又走完，本轮已经消费过，不会补跑。
    const afterRetry = planAutoTrialRun(
      input({ stopped: false, consumedRoundId: 7 }),
    )
    expect(afterRetry.outcome).toBe('duplicate')
  })

  it('可用性还在探测时先等待，不占用自动触发的机会', () => {
    const waiting = planAutoTrialRun(input({ availability: LOADING }))
    expect(waiting.outcome).toBe('waiting')
    expect(waiting.consume).toBe(false)

    const ready = planAutoTrialRun(
      input({ availability: READY, consumedRoundId: null }),
    )
    expect(ready.outcome).toBe('run')
  })

  it('字段重算进行中先等待，不打断主流程', () => {
    const waiting = planAutoTrialRun(input({ disabled: true }))
    expect(waiting.outcome).toBe('waiting')
    expect(waiting.consume).toBe(false)
  })

  it('重渲染与重复判定不会重复触发', () => {
    expect(planRepeatedly(4)).toEqual([
      'run',
      'duplicate',
      'duplicate',
      'duplicate',
    ])
  })

  it('新一轮生成可以重新自动触发一次', () => {
    const nextRound = planAutoTrialRun(
      input({ roundId: 8, consumedRoundId: 7 }),
    )
    expect(nextRound.outcome).toBe('run')
    expect(nextRound.consume).toBe(true)
  })

  it('阶段不是 done 时不触发，也不消费轮次', () => {
    for (const phase of ['idle', 'streaming', 'stopped', 'error'] as const) {
      const plan = planAutoTrialRun(input({ phase }))
      expect(plan.outcome).toBe('idle')
      expect(plan.consume).toBe(false)
    }
  })

  it('变量条件与触发条件使用同一份默认值判定', () => {
    expect(variablesHaveDefaults(input().variables)).toBe(true)
    expect(variablesHaveDefaults([variable()])).toBe(false)
  })
})
