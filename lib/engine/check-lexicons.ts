/**
 * 本地检查 R101-R108 的词表与匹配模式（PRODUCT FR-5.2）。
 *
 * 纯常量，无 IO。需要被 exec / test 反复使用的正则不带 `g` 标志，
 * 由 `check.ts` 克隆后使用，避免 lastIndex 状态泄漏；`normalizeRequirement`
 * 内部只做 replace 的全局正则例外。
 */

/** R101：模糊限定词。 */
export const FUZZY_WORDS = [
  '尽量',
  '适当',
  '一些',
  '某些',
  '等等',
  '合适',
  '更好地',
  '高质量',
  '快速',
  '丰富',
  '优秀',
] as const

/** R102：互斥概念对。两个词同时出现即视为矛盾。 */
export const CONTRADICTION_PAIRS = [
  { a: '简洁', b: '详细' },
  { a: '简短', b: '完整' },
  { a: '正式', b: '口语' },
] as const

/**
 * R102：数值下限与上限。单位可选，只有单位一致时才放在同一维度比较，
 * 避免把「不少于 500 字」和「不超过 2 小时」误判为冲突。
 */
export const MIN_CONSTRAINT_PATTERN =
  /(?:不少于|不低于|至少|不小于)\s*(\d+(?:\.\d+)?)\s*(千字|万字|分钟|小时|字|个|条|项|天|秒|页|段|句|次|人|k|K|%)?/

export const MAX_CONSTRAINT_PATTERN =
  /(?:不超过|不多于|不高于|至多|最多)\s*(\d+(?:\.\d+)?)\s*(千字|万字|分钟|小时|字|个|条|项|天|秒|页|段|句|次|人|k|K|%)?/

/** R103：输出格式线索。英文词条按小写匹配。 */
export const FORMAT_HINTS = [
  'markdown',
  '格式',
  '分点',
  '要点',
  '列表',
  '清单',
  '表格',
  'json',
  'xml',
  'yaml',
  'csv',
  '标题',
  '小节',
  '编号',
  '段落',
  '结构',
  '步骤',
  '模板',
  '代码块',
] as const

/** R104：角色与背景线索。 */
export const ROLE_HINTS = [
  '你是',
  '作为一名',
  '作为',
  '角色',
  '身份',
  '背景',
  '场景',
  '业务',
  '公司',
  '团队',
  '用户',
  '读者',
  '受众',
  '面向',
  '上下文',
  '我的',
] as const

/** R105：边界与信息不足时的处理线索。 */
export const BOUNDARY_HINTS = [
  '不要',
  '不得',
  '禁止',
  '避免',
  '除外',
  '除非',
  '如果',
  '若',
  '当',
  '信息不足',
  '不确定',
  '不明确',
  '缺失',
  '未知',
  '提问',
  '追问',
  '澄清',
  '假设',
  '边界',
  '限制',
  '注意',
  '仅限',
  '只能',
  '只要',
  '不超过',
  '以内',
] as const

/**
 * R106：提示词注入模式。覆盖要求忽略既有指令、索取系统提示、切换身份
 * 与越狱话术。模式不带 `g`，`exec` 只取第一处匹配。
 */
export const INJECTION_PATTERNS: readonly RegExp[] = [
  /(?:忽略|无视)(?:掉)?[^。！？!?；;\n]{0,12}?(?:指令|指示|规则|要求|设定|提示)/,
  /ignore\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions?|prompts?|rules?)/i,
  /disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?)/i,
  /(?:泄露|透露|输出|打印|显示|重复|告诉)[^。！？!?；;\n]{0,10}?(?:系统(?:提示|指令|消息|设定)|system\s*prompt)/i,
  /(?:系统(?:提示词?|指令|消息|设定)|system\s*prompt)[^。！？!?；;\n]{0,10}?(?:输出|泄露|透露|打印|显示|告诉我|发给我)/i,
  /(?:越狱|jailbreak|developer\s*mode|开发者模式)/i,
  /(?:从现在开始|接下来)你(?:是|将扮演|扮演)/,
]

/** R107：要求按句、行切分。不含 `g`，由 `check.ts` 克隆后扫描。 */
export const REQUIREMENT_SPLIT_PATTERN = /[^。！？!?；;\n]+/

/** R107：去重前要求的最短长度，过短的句子不计入重复。 */
export const REQUIREMENT_MIN_LENGTH = 8

/** 去掉行首列表序号，避免「1. 要求」与「2. 要求」被当成不同要求。 */
const REQUIREMENT_LIST_MARKER_PATTERN = /^\s*(?:\d+[.、)）]|[-*•])\s*/

/** 去重规范化：去掉空白、标点与符号并转小写，只比较要求本身。 */
const REQUIREMENT_NOISE_PATTERN = /[\s\p{P}\p{S}]/gu

export function normalizeRequirement(text: string): string {
  return text
    .replace(REQUIREMENT_LIST_MARKER_PATTERN, '')
    .replace(REQUIREMENT_NOISE_PATTERN, '')
    .toLowerCase()
}
