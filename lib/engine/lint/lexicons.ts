import type { OutputFormat, TaskType } from '@/lib/engine/schema'

/**
 * 诊断引擎的全部词表与默认值。
 *
 * 约定：模糊词、不可验证形容词、矛盾轴关键词、任务默认值都放在这里，
 * 规则文件只消费词表，不再内联任何自然语言常量。
 * 需要多次匹配的正则一律不带 `g` 标志，由规则侧克隆后使用，避免 lastIndex 状态。
 */

/** R001：模糊限定词（ARCHITECTURE 6.4 原始清单） */
export const FUZZY_QUALIFIERS = [
  '尽量',
  '适当',
  '一些',
  '比较好',
  '相关的',
  '等等',
  '若干',
  '必要时',
] as const

export type FuzzyQualifier = (typeof FUZZY_QUALIFIERS)[number]

/**
 * 自动修复时替换成的文本。空字符串表示删除该限定词。
 * 删除比替换更安全：我们不知道用户想要的具体数值，删掉后语义从“模糊要求”
 * 变成“可执行要求”，不会凭空编造数字。
 */
export const FUZZY_QUALIFIER_REPLACEMENTS: Readonly<Record<FuzzyQualifier, string>> = {
  尽量: '',
  适当: '',
  一些: '',
  比较好: '符合成功标准',
  相关的: '',
  等等: '',
  若干: '',
  必要时: '在满足明确条件时',
}

/** R009：不可验证的形容词 */
export const VAGUE_ADJECTIVES = [
  '专业',
  '高质量',
  '优秀',
  '漂亮',
  '有吸引力',
  '出色',
  '完美',
  '优质',
] as const

export type VagueAdjective = (typeof VAGUE_ADJECTIVES)[number]

/** 每个形容词给一个可核对的判据，修复时直接替换，避免留下空话 */
export const VAGUE_ADJECTIVE_REPLACEMENTS: Readonly<Record<VagueAdjective, string>> = {
  专业: '术语准确、依据可核对',
  高质量: '逐条满足成功标准',
  优秀: '在成功标准上逐条达标',
  漂亮: '版式整齐、层级一致',
  有吸引力: '开头点明读者收益并给出具体例证',
  出色: '在成功标准上逐条达标',
  完美: '逐条满足成功标准',
  优质: '逐条满足成功标准',
}

/** 视为“未填写”的占位文本，用于成功标准、边界策略、明确不做清单 */
export const PLACEHOLDER_TEXTS = [
  '待补充',
  '待填写',
  '待定',
  '暂无',
  'tbd',
  'todo',
  '未填写',
  '无',
  '空',
  '?',
  '？',
  '...',
  '…',
] as const

/** 过于笼统的角色描述；与“少于 6 字”共同触发 R003 */
export const GENERIC_PERSONAS = [
  '助手',
  'ai',
  'ai助手',
  '智能助手',
  '人工智能',
  '模型',
  '专家',
  '专业人士',
  '机器人',
  '你',
  'chatgpt',
] as const

/** R013：只保留工单点名的四个指代词，避免把“其”“此”等高频字也扫进来 */
export const PRONOUN_PATTERN_SOURCE = '(?<![应不活])该(?!当|做|说|不)|它|这个|上述'

/** R013 的先行词候选。刻意保持小而具体，宁可漏报，也不要把正常文本刷成 info */
export const ANTECEDENT_NOUNS = [
  '报告',
  '内容',
  '数据',
  '代码',
  '方案',
  '任务',
  '问题',
  '结果',
  '项目',
  '用户',
  '文本',
  '表格',
  '功能',
  '系统',
  '流程',
  '产品',
  '文档',
  '提示词',
  '分析',
  '结论',
  '建议',
  '方法',
  '步骤',
  '计划',
  '案例',
  '变量',
  '输出',
  '输入',
  '上下文',
  '目标',
  '约束',
  '示例',
  '背景',
  '需求',
  '指标',
] as const

/** R008 详略轴：要求更详细 */
export const DETAIL_HIGH_PATTERNS: readonly RegExp[] = [
  /非常详细/,
  /尽可能详细/,
  /详细展开/,
  /详细/,
  /详尽/,
  /深入/,
  /全面/,
  /细致/,
  /具体到/,
  /逐步/,
  /逐条/,
]

/** R008 详略轴：要求更简洁 */
export const DETAIL_LOW_PATTERNS: readonly RegExp[] = [
  /简洁/,
  /精简/,
  /简短/,
  /简略/,
  /简要/,
  /概要/,
  /概括/,
  /扼要/,
  /只给结论/,
  /一两句话/,
  /不要展开/,
  /无需解释/,
  /点到为止/,
]

/** R008 正式度轴：更正式 */
export const FORMALITY_HIGH_PATTERNS: readonly RegExp[] = [
  /正式/,
  /严谨/,
  /学术/,
  /公文/,
  /书面/,
  /严肃/,
  /克制/,
  /专业口吻/,
  /专业语气/,
]

/** R008 正式度轴：更口语 */
export const FORMALITY_LOW_PATTERNS: readonly RegExp[] = [
  /口语/,
  /轻松/,
  /幽默/,
  /活泼/,
  /俏皮/,
  /网络用语/,
  /随意/,
  /亲切/,
  /不要太正式/,
  /不必正式/,
]

/** 长度轴的正则。`fixed` 存在时不读捕获组，用于“一句话”这类没有数字的表达 */
export interface LengthPattern {
  readonly re: RegExp
  readonly fixed?: number
}

/** R008 / R010 共用的“上限”表达 */
export const LENGTH_MAX_PATTERNS: readonly LengthPattern[] = [
  { re: /(\d+)\s*(?:个)?字\s*(?:以内|以下|之内)/ },
  // 「不少于」里包含「少于」，必须用后行否定排除，否则会把下限误判成上限
  { re: /(?:不超过|不多于|最多|(?<!不)少于|控制在|限制在|压缩到)\s*(\d+)\s*(?:个)?字/ },
  { re: /(?:不超过|不多于|最多|(?<!不)少于)\s*(\d+)\s*(?:句|段|行|条|页)/ },
  { re: /(?:一|两|三|几)\s*句话/, fixed: 60 },
  { re: /(?:一|两|三)\s*段话?/, fixed: 300 },
]

/** R008 长度轴 / R010 的“下限”表达 */
export const LENGTH_MIN_PATTERNS: readonly LengthPattern[] = [
  { re: /(\d+)\s*(?:个)?字\s*(?:以上|起)/ },
  { re: /(?:不少于|至少|最少|(?<!不)多于|(?<!不)超过|不低于)\s*(\d+)\s*(?:个)?字/ },
  { re: /长篇|长文/, fixed: 1000 },
]

/** R008 格式轴：文本里点名了某种输出格式 */
export interface OutputFormatAlias {
  readonly format: OutputFormat
  readonly aliases: readonly string[]
}

export const FORMAT_ALIASES: readonly OutputFormatAlias[] = [
  { format: 'json', aliases: ['json'] },
  { format: 'yaml', aliases: ['yaml', 'yml'] },
  { format: 'markdown', aliases: ['markdown', 'md'] },
  { format: 'xml', aliases: ['xml'] },
  { format: 'table', aliases: ['表格', 'csv', 'table'] },
  { format: 'plain', aliases: ['纯文本', 'plain text', 'plain'] },
  { format: 'code', aliases: ['代码块', '代码'] },
]

/**
 * 只有紧邻这些“输出意图”标记的格式词才被当成输出格式约束。
 * 否则“把 JSON 转成 YAML”这种转换任务会被误判为格式冲突。
 */
export const FORMAT_MARKER_PATTERN =
  /(?:输出|返回|格式(?:为|是|：)?|呈现|给出|采用|使用|以|用)\s*(?:为|：|是)?\s*$/

/** 出现在格式词之前的否定，例如“不要输出代码” */
export const FORMAT_NEGATION_PATTERN = /(?:不|不要|禁止|无需|别)\s*(?:输出|返回|使用|采用|用|以)/

/** 出现在格式词之后的确认，例如“JSON 格式输出” */
export const FORMAT_SUFFIX_PATTERN = /^\s*(?:格式|输出|呈现)/

/** R010：认为“已经有了长度或规模约束”的表达 */
export const SCALE_CONSTRAINT_PATTERN =
  /(?:\d+\s*(?:个)?字|字数|字以内|字以上|不超过|不少于|最多|至少|限制在|篇幅|长度|页|段落|条目|行以内|分钟|秒)/

/** 需要结构化输出的任务类型；这些类型 sections 为空即报 R002 */
export const STRUCTURE_REQUIRED_TASK_TYPES: readonly TaskType[] = [
  'writing',
  'coding',
  'analysis',
  'extraction',
  'planning',
  'transformation',
]

/** R002 自动修复：按任务类型给默认输出格式与章节 */
export interface TaskOutputDefaults {
  readonly format: OutputFormat
  readonly sections: readonly string[]
}

export const TASK_OUTPUT_DEFAULTS: Readonly<Record<TaskType, TaskOutputDefaults>> = {
  qa: { format: 'markdown', sections: ['结论', '依据'] },
  writing: { format: 'markdown', sections: ['标题', '正文'] },
  coding: { format: 'code', sections: ['代码', '说明'] },
  analysis: { format: 'markdown', sections: ['结论', '依据', '风险'] },
  extraction: { format: 'json', sections: ['结果'] },
  conversation: { format: 'plain', sections: ['回复'] },
  planning: { format: 'markdown', sections: ['目标', '步骤', '风险'] },
  transformation: { format: 'markdown', sections: ['转换结果'] },
  other: { format: 'markdown', sections: ['正文'] },
}

/** R003 自动修复：按任务类型给默认角色 */
export const TASK_PERSONA_DEFAULTS: Readonly<Record<TaskType, string>> = {
  qa: '严谨的知识顾问，先澄清问题再作答',
  writing: '资深内容编辑，擅长结构化写作',
  coding: '资深软件工程师，重视可运行与可维护',
  analysis: '资深分析师，结论先行并给出证据',
  extraction: '结构化信息抽取专家，严格按字段输出',
  conversation: '耐心的对话教练，先理解再回应',
  planning: '项目经理，按阶段拆解任务与风险',
  transformation: '格式转换专家，只做无损转换',
  other: '严谨的任务执行顾问，先确认目标再动手',
}

/** R005 自动修复：按任务类型补“明确不做” */
export const TASK_SCOPE_OUT_DEFAULTS: Readonly<Record<TaskType, readonly string[]>> = {
  qa: ['不回答与问题无关的内容'],
  writing: ['不虚构未提供的事实与数据'],
  coding: ['不修改未要求的文件与接口'],
  analysis: ['不把推测当作结论呈现'],
  extraction: ['不补写原文中不存在的信息'],
  conversation: ['不替用户做最终决定'],
  planning: ['不承诺无法验证的时间与资源'],
  transformation: ['不改变原始数据的含义'],
  other: ['不做与目标无关的扩展'],
}

/** R004 自动修复：可核对的默认成功标准 */
export const DEFAULT_SUCCESS_CRITERIA: readonly string[] = [
  '输出明确回答 objective.goal 中提出的每个要求',
  '结论或事实均可追溯到输入或已知信息',
  '输出符合 output 中声明的格式与长度',
]

export const DEFAULT_KNOWLEDGE_POLICY =
  '信息不足时先说明缺少什么并提问；不得编造事实、数据或引用。'

export const DEFAULT_AMBIGUITY_POLICY =
  '存在多种理解时列出候选解释并请用户确认；若必须继续，选择一种并显式标注所选假设。'

/** R010 自动修复：按任务类型补长度约束 */
export const TASK_LENGTH_DEFAULTS: Readonly<Record<TaskType, string>> = {
  qa: '回答控制在 300 字以内，超过 3 个要点时分点',
  writing: '正文 800 到 1500 字，超出时先给摘要',
  coding: '代码完整可运行，说明部分不超过 200 字',
  analysis: '正文不超过 1000 字，结论先行',
  extraction: '仅输出结构化结果，条目不超过 50 条',
  conversation: '每次回复不超过 150 字',
  planning: '正文不超过 1200 字，按阶段列出',
  transformation: '仅输出转换结果，单条结果不超过 500 字',
  other: '正文不超过 800 字',
}

/** R016 自动修复：按主题归类 must 清单，保持组内原顺序 */
export interface MustGroupTheme {
  readonly label: string
  readonly keywords: readonly string[]
}

export const MUST_GROUP_THEMES: readonly MustGroupTheme[] = [
  {
    label: '格式',
    keywords: ['格式', '结构', '排版', '输出', 'json', 'markdown', '表格', '标题', '分段', '字数'],
  },
  {
    label: '内容',
    keywords: ['内容', '包含', '覆盖', '列出', '给出', '说明', '引用', '数据', '事实', '结论'],
  },
  {
    label: '语气',
    keywords: ['语气', '风格', '口吻', '正式', '简洁', '通俗', '读者', '书面'],
  },
  {
    label: '流程',
    keywords: ['先', '然后', '最后', '步骤', '顺序', '流程', '逐步', '第一阶段'],
  },
  {
    label: '安全',
    keywords: ['隐私', '敏感', '合规', '不得', '禁止', '泄露', '安全'],
  },
]

/** R016 分组前缀，例如 `【格式】`；R016 判定“已分组”与分组修复共用 */
export const MUST_GROUPED_PATTERN = /^【[^】]{1,8}】/
