import { PromptPilotSchemaV1, type PromptSchema, type TaskType, type OutputFormat, type Assumption } from './schema'
import { FORMAT_LABELS, TASK_TYPE_LABELS } from './render'

/**
 * 离线启发式 composer。
 *
 * 约束：
 * 1. 完全确定性，同一输入永远得到同一输出；
 * 2. 不读环境变量、不发网络请求、不调用任何模型 API；
 * 3. 只负责填出合法的 PromptPilot Schema v1，流式节奏与错误处理在路由层。
 *
 * 它对应 ARCHITECTURE.md 第十三节的 L1 离线模式：从需求里抽取任务动词、
 * 领域词与交付物类型，按场景模板填出八字段骨架。
 */

export const MAX_REQUIREMENT_LENGTH = 4000
export const MIN_REQUIREMENT_LENGTH = 2

export class ComposeInputError extends Error {
  readonly code = 'INVALID_INPUT'

  constructor(message: string) {
    super(message)
    this.name = 'ComposeInputError'
  }
}

interface TaskProfile {
  role: string
  criteria: readonly string[]
  must: string
  scopeIn: readonly string[]
  scopeOut: string
  sections: readonly string[]
  length: string
  audience: string
}

const TASK_PROFILES: Record<TaskType, TaskProfile> = {
  qa: {
    role: '信息顾问',
    criteria: ['先给结论，再给依据与必要的补充说明。'],
    must: '回答前先判断问题是否需要澄清，需要时列出缺失信息。',
    scopeIn: ['问题的直接答案', '必要的背景解释'],
    scopeOut: '不回答与问题无关的延伸话题。',
    sections: ['结论', '依据', '补充说明'],
    length: '200 到 400 字',
    audience: '提出问题的普通读者',
  },
  writing: {
    role: '资深内容编辑',
    criteria: ['结构完整，开头点题，段落之间逻辑连贯。', '语气与受众匹配，避免模板化套话。'],
    must: '开头直接给出主题与结论，不写空泛铺垫。',
    scopeIn: ['按要求完成文稿', '按受众调整语气与信息密度'],
    scopeOut: '不编造事实与引用。',
    sections: ['标题', '正文', '要点摘要'],
    length: '400 到 800 字',
    audience: '普通读者',
  },
  coding: {
    role: '软件工程师',
    criteria: ['代码可运行，包含必要的错误处理。', '给出使用说明与关键设计取舍。'],
    must: '代码遵循目标语言的主流风格与命名约定。',
    scopeIn: ['实现需求描述的代码', '必要的测试或验证说明'],
    scopeOut: '不引入需求未要求的依赖与框架。',
    sections: ['实现思路', '代码', '使用说明', '验证方式'],
    length: '按需，代码不超过 200 行',
    audience: '后续维护代码的工程师',
  },
  analysis: {
    role: '数据分析师',
    criteria: ['结论有数据或原文依据，区分事实、推断与假设。', '指出数据缺口与结论的适用边界。'],
    must: '先给结论，再给证据链，最后给风险与假设。',
    scopeIn: ['对给定数据或材料做分析', '给出可执行的建议'],
    scopeOut: '不在缺少数据时给出确定性结论。',
    sections: ['结论', '依据', '风险与假设', '建议'],
    length: '500 到 900 字',
    audience: '需要据此做决策的业务负责人',
  },
  extraction: {
    role: '信息抽取专员',
    criteria: ['字段齐全，缺失值明确标注，不臆造内容。', '输出可被程序直接解析。'],
    must: '只输出抽取结果与必要的缺失说明。',
    scopeIn: ['按约定字段抽取信息', '标注缺失与不确定字段'],
    scopeOut: '不补充原文没有的信息。',
    sections: ['字段结果', '缺失项', '不确定项'],
    length: '只输出结果，不写解释',
    audience: '下游数据处理程序',
  },
  conversation: {
    role: '客服质量负责人',
    criteria: ['回复覆盖用户核心诉求，并给出下一步动作。', '语气与品牌和场景匹配。'],
    must: '先共情再解决问题，避免推诿与空话。',
    scopeIn: ['生成可直接发送的回复话术', '覆盖用户可能的追问'],
    scopeOut: '不承诺无法履约的补偿或时限。',
    sections: ['回复话术', '可选追问', '注意事项'],
    length: '100 到 200 字',
    audience: '提出问题的用户',
  },
  planning: {
    role: '项目规划师',
    criteria: ['步骤可执行，包含负责人、时间与验收点。', '标出依赖关系与主要风险。'],
    must: '按时间或依赖顺序组织步骤。',
    scopeIn: ['给出可执行的计划与步骤', '标出里程碑与验收标准'],
    scopeOut: '不安排未确认的资源与预算。',
    sections: ['目标', '步骤', '时间与负责人', '验收标准', '风险'],
    length: '按步骤列出，不超过 12 步',
    audience: '参与执行的团队成员',
  },
  transformation: {
    role: '文字编辑',
    criteria: ['保留原意与关键信息，改动点可逐条说明。', '改写后的文本符合目标语气与格式。'],
    must: '先列出改动原则，再给出改写结果。',
    scopeIn: ['按要求改写文本', '说明主要改动'],
    scopeOut: '不改变原文事实与立场。',
    sections: ['改动说明', '改写结果', '保留项'],
    length: '与原文篇幅相当',
    audience: '原文的目标读者',
  },
  other: {
    role: '任务执行者',
    criteria: ['结果满足需求描述，可直接复制使用。', '结构与格式清晰，便于核对。'],
    must: '先确认交付物形态，再组织内容。',
    scopeIn: ['完成需求描述的任务', '按指定格式交付'],
    scopeOut: '不扩展需求之外的功能。',
    sections: ['结果', '说明'],
    length: '300 到 600 字',
    audience: '普通读者',
  },
}

interface TaskRule {
  type: TaskType
  weight: number
  keywords: readonly string[]
}

/**
 * 顺序即优先级。分数相同时排在前面的规则生效。
 * transformation 加权，避免「客服话术改成」被 conversation 抢走。
 */
const TASK_RULES: readonly TaskRule[] = [
  {
    type: 'coding',
    weight: 1,
    keywords: [
      '代码', '函数', '接口', '重构', '调试', '脚本', '组件', '算法', '单元测试',
      '报错', 'typescript', 'javascript', 'python', 'java', 'golang', 'rust', 'sql',
      'api', 'bug',
    ],
  },
  {
    type: 'extraction',
    weight: 1,
    keywords: ['抽取', '提取', '解析', '结构化', '字段', '表单', 'csv', 'json', '清洗'],
  },
  {
    type: 'transformation',
    weight: 2,
    keywords: ['改写', '润色', '翻译', '转换成', '改成', '转换', '压缩', '扩写', '精简', '重写', '改一版'],
  },
  {
    type: 'planning',
    weight: 1,
    keywords: ['计划', '规划', '排期', '议程', '方案', '安排', '步骤', '里程碑', '路线图', '发布会'],
  },
  {
    type: 'conversation',
    weight: 1,
    keywords: ['客服', '话术', '对话', '聊天', '回复用户', '投诉', '沟通'],
  },
  {
    type: 'analysis',
    weight: 1,
    keywords: ['分析', '评估', '对比', '复盘', '诊断', '指标', '数据', '洞察', '调研', '报告'],
  },
  {
    type: 'writing',
    weight: 1,
    keywords: ['写', '文案', '文章', '周报', '邮件', '总结', '剧本', '标题', '宣传', '介绍', 'ppt', '作文', '博客'],
  },
  {
    type: 'qa',
    weight: 1,
    keywords: ['是什么', '什么是', '为什么', '如何', '怎么', '解释', '回答', '问答', '科普'],
  },
]

const DOMAIN_RULES: readonly { label: string; keywords: readonly string[] }[] = [
  { label: '产品', keywords: ['产品', '需求', 'prd', '评审'] },
  { label: '客服', keywords: ['客服', '话术', '投诉', '用户反馈'] },
  { label: '营销', keywords: ['营销', '推广', '广告', '品牌', '增长'] },
  { label: '数据', keywords: ['数据', '指标', '报表', '统计', '销售'] },
  {
    label: '软件研发',
    keywords: ['代码', '函数', '接口', '架构', '重构', 'typescript', 'javascript', 'python', 'sql', '工程'],
  },
  { label: '内容', keywords: ['文章', '周报', '文案', '选题', '博客', '邮件', '剧本'] },
  { label: '教育', keywords: ['课程', '教学', '学生', '培训'] },
  { label: '招聘', keywords: ['招聘', '面试', '简历', '候选人'] },
  { label: '运营', keywords: ['运营', '活动', '用户增长'] },
  { label: '项目', keywords: ['项目', '排期', '里程碑', '计划'] },
]

const DEFAULT_DOMAIN: Record<TaskType, string> = {
  qa: '通用知识',
  writing: '内容创作',
  coding: '软件研发',
  analysis: '数据分析',
  extraction: '数据处理',
  conversation: '客户服务',
  planning: '项目执行',
  transformation: '文字编辑',
  other: '通用',
}

const LEADING_TITLE_PATTERNS: readonly RegExp[] = [
  /^请(你)?/u,
  /^麻烦/u,
  /^帮我/u,
  /^帮忙/u,
  /^我想/u,
  /^我需要/u,
  /^需要/u,
  /^能否/u,
  /^可以/u,
  /^给我/u,
  /^把/u,
  /^写一份/u,
  /^写一个/u,
  /^写一篇/u,
  /^写个/u,
  /^写篇/u,
  /^写段/u,
  /^写一段/u,
  /^做个/u,
  /^做一个/u,
  /^生成一份/u,
  /^生成一个/u,
]

/** 去掉控制字符、零宽字符，统一换行与空白。不做静默截断。 */
export function normalizeRequirement(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function classifyTaskType(requirement: string): TaskType {
  const lower = requirement.toLowerCase()
  let bestType: TaskType = 'other'
  let bestScore = 0

  for (const rule of TASK_RULES) {
    let score = 0
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += keyword.length * rule.weight
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestType = rule.type
    }
  }

  return bestType
}

function detectDomain(requirement: string): string {
  const lower = requirement.toLowerCase()
  for (const rule of DOMAIN_RULES) {
    if (rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
      return rule.label
    }
  }
  return ''
}

function detectLanguage(requirement: string): 'zh' | 'en' {
  const cjk = (requirement.match(/[\u3400-\u9fff]/g) ?? []).length
  const latin = (requirement.match(/[a-z]/gi) ?? []).length
  return cjk === 0 && latin > 0 ? 'en' : 'zh'
}

function detectOutputFormat(requirement: string, taskType: TaskType): OutputFormat {
  const lower = requirement.toLowerCase()
  if (lower.includes('yaml')) {
    return 'yaml'
  }
  if (lower.includes('xml')) {
    return 'xml'
  }
  if (lower.includes('json')) {
    return 'json'
  }
  if (/(表格|清单|对比表|csv)/u.test(requirement)) {
    return 'table'
  }
  if (taskType === 'coding') {
    return 'code'
  }
  if (taskType === 'extraction') {
    return 'json'
  }
  return 'markdown'
}

function inferAudience(requirement: string, profile: TaskProfile): string {
  // 「的」是最可靠的边界，优先按它切；没有「的」才退回动作词。
  // 只按动作词切会把「面向普通读者」截成「普通」，因为「读」也是终止符。
  const withParticle = requirement.match(
    /(?:给|面向|供)([^，。；\n]{1,16}?)的/u,
  )
  const withVerb = requirement.match(
    /(?:给|面向|供)([^，。；\n的]{1,16}?)(?:看|读|用|使用|参考)/u,
  )
  const inferred = (withParticle?.[1] ?? withVerb?.[1])?.trim()
  if (inferred && inferred.length >= 2) {
    return inferred
  }
  return profile.audience
}

/**
 * 从需求里读显式篇幅要求。用户写了「1000 字左右」就按 1000 字，
 * 不能拿场景模板的默认值覆盖掉用户已经说清楚的事。
 */
function inferLength(requirement: string, profile: TaskProfile): string {
  const range = requirement.match(
    /(\d{1,4})\s*(?:到|至|-|~|～|—)\s*(\d{1,4})\s*字/u,
  )
  if (range?.[1] && range[2]) {
    return `${range[1]} 到 ${range[2]} 字`
  }

  // 前置限定词：「不超过 300 字」「至少 2000 字」
  const prefixed = requirement.match(
    /(不超过|不少于|至少|最多)\s*(\d{1,4})\s*字/u,
  )
  if (prefixed?.[1] && prefixed[2]) {
    const upper = prefixed[1] === '不超过' || prefixed[1] === '最多'
    return upper ? `不超过 ${prefixed[2]} 字` : `至少 ${prefixed[2]} 字`
  }

  const single = requirement.match(/(\d{1,4})\s*字\s*(左右|以内|以上|以下)?/u)
  if (single?.[1]) {
    const count = single[1]
    switch (single[2]) {
      case '左右':
        return `${count} 字左右`
      case '以内':
      case '以下':
        return `不超过 ${count} 字`
      case '以上':
        return `至少 ${count} 字`
      default:
        return `约 ${count} 字`
    }
  }

  const words = requirement.match(/(\d{1,5})\s*(?:words?|词)/iu)
  if (words?.[1]) {
    return `约 ${words[1]} 词`
  }

  return profile.length
}

function summarize(requirement: string, maxLength: number): string {
  const firstSentence = requirement.split(/[。！？!?\n]/u)[0]?.trim() ?? requirement
  const trimmed = firstSentence.replace(/[。！？!?，,、；;：:]+$/u, '').trim()
  return Array.from(trimmed || requirement).slice(0, maxLength).join('')
}

function deriveTitle(requirement: string, taskType: TaskType): string {
  const firstLine = requirement.split('\n')[0] ?? requirement
  let title = firstLine.replace(/^#{1,6}\s*/u, '').trim()

  for (let round = 0; round < 3; round += 1) {
    for (const pattern of LEADING_TITLE_PATTERNS) {
      title = title.replace(pattern, '').trim()
    }
  }

  title = title
    .replace(/^[“”"'「」『』]/u, '')
    .replace(/[。！？!?，,、；;：:]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (title.length < MIN_REQUIREMENT_LENGTH) {
    title = `${TASK_TYPE_LABELS[taskType]}任务`
  }

  return Array.from(title).slice(0, 28).join('')
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function withCurrent(candidates: readonly string[], current: string): string[] {
  return unique([current, ...candidates])
}

function buildAssumptions(params: {
  outputLanguage: string
  length: string
  audience: string
  format: OutputFormat
}): Assumption[] {
  return [
    {
      path: 'output.language',
      label: '输出语言',
      value: params.outputLanguage,
      candidates: withCurrent(['中文', '英文'], params.outputLanguage),
      source: 'default',
    },
    {
      path: 'output.length',
      label: '长度量级',
      value: params.length,
      candidates: withCurrent(
        ['300 到 600 字', '600 到 1200 字', '按需'],
        params.length,
      ),
      source: 'default',
    },
    {
      path: 'context.audience',
      label: '受众',
      value: params.audience,
      candidates: withCurrent(
        ['普通读者', '团队成员', '业务负责人', '下游程序'],
        params.audience,
      ),
      source: 'default',
    },
    {
      path: 'output.format',
      label: '输出格式',
      value: FORMAT_LABELS[params.format],
      candidates: withCurrent(
        ['Markdown', 'JSON', '表格', '纯文本'],
        FORMAT_LABELS[params.format],
      ),
      source: 'default',
    },
  ]
}

/**
 * 把一句话需求确定性填成八字段结构。
 *
 * @throws {ComposeInputError} 输入为空、过短或超过 4000 字符。
 */
export function composePrompt(rawRequirement: string): PromptSchema {
  const requirement = normalizeRequirement(rawRequirement)
  const length = Array.from(requirement).length

  if (length < MIN_REQUIREMENT_LENGTH) {
    throw new ComposeInputError('需求至少需要 2 个字符。')
  }
  if (length > MAX_REQUIREMENT_LENGTH) {
    throw new ComposeInputError(`需求不能超过 ${MAX_REQUIREMENT_LENGTH} 个字符。`)
  }

  const taskType = classifyTaskType(requirement)
  const profile = TASK_PROFILES[taskType]
  const domain = detectDomain(requirement) || DEFAULT_DOMAIN[taskType]
  const language = detectLanguage(requirement)
  const outputLanguage = language === 'zh' ? '中文' : '英文'
  const outputFormat = detectOutputFormat(requirement, taskType)
  const audience = inferAudience(requirement, profile)
  const outputLength = inferLength(requirement, profile)
  const title = deriveTitle(requirement, taskType)
  const subject = summarize(requirement, 80) || title
  const tone = '专业、克制、直接'

  const successCriteria = unique([
    `结果直接回应「${subject}」，不偏离需求范围。`,
    ...profile.criteria,
    `输出符合 ${FORMAT_LABELS[outputFormat]} 格式与「${outputLength}」的长度要求。`,
  ])

  const must = unique([
    '先确认任务目标、受众与交付格式，再开始输出。',
    '所有事实性结论给出依据；无法确认的信息明确标注为假设。',
    profile.must,
  ])

  const mustNot = [
    '不编造未提供的事实、数据或引用。',
    '不使用空泛形容词与模糊限定词。',
    '不输出与任务无关的扩展内容。',
  ]

  const scopeIn = unique([subject, ...profile.scopeIn])
  const scopeOut = unique([
    profile.scopeOut,
    '不处理需求之外的额外功能与话题。',
    '不代替用户做未授权的最终决定。',
  ])

  const assumptions = buildAssumptions({
    outputLanguage,
    length: outputLength,
    audience,
    format: outputFormat,
  })

  const raw = {
    schemaVersion: 'pp-schema-v1' as const,
    meta: {
      title,
      taskType,
      language,
      mode: Array.from(requirement).length > 120 ? ('improve' as const) : ('generate' as const),
      templateId: 'offline-heuristic-v1',
    },
    assumptions,
    role: {
      persona: `你是一名${domain}方向的${profile.role}。`,
      expertise: `${domain}领域的任务拆解、结构化表达与质量核对。`,
      stance: '先确认目标与边界，再交付结果；不确定的信息明确标注。',
    },
    objective: {
      goal: `围绕「${subject}」完成任务，交付可直接采用的结果。`,
      successCriteria,
      nonGoals: [
        '不扩展需求之外的功能。',
        '不代替用户做未授权的最终决定。',
      ],
    },
    context: {
      background: `用户原始需求：${requirement}\n当前没有额外的背景材料，按通用场景处理。`,
      audience,
      knownFacts: ['需求原文由用户提供，尚未经过额外核实。'],
      missingInputPolicy: '先列出缺失项并询问，不要自行编造。',
    },
    input: {
      variables: [],
    },
    constraints: {
      must,
      mustNot,
      boundaries: {
        scopeIn,
        scopeOut,
        knowledgePolicy:
          '先列出缺失项并向用户确认，不猜测事实；无法确认时明确说明不确定。',
        ambiguityPolicy:
          '先列出候选解释与推荐选项，请用户确认后再继续。',
        formatBoundary: `${FORMAT_LABELS[outputFormat]}，${outputLength}。`,
        safetyBoundary:
          '不输出违法、侵权、歧视或泄露隐私的内容；涉及个人信息时先提示脱敏。',
      },
      priority: [
        '事实准确性高于表达流畅度。',
        '用户明确约束高于模板默认值。',
        '安全边界高于任务完成度。',
      ],
    },
    output: {
      format: outputFormat,
      schema:
        outputFormat === 'json'
          ? '返回合法 JSON，不要包裹 Markdown 代码围栏。字段名使用英文，值使用输出语言。'
          : outputFormat === 'table'
            ? '使用 Markdown 表格，首行为表头，每行列数一致。'
            : undefined,
      sections: [...profile.sections],
      length: outputLength,
      language: outputLanguage,
      tone,
    },
    examples: {
      items: [],
      negative: [
        {
          input: '帮我写点东西',
          badOutput: '好的，以下是一些内容。',
          why: '目标、受众与格式都不明确，输出无法核对。',
        },
      ],
    },
    selfCheck: {
      checklist: [
        `输出是否直接回应了「${subject}」？`,
        '是否满足格式、长度与受众约束？',
        '不确定的信息是否已经标注？',
        '是否包含需求之外的扩展内容？',
      ],
      onFail: '先修正再输出；无法修正时说明原因并给出可选方案。',
    },
  }

  // 契约校验放在 composer 内部，保证流式层拿到的永远是合法文档。
  return PromptPilotSchemaV1.parse(raw)
}
