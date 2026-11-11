import type { IconName } from '@/components/ui/Icon'

/**
 * 场景模板的唯一来源。模板页与工作台入口共用同一份定义，
 * 避免示例文案与图标在两处漂移（PRODUCT.md FR-2.3）。
 */
export interface SceneTemplate {
  /** 稳定标识，出现在 `/studio?template=` 查询参数里，不随文案改名。 */
  id: string
  name: string
  note: string
  sample: string
  icon: IconName
  tint: string
  iconBox: string
  featured?: boolean
}

export const SCENE_TEMPLATES: readonly SceneTemplate[] = [
  {
    id: 'general-qa',
    name: '通用问答',
    note: '需要明确受众与答案粒度，避免泛泛而谈',
    sample: '解释一下什么是向量数据库，面向非技术读者。',
    icon: 'spark',
    tint: 'bg-tint-gold',
    iconBox: 'size-10',
  },
  {
    id: 'content',
    name: '内容创作',
    note: '强调语气、篇幅与禁用词，边界比风格更重要',
    sample: '帮我写一篇关于远程办公的产品博客。',
    icon: 'studio',
    tint: 'bg-tint-red',
    iconBox: 'size-16',
    featured: true,
  },
  {
    id: 'code',
    name: '代码生成',
    note: '锁定语言版本、依赖与错误处理方式',
    sample: '用 TypeScript 写一个解析 CSV 的函数，包含错误处理。',
    icon: 'terminal',
    tint: 'bg-tint-purple',
    iconBox: 'size-12',
  },
  {
    id: 'data',
    name: '数据分析',
    note: '规定口径、缺失值处理与结论的置信表述',
    sample: '分析这份月度销售数据，找出下降原因。',
    icon: 'eval',
    tint: 'bg-tint-green',
    iconBox: 'size-10',
  },
  {
    id: 'support',
    name: '客服对话',
    note: '必须写清越界话术与转人工条件',
    sample: '把这段客服话术改成更专业的版本。',
    icon: 'library',
    tint: 'bg-tint-gold',
    iconBox: 'size-9',
  },
  {
    id: 'extraction',
    name: '结构化抽取',
    note: '字段、类型、缺失与冲突优先级要逐条定义',
    sample: '从订单邮件里抽取订单号、金额和收货城市。',
    icon: 'template',
    tint: 'bg-tint-purple',
    iconBox: 'size-14',
  },
]

/** 解析 `/studio?template=` 的值；未知或重复参数一律当作没选模板。 */
export function findSceneTemplate(
  id: string | string[] | undefined,
): SceneTemplate | null {
  if (typeof id !== 'string') {
    return null
  }
  return SCENE_TEMPLATES.find((template) => template.id === id) ?? null
}