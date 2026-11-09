import { PromptPilotSchemaV1, type PromptSchema } from '@/lib/engine/schema'

/**
 * lint 单测的基准 schema：刻意做成「16 条规则都不触发」的干净样本。
 * 每条正例测试先拿一份新的 fixture，再只改与目标规则相关的一个字段，
 * 这样断言不会被其他规则干扰。
 */
export function createLintFixture(): PromptSchema {
  return PromptPilotSchemaV1.parse({
    schemaVersion: 'pp-schema-v1',
    meta: {
      title: '季度经营分析',
      taskType: 'analysis',
      language: 'zh',
    },
    role: {
      persona: '资深经营分析师，擅长从财务数据中提炼结论',
      expertise: '经营分析与财务建模',
      stance: '结论先行，证据优先',
    },
    objective: {
      goal: '基于给定的季度经营数据，输出一份包含结论、依据与风险提示的分析',
      successCriteria: [
        '结论逐条对应经营数据中的指标',
        '每个判断都标注数据来源与计算口径',
      ],
      nonGoals: ['不做下一年度预算'],
    },
    context: {
      background: '团队需要在周会上汇报季度经营情况，读者是管理层。',
      audience: '管理层',
      knownFacts: ['数据来自财务系统导出'],
      missingInputPolicy: '缺少季度数据时先列出需要补充的字段。',
    },
    input: { variables: [] },
    constraints: {
      must: [
        '结论先行，正文按结论、依据、风险三部分组织',
        '引用数据时标注口径与时间范围',
      ],
      mustNot: ['不使用未经确认的预测数字'],
      boundaries: {
        scopeIn: ['只分析本季度经营数据'],
        scopeOut: ['不做人员绩效评价', '不讨论下一年度预算'],
        knowledgePolicy: '信息不足时明确说明缺少哪些数据并提问，不编造数字。',
        ambiguityPolicy: '指标口径存在多种解释时列出候选口径并请用户确认。',
        formatBoundary: '正文使用 Markdown 标题与列表，不插入图片。',
        safetyBoundary: '不输出任何个人敏感信息。',
      },
      priority: ['数据准确性优先于篇幅'],
    },
    output: {
      format: 'markdown',
      sections: ['结论', '依据', '风险'],
      length: '正文不超过 1000 字',
      language: '中文',
      tone: '正式、克制',
    },
    examples: { items: [], negative: [] },
    selfCheck: {
      checklist: ['每条结论都能在数据中找到支撑'],
      onFail: '标注未通过的自检项并说明原因。',
    },
  })
}

/**
 * 性能测试样本：把背景扩写到约 4000 字。
 * 填充句刻意不含模糊词、形容词与指代词，避免刷出大量无关发现干扰计时。
 */
export function createLargeLintFixture(targetChars = 4000): PromptSchema {
  const schema = createLintFixture()
  const filler = '本季度华东区收入同比增长百分之十二，主要来自续费客户，成本结构保持稳定。'
  let background = schema.context.background

  while (Array.from(background).length < targetChars) {
    background += filler
  }

  schema.context.background = background
  return schema
}

/** 统计 schema 正文总字符数，性能断言用它确认样本规模 */
export function countBodyChars(schema: PromptSchema): number {
  return Array.from(
    [
      schema.meta.title,
      schema.role.persona,
      schema.role.expertise ?? '',
      schema.role.stance ?? '',
      schema.objective.goal,
      ...schema.objective.successCriteria,
      ...schema.objective.nonGoals,
      schema.context.background,
      schema.context.audience ?? '',
      ...schema.context.knownFacts,
      schema.context.missingInputPolicy ?? '',
      ...schema.constraints.must,
      ...schema.constraints.mustNot,
      ...schema.constraints.boundaries.scopeIn,
      ...schema.constraints.boundaries.scopeOut,
      schema.constraints.boundaries.knowledgePolicy,
      schema.constraints.boundaries.ambiguityPolicy,
      schema.constraints.boundaries.formatBoundary ?? '',
      schema.constraints.boundaries.safetyBoundary ?? '',
      ...schema.constraints.priority,
      schema.output.schema ?? '',
      ...schema.output.sections,
      schema.output.length ?? '',
      schema.output.language ?? '',
      schema.output.tone ?? '',
      ...schema.selfCheck.checklist,
      schema.selfCheck.onFail ?? '',
    ].join(''),
  ).length
}
