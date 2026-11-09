import { z } from 'zod'

/**
 * PromptPilot Schema v1
 *
 * 这是产品的核心资产，也是前后端唯一的契约。
 * 改动此文件必须同步 `docs/ARCHITECTURE.md` 6.2，并升 schemaVersion。
 *
 * 设计要点：
 * 1. 八个字段，缺一不可（有默认值的除外）。
 * 2. 「边界清晰」不是一句话，而是 constraints.boundaries 下六个必须回答的问题。
 * 3. assumptions 是生成期的决定，必须显式，可事后纠正；它与 context.knownFacts 不是一回事。
 */

export const TASK_TYPES = [
  'qa',
  'writing',
  'coding',
  'analysis',
  'extraction',
  'conversation',
  'planning',
  'transformation',
  'other',
] as const

export const OUTPUT_FORMATS = [
  'markdown',
  'json',
  'yaml',
  'table',
  'plain',
  'code',
  'xml',
] as const

export const VARIABLE_TYPES = [
  'text',
  'longtext',
  'number',
  'enum',
  'json',
  'boolean',
] as const

export const FIELD_LABELS = {
  role: '角色',
  objective: '目标',
  context: '上下文',
  input: '输入与变量',
  constraints: '约束与边界',
  output: '输出格式',
  examples: '示例',
  selfCheck: '自检',
} as const

export type FieldKey = keyof typeof FIELD_LABELS
export const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[]

const VariableSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, '变量名只能包含字母、数字与下划线，且不能以数字开头'),
  label: z.string().min(1),
  type: z.enum(VARIABLE_TYPES),
  required: z.boolean().default(true),
  defaultValue: z.string().optional(),
  options: z.array(z.string()).optional(),
  description: z.string().optional(),
})

/** 生成期假设：模型替用户做的决定，必须可见、可改 */
export const AssumptionSchema = z.object({
  path: z.string().min(1),          // 影响哪个字段，如 'output.language'
  label: z.string().min(1),         // 展示给用户的名字，如 '输出语言'
  value: z.string(),                // 当前取值
  candidates: z.array(z.string()).default([]),
  source: z.enum(['default', 'inferred', 'user']).default('inferred'),
})

export const PromptPilotSchemaV1 = z.object({
  schemaVersion: z.literal('pp-schema-v1'),

  meta: z.object({
    title: z.string().min(2),
    taskType: z.enum(TASK_TYPES),
    language: z.enum(['zh', 'en', 'auto']),
    mode: z.enum(['generate', 'improve']).default('generate'),
    templateId: z.string().optional(),
  }),

  assumptions: z.array(AssumptionSchema).default([]),

  // 1 角色
  role: z.object({
    persona: z.string().min(2),
    expertise: z.string().optional(),
    stance: z.string().optional(),
  }),

  // 2 目标
  objective: z.object({
    goal: z.string().min(4),
    successCriteria: z.array(z.string().min(1)).min(1),
    nonGoals: z.array(z.string()).default([]),
  }),

  // 3 上下文
  context: z.object({
    background: z.string(),
    audience: z.string().optional(),
    knownFacts: z.array(z.string()).default([]),
    missingInputPolicy: z.string().optional(),
  }),

  // 4 输入与变量
  input: z.object({
    variables: z.array(VariableSchema).default([]),
  }),

  // 5 约束与边界（本产品的重点）
  constraints: z.object({
    must: z.array(z.string()).default([]),
    mustNot: z.array(z.string()).default([]),
    boundaries: z.object({
      scopeIn: z.array(z.string().min(1)).min(1),
      scopeOut: z.array(z.string().min(1)).min(1),
      knowledgePolicy: z.string().min(1),
      ambiguityPolicy: z.string().min(1),
      formatBoundary: z.string().optional(),
      safetyBoundary: z.string().optional(),
    }),
    priority: z.array(z.string()).default([]),
  }),

  // 6 输出格式
  output: z.object({
    format: z.enum(OUTPUT_FORMATS),
    schema: z.string().optional(),
    sections: z.array(z.string()).default([]),
    length: z.string().optional(),
    language: z.string().optional(),
    tone: z.string().optional(),
  }),

  // 7 示例
  examples: z
    .object({
    items: z
      .array(
        z.object({
          input: z.string(),
          output: z.string(),
          note: z.string().optional(),
        }),
      )
      .default([]),
    negative: z
      .array(
        z.object({
          input: z.string(),
          badOutput: z.string(),
          why: z.string(),
        }),
      )
      .default([]),
    })
    .default({ items: [], negative: [] }),

  // 8 自检
  selfCheck: z
    .object({
      checklist: z.array(z.string()).default([]),
      onFail: z.string().optional(),
    })
    .default({ checklist: [] }),

  linter: z
    .object({
      suppressions: z.array(z.string()).default([]),
      severityOverride: z.record(z.string(), z.string()).default({}),
    })
    .default({ suppressions: [], severityOverride: {} }),
})

export type PromptSchema = z.infer<typeof PromptPilotSchemaV1>
export type Assumption = z.infer<typeof AssumptionSchema>
export type PromptVariable = z.infer<typeof VariableSchema>
export type TaskType = (typeof TASK_TYPES)[number]
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

/** 解析失败时返回结构化错误，供修复重试使用 */
export function parsePromptSchema(input: unknown) {
  return PromptPilotSchemaV1.safeParse(input)
}

/** 构造一份最小可用骨架，供离线模板模式与测试使用 */
export function createSkeletonSchema(
  title: string,
  taskType: TaskType = 'other',
): PromptSchema {
  return PromptPilotSchemaV1.parse({
    schemaVersion: 'pp-schema-v1',
    meta: { title, taskType, language: 'zh', mode: 'generate' },
    role: { persona: '待补充' },
    objective: { goal: '待补充任务目标', successCriteria: ['待补充'] },
    context: { background: '待补充' },
    input: { variables: [] },
    constraints: {
      boundaries: {
        scopeIn: ['待补充'],
        scopeOut: ['待补充'],
        knowledgePolicy: '信息不足时先提问，不要编造。',
        ambiguityPolicy: '存在多种理解时列出选项并请用户确认。',
      },
    },
    output: { format: 'markdown' },
  })
}
