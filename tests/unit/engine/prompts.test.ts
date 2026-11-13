import { describe, expect, it } from 'vitest'
import { buildGenerateMessages } from '@/lib/engine/prompts/generate'
import { buildOptimizeMessages } from '@/lib/engine/prompts/optimize'
import { buildRepairMessages } from '@/lib/engine/prompts/repair'
import { META_SEPARATOR } from '@/lib/engine/prompts/meta'

describe('v3 系统提示词', () => {
  it('generate：system 含分隔符协议与元数据 JSON 形状，user 含需求与目标类型', () => {
    const { system, user } = buildGenerateMessages({
      sourceInput: '帮我写个周报',
      targetType: 'text',
    })
    expect(system).toContain(META_SEPARATOR)
    expect(system).toContain('"title"')
    expect(system).toContain('"notes"')
    expect(user).toContain('帮我写个周报')
    expect(user).toContain('文本')
  })

  it('generate 图片/视频目标类型要求构图、风格、光线、镜头维度', () => {
    for (const targetType of ['image', 'video'] as const) {
      const { system } = buildGenerateMessages({ sourceInput: 'x', targetType })
      expect(system).toContain('构图')
      expect(system).toContain('风格')
      expect(system).toContain('光线')
      expect(system).toContain('镜头')
    }
  })

  it('optimize：无要求时执行通用优化分支', () => {
    const { user } = buildOptimizeMessages({ sourceInput: '原提示词' })
    expect(user).toContain('原提示词')
    expect(user).toContain('通用优化')
  })

  it('optimize：带要求时要求进入 user 消息', () => {
    const { user } = buildOptimizeMessages({ sourceInput: '原提示词', instruction: '更严格' })
    expect(user).toContain('更严格')
  })

  it('repair：检查问题逐条进入 user 消息', () => {
    const { user } = buildRepairMessages({
      sourceInput: '原提示词',
      issues: [
        { id: 'R101', level: 'warn', message: '含模糊词「尽量」', suggestion: '改为可验证的表述' },
      ],
    })
    expect(user).toContain('R101')
    expect(user).toContain('尽量')
    expect(user).toContain('改为可验证的表述')
  })

  it('所有 system 都要求 notes 最多 3 条且不含正文', () => {
    const systems = [
      buildGenerateMessages({ sourceInput: 'x', targetType: 'text' }).system,
      buildOptimizeMessages({ sourceInput: 'x' }).system,
      buildRepairMessages({ sourceInput: 'x', issues: [] }).system,
    ]
    for (const system of systems) {
      expect(system).toContain('最多 3 条')
      expect(system).not.toContain('！')
      expect(system).not.toContain('——')
    }
  })
})
