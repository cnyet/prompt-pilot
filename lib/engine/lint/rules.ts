import { OUTPUT_FORMATS, type OutputFormat, type PromptSchema, type TaskType } from '@/lib/engine/schema'
import {
  ANTECEDENT_NOUNS,
  DETAIL_HIGH_PATTERNS,
  DETAIL_LOW_PATTERNS,
  DEFAULT_AMBIGUITY_POLICY,
  DEFAULT_KNOWLEDGE_POLICY,
  DEFAULT_SUCCESS_CRITERIA,
  FORMAT_ALIASES,
  FORMAT_MARKER_PATTERN,
  FORMAT_NEGATION_PATTERN,
  FORMAT_SUFFIX_PATTERN,
  FORMALITY_HIGH_PATTERNS,
  FORMALITY_LOW_PATTERNS,
  FUZZY_QUALIFIER_REPLACEMENTS,
  FUZZY_QUALIFIERS,
  GENERIC_PERSONAS,
  LENGTH_MAX_PATTERNS,
  LENGTH_MIN_PATTERNS,
  MUST_GROUP_THEMES,
  MUST_GROUPED_PATTERN,
  PLACEHOLDER_TEXTS,
  PRONOUN_PATTERN_SOURCE,
  SCALE_CONSTRAINT_PATTERN,
  STRUCTURE_REQUIRED_TASK_TYPES,
  TASK_LENGTH_DEFAULTS,
  TASK_OUTPUT_DEFAULTS,
  TASK_PERSONA_DEFAULTS,
  TASK_SCOPE_OUT_DEFAULTS,
  VAGUE_ADJECTIVE_REPLACEMENTS,
  VAGUE_ADJECTIVES,
  type LengthPattern,
} from './lexicons'
import {
  type ConflictAxis,
  type LintContext,
  type LintIssue,
  type LintIssueData,
  type LintLevel,
  type LintRule,
  type LintRuleId,
  type LintSpan,
  type LintTextField,
} from './types'

/** 每条规则的默认级别；R014 会按阈值动态给出 warn / error */
export const RULE_TITLES: Readonly<Record<LintRuleId, string>> = {
  R001: '模糊限定词',
  R002: '缺输出格式',
  R003: '角色缺失或过于笼统',
  R004: '缺可核对的成功标准',
  R005: '缺「明确不做」清单',
  R006: '缺知识不足时的行为约定',
  R007: '缺歧义处理策略',
  R008: '矛盾约束',
  R009: '不可验证的形容词',
  R010: '缺长度或规模约束',
  R011: '正文引用了未声明的变量',
  R012: '声明了变量但正文未使用',
  R013: '指代不明',
  R014: '提示词过长',
  R015: '示例敏感型任务缺示例',
  R016: 'must 清单过长且未分组',
}

export const RULE_LEVELS: Readonly<Record<LintRuleId, LintLevel>> = {
  R001: 'warn',
  R002: 'error',
  R003: 'warn',
  R004: 'error',
  R005: 'error',
  R006: 'error',
  R007: 'warn',
  R008: 'error',
  R009: 'warn',
  R010: 'info',
  R011: 'error',
  R012: 'warn',
  R013: 'info',
  R014: 'warn',
  R015: 'info',
  R016: 'info',
}

interface MakeIssueInput {
  readonly ruleId: LintRuleId
  readonly path: string
  readonly message: string
  readonly why: string
  readonly suggestion: string
  readonly fixable: boolean
  readonly span?: LintSpan
  readonly level?: LintLevel
  readonly data?: LintIssueData
}

function makeIssue(input: MakeIssueInput): LintIssue {
  const issue: LintIssue = {
    ruleId: input.ruleId,
    level: input.level ?? RULE_LEVELS[input.ruleId],
    path: input.path,
    message: input.message,
    why: input.why,
    suggestion: input.suggestion,
    fixable: input.fixable,
    ...(input.span === undefined ? {} : { span: input.span }),
    ...(input.data === undefined ? {} : { data: input.data }),
  }
  return issue
}

/* -------------------------------------------------------------------------- */
/* 路径与字段工具                                                              */
/* -------------------------------------------------------------------------- */

type PathSegment = string | number

export interface RegexMatch {
  readonly text: string
  readonly span: LintSpan
  /** 捕获组，未参与匹配的组为空字符串 */
  readonly groups: readonly string[]
}

/** 解析 `constraints.must[2]` 这样的路径；不做求值，只拆分 */
function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  const re = /([^.[\]]+)|\[(\d+)\]/g
  let match = re.exec(path)
  while (match !== null) {
    const key = match[1]
    const index = match[2]
    if (key !== undefined) {
      segments.push(key)
    } else if (index !== undefined) {
      segments.push(Number.parseInt(index, 10))
    }
    match = re.exec(path)
  }
  return segments
}

/** 读取任意路径的值；路径不存在返回 undefined，不抛错 */
export function getValueAtPath(root: unknown, path: string): unknown {
  const segments = parsePath(path)
  let current: unknown = root
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
      continue
    }
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** 写入任意路径的值。调用方需自行保证先做深拷贝；返回是否写入成功 */
export function setValueAtPath(root: unknown, path: string, value: unknown): boolean {
  const segments = parsePath(path)
  const last = segments[segments.length - 1]
  if (segments.length === 0 || last === undefined) return false

  let current: unknown = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]
    if (segment === undefined) return false
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return false
      current = current[segment]
      continue
    }
    if (typeof current !== 'object' || current === null) return false
    current = (current as Record<string, unknown>)[segment]
  }

  if (typeof last === 'number') {
    if (!Array.isArray(current)) return false
    current[last] = value
    return true
  }
  if (typeof current !== 'object' || current === null) return false
  ;(current as Record<string, unknown>)[last] = value
  return true
}

function pushField(fields: LintTextField[], path: string, text: string | undefined): void {
  if (typeof text === 'string' && text.length > 0) {
    fields.push({ path, text })
  }
}

/**
 * 收集所有会进入提示词正文的字符串字段。
 *
 * 刻意排除 `input.variables` 的元信息与 `assumptions`：
 * - 前者是变量声明区，不是正文，扫描它会让 R012「未使用」永远不触发；
 * - 后者是生成期元信息，不属于提示词正文。
 */
export function collectTextFields(schema: PromptSchema): LintTextField[] {
  const fields: LintTextField[] = []

  pushField(fields, 'meta.title', schema.meta.title)

  pushField(fields, 'role.persona', schema.role.persona)
  pushField(fields, 'role.expertise', schema.role.expertise)
  pushField(fields, 'role.stance', schema.role.stance)

  pushField(fields, 'objective.goal', schema.objective.goal)
  schema.objective.successCriteria.forEach((text, index) => {
    pushField(fields, `objective.successCriteria[${index}]`, text)
  })
  schema.objective.nonGoals.forEach((text, index) => {
    pushField(fields, `objective.nonGoals[${index}]`, text)
  })

  pushField(fields, 'context.background', schema.context.background)
  pushField(fields, 'context.audience', schema.context.audience)
  schema.context.knownFacts.forEach((text, index) => {
    pushField(fields, `context.knownFacts[${index}]`, text)
  })
  pushField(fields, 'context.missingInputPolicy', schema.context.missingInputPolicy)

  schema.constraints.must.forEach((text, index) => {
    pushField(fields, `constraints.must[${index}]`, text)
  })
  schema.constraints.mustNot.forEach((text, index) => {
    pushField(fields, `constraints.mustNot[${index}]`, text)
  })
  schema.constraints.boundaries.scopeIn.forEach((text, index) => {
    pushField(fields, `constraints.boundaries.scopeIn[${index}]`, text)
  })
  schema.constraints.boundaries.scopeOut.forEach((text, index) => {
    pushField(fields, `constraints.boundaries.scopeOut[${index}]`, text)
  })
  pushField(fields, 'constraints.boundaries.knowledgePolicy', schema.constraints.boundaries.knowledgePolicy)
  pushField(fields, 'constraints.boundaries.ambiguityPolicy', schema.constraints.boundaries.ambiguityPolicy)
  pushField(fields, 'constraints.boundaries.formatBoundary', schema.constraints.boundaries.formatBoundary)
  pushField(fields, 'constraints.boundaries.safetyBoundary', schema.constraints.boundaries.safetyBoundary)
  schema.constraints.priority.forEach((text, index) => {
    pushField(fields, `constraints.priority[${index}]`, text)
  })

  pushField(fields, 'output.schema', schema.output.schema)
  schema.output.sections.forEach((text, index) => {
    pushField(fields, `output.sections[${index}]`, text)
  })
  pushField(fields, 'output.length', schema.output.length)
  pushField(fields, 'output.language', schema.output.language)
  pushField(fields, 'output.tone', schema.output.tone)

  schema.examples.items.forEach((item, index) => {
    pushField(fields, `examples.items[${index}].input`, item.input)
    pushField(fields, `examples.items[${index}].output`, item.output)
    pushField(fields, `examples.items[${index}].note`, item.note)
  })
  schema.examples.negative.forEach((item, index) => {
    pushField(fields, `examples.negative[${index}].input`, item.input)
    pushField(fields, `examples.negative[${index}].badOutput`, item.badOutput)
    pushField(fields, `examples.negative[${index}].why`, item.why)
  })

  schema.selfCheck.checklist.forEach((text, index) => {
    pushField(fields, `selfCheck.checklist[${index}]`, text)
  })
  pushField(fields, 'selfCheck.onFail', schema.selfCheck.onFail)

  return fields
}

/** 克隆正则并补齐 g 标志，避免调用方传入的正则残留 lastIndex */
export function collectMatches(text: string, pattern: RegExp): RegexMatch[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const re = new RegExp(pattern.source, flags)
  const matches: RegexMatch[] = []
  let match = re.exec(text)
  while (match !== null) {
    const full = match[0] ?? ''
    const start = match.index
    matches.push({
      text: full,
      span: [start, start + full.length],
      groups: match.slice(1).map((group) => group ?? ''),
    })
    if (full.length === 0) {
      re.lastIndex += 1
    }
    match = re.exec(text)
  }
  return matches
}

/** 查找一个固定字符串的全部出现位置（区分大小写，中文场景够用） */
export function findLiteralOccurrences(text: string, word: string): LintSpan[] {
  if (word.length === 0) return []
  const spans: LintSpan[] = []
  let from = 0
  while (from <= text.length) {
    const index = text.indexOf(word, from)
    if (index === -1) break
    spans.push([index, index + word.length])
    from = index + word.length
  }
  return spans
}

/** 占位文本判定：空串、纯空白、常见占位词（忽略尾部标点） */
export function isPlaceholderText(text: string): boolean {
  const normalized = text
    .replace(/[。．.！!？?，,；;：:\s]+$/g, '')
    .trim()
    .toLowerCase()
  if (normalized.length === 0) return true
  return (PLACEHOLDER_TEXTS as readonly string[]).includes(normalized)
}

function hasContent(text: string | undefined): boolean {
  return typeof text === 'string' && !isPlaceholderText(text)
}

function wholeFieldSpan(text: string): LintSpan | undefined {
  return text.length === 0 ? undefined : [0, text.length]
}

/** 判断某个位置之前是否紧邻否定词，用于避免把「不要详细」识别成「详细」 */
function isNegated(text: string, start: number): boolean {
  const before = text.slice(Math.max(0, start - 6), start)
  return /(?:不|无需|不要|不必|不用|别|禁止|避免|并非|不是)\s*$/.test(before)
}

function parseFirstNumber(match: RegexMatch): number | null {
  const raw = match.groups[0]
  if (raw === undefined || raw.length === 0) return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : null
}

/* -------------------------------------------------------------------------- */
/* R001 模糊限定词                                                             */
/* -------------------------------------------------------------------------- */

function runR001(_schema: PromptSchema, ctx: LintContext): LintIssue[] {
  const issues: LintIssue[] = []
  for (const field of ctx.fields) {
    for (const word of FUZZY_QUALIFIERS) {
      const spans = findLiteralOccurrences(field.text, word)
      const first = spans[0]
      if (first === undefined) continue
      const replacement = FUZZY_QUALIFIER_REPLACEMENTS[word]
      const countText = spans.length > 1 ? `出现 ${spans.length} 次，` : ''
      issues.push(
        makeIssue({
          ruleId: 'R001',
          path: field.path,
          span: first,
          message: `模糊限定词「${word}」${countText}缺少可执行标准`,
          why: '这类词没有可核对的边界，模型每次对“多少算适当”的理解都可能不同，输出稳定性无法验证。',
          suggestion:
            replacement.length === 0
              ? `删除「${word}」，改成具体数量、范围或判据。`
              : `把「${word}」替换为「${replacement}」，或直接写出可核对判据。`,
          fixable: true,
          data: { word, replacement, count: spans.length },
        }),
      )
    }
  }
  return issues
}

/* -------------------------------------------------------------------------- */
/* R002 缺输出格式                                                             */
/* -------------------------------------------------------------------------- */

function runR002(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const taskType = schema.meta.taskType
  const defaults = TASK_OUTPUT_DEFAULTS[taskType]
  const formatValid = (OUTPUT_FORMATS as readonly string[]).includes(schema.output.format)
  const structured = STRUCTURE_REQUIRED_TASK_TYPES.includes(taskType)
  const sectionsEmpty = schema.output.sections.length === 0
  const plainForStructured = structured && schema.output.format === 'plain'

  if (formatValid && !(structured && (sectionsEmpty || plainForStructured))) {
    return []
  }

  const path = formatValid && sectionsEmpty ? 'output.sections' : 'output.format'
  const detail = !formatValid
    ? `output.format 的取值「${schema.output.format}」不在允许范围内`
    : sectionsEmpty
      ? `任务类型「${taskType}」需要结构化输出，但 output.sections 为空`
      : `任务类型「${taskType}」需要结构化输出，但 output.format 仍是 plain`

  return [
    makeIssue({
      ruleId: 'R002',
      path,
      message: detail,
      why: '没有明确的格式与章节，模型会自由发挥版式，结果既不可逐条核对，也难以机器解析和复用。',
      suggestion: `按任务类型补默认格式：format=${defaults.format}，sections=[${defaults.sections.join('、')}]。`,
      fixable: true,
      data: { format: defaults.format },
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R003 角色缺失或过于笼统                                                     */
/* -------------------------------------------------------------------------- */

function runR003(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const persona = schema.role.persona
  const trimmed = persona.trim()
  const charCount = Array.from(trimmed).length
  const generic = (GENERIC_PERSONAS as readonly string[]).includes(trimmed.toLowerCase())
  if (charCount >= 6 && !generic) return []

  const reason = generic ? '角色是通用称谓' : `角色只有 ${charCount} 个字`
  return [
    makeIssue({
      ruleId: 'R003',
      path: 'role.persona',
      span: wholeFieldSpan(persona),
      message: `角色描述过于笼统：${reason}`,
      why: '角色决定模型调用哪套知识与语气；通用称谓等于没有设定视角，输出会退回默认风格。',
      suggestion: `补成「领域 + 经验/方法 + 关注点」，例如「${TASK_PERSONA_DEFAULTS[schema.meta.taskType]}」。`,
      fixable: true,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R004 缺可核对的成功标准                                                     */
/* -------------------------------------------------------------------------- */

function runR004(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const validCriteria = schema.objective.successCriteria.filter((criterion) => !isPlaceholderText(criterion))
  if (validCriteria.length > 0) return []

  return [
    makeIssue({
      ruleId: 'R004',
      path: 'objective.successCriteria',
      message: '没有可逐条核对的成功标准',
      why: '成功标准是判断输出对错的唯一依据；缺失时只能凭感觉验收，也无法做版本对比。',
      suggestion: `补充 1 到 3 条可判定真假的判据，例如「${DEFAULT_SUCCESS_CRITERIA[0] ?? ''}」。`,
      fixable: true,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R005 缺「明确不做」清单                                                     */
/* -------------------------------------------------------------------------- */

function runR005(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const scopeOut = schema.constraints.boundaries.scopeOut
  if (scopeOut.some((item) => !isPlaceholderText(item))) return []

  return [
    makeIssue({
      ruleId: 'R005',
      path: 'constraints.boundaries.scopeOut',
      message: '缺少「明确不做」清单（scopeOut）',
      why: '只写做什么不写不做什么，模型会用看似合理的扩写填满边界，导致跑题或越权。',
      suggestion: `至少写 1 条明确排除项，例如「${TASK_SCOPE_OUT_DEFAULTS[schema.meta.taskType][0] ?? '不做与目标无关的扩展'}」。`,
      fixable: true,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R006 缺知识不足时的行为约定                                                 */
/* -------------------------------------------------------------------------- */

function runR006(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const policy = schema.constraints.boundaries.knowledgePolicy
  if (hasContent(policy)) return []

  return [
    makeIssue({
      ruleId: 'R006',
      path: 'constraints.boundaries.knowledgePolicy',
      span: wholeFieldSpan(policy),
      message: '缺少知识不足或不确定时的行为约定',
      why: '没有约定时，模型倾向于编造来补全答案；这是事实性错误最常见的来源。',
      suggestion: `写明信息不足时的动作，例如「${DEFAULT_KNOWLEDGE_POLICY}」。`,
      fixable: true,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R007 缺歧义处理策略                                                         */
/* -------------------------------------------------------------------------- */

function runR007(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const policy = schema.constraints.boundaries.ambiguityPolicy
  if (hasContent(policy)) return []

  return [
    makeIssue({
      ruleId: 'R007',
      path: 'constraints.boundaries.ambiguityPolicy',
      span: wholeFieldSpan(policy),
      message: '缺少输入有歧义时的处理策略',
      why: '同一句话有多种解释时，模型会静默选一种；用户看到结果才发现理解错了。',
      suggestion: `写明歧义时的动作，例如「${DEFAULT_AMBIGUITY_POLICY}」。`,
      fixable: true,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R008 矛盾约束（详略 / 长度 / 正式度 / 格式 四个轴）                        */
/* -------------------------------------------------------------------------- */

type SignalKind =
  | 'detail-high'
  | 'detail-low'
  | 'length-max'
  | 'length-min'
  | 'formality-high'
  | 'formality-low'
  | 'format'

interface AxisSignal {
  readonly kind: SignalKind
  readonly path: string
  readonly span?: LintSpan
  readonly text: string
  readonly value?: number
  readonly format?: OutputFormat
}

function isConstraintPath(path: string): boolean {
  return (
    path === 'objective.goal' ||
    path.startsWith('objective.successCriteria[') ||
    path.startsWith('objective.nonGoals[') ||
    path === 'context.missingInputPolicy' ||
    path.startsWith('constraints.') ||
    path.startsWith('output.')
  )
}

function addSignal(signals: AxisSignal[], signal: AxisSignal): void {
  const key = `${signal.kind}|${signal.path}|${signal.span?.[0] ?? -1}|${signal.format ?? ''}|${signal.value ?? ''}`
  if (signals.some((existing) => `${existing.kind}|${existing.path}|${existing.span?.[0] ?? -1}|${existing.format ?? ''}|${existing.value ?? ''}` === key)) {
    return
  }
  signals.push(signal)
}

function pushPatternSignals(
  signals: AxisSignal[],
  field: LintTextField,
  patterns: readonly RegExp[],
  kind: SignalKind,
  opposite: SignalKind,
): void {
  for (const pattern of patterns) {
    for (const match of collectMatches(field.text, pattern)) {
      const negated = isNegated(field.text, match.span[0])
      addSignal(signals, {
        kind: negated ? opposite : kind,
        path: field.path,
        span: match.span,
        text: match.text,
      })
    }
  }
}

function pushLengthSignals(
  signals: AxisSignal[],
  field: LintTextField,
  patterns: readonly LengthPattern[],
  kind: 'length-max' | 'length-min',
): void {
  for (const pattern of patterns) {
    for (const match of collectMatches(field.text, pattern.re)) {
      const value = pattern.fixed ?? parseFirstNumber(match)
      if (value === null) continue
      addSignal(signals, {
        kind,
        path: field.path,
        span: match.span,
        text: match.text,
        value,
      })
    }
  }
}

function pushFormatSignals(signals: AxisSignal[], schema: PromptSchema, fields: readonly LintTextField[]): void {
  // output.format 枚举本身就是一个格式信号；没有文本区间
  const enumFormat = schema.output.format
  addSignal(signals, {
    kind: 'format',
    path: 'output.format',
    text: enumFormat,
    format: enumFormat,
  })

  for (const field of fields) {
    const lower = field.text.toLowerCase()
    for (const alias of FORMAT_ALIASES) {
      for (const word of alias.aliases) {
        let from = 0
        while (from <= lower.length) {
          const index = lower.indexOf(word, from)
          if (index === -1) break
          const end = index + word.length
          const before = lower.slice(Math.max(0, index - 16), index)
          const after = lower.slice(end, end + 8)
          const hasMarker = FORMAT_MARKER_PATTERN.test(before) || FORMAT_SUFFIX_PATTERN.test(after)
          const negated = FORMAT_NEGATION_PATTERN.test(before)
          if (hasMarker && !negated) {
            addSignal(signals, {
              kind: 'format',
              path: field.path,
              span: [index, end],
              text: field.text.slice(index, end),
              format: alias.format,
            })
          }
          from = end
        }
      }
    }
  }
}

function collectAxisSignals(schema: PromptSchema, ctx: LintContext): AxisSignal[] {
  const signals: AxisSignal[] = []
  const fields = ctx.fields.filter((field) => isConstraintPath(field.path))

  for (const field of fields) {
    pushPatternSignals(signals, field, DETAIL_HIGH_PATTERNS, 'detail-high', 'detail-low')
    pushPatternSignals(signals, field, DETAIL_LOW_PATTERNS, 'detail-low', 'detail-high')
    pushPatternSignals(signals, field, FORMALITY_HIGH_PATTERNS, 'formality-high', 'formality-low')
    pushPatternSignals(signals, field, FORMALITY_LOW_PATTERNS, 'formality-low', 'formality-high')
    pushLengthSignals(signals, field, LENGTH_MAX_PATTERNS, 'length-max')
    pushLengthSignals(signals, field, LENGTH_MIN_PATTERNS, 'length-min')
  }

  // 格式词既可能出现在约束里，也可能出现在 output.tone 等字段里；统一扫约束字段
  pushFormatSignals(signals, schema, fields)
  return signals
}

const CONFLICT_WHY: Readonly<Record<ConflictAxis, string>> = {
  detail: '模型无法同时满足“更详细”和“更简洁”，只能随机丢掉一侧，输出长度与信息密度会不稳定。',
  length: '字数上下界互相冲突，输出必然违反其中一条，验收时无论怎么写都不达标。',
  formality: '正式度要求互斥，模型会在书面语和口语之间摇摆，品牌语气无法保持一致。',
  format: '输出格式要求互斥，模型只能猜一种；机器解析、导出和下游流程都会受影响。',
}

const CONFLICT_SUGGESTION: Readonly<Record<ConflictAxis, string>> = {
  detail: '保留一种详略要求并删除相反项；需要分层时改成「摘要 200 字 + 附录展开」。',
  length: '合并成唯一的字数区间，例如「800 到 1200 字」，并删除其他长度说法。',
  formality: '选定一种语气并删除相反要求；如果各章节语气不同，分章节声明。',
  format: '只保留一种输出格式，并同步修改 output.format；需要多格式时拆成两个交付物。',
}

function conflictIssue(
  axis: ConflictAxis,
  first: AxisSignal,
  second: AxisSignal,
  message: string,
): LintIssue {
  // 优先锚定有文本区间的信号，避免 path 与 span 落在不同字段
  const anchor = second.span === undefined ? first : second
  return makeIssue({
    ruleId: 'R008',
    path: anchor.path,
    span: anchor.span,
    message,
    why: CONFLICT_WHY[axis],
    suggestion: CONFLICT_SUGGESTION[axis],
    fixable: false,
    data: { axis },
  })
}

function runR008(schema: PromptSchema, ctx: LintContext): LintIssue[] {
  const signals = collectAxisSignals(schema, ctx)
  const byKind = (kind: SignalKind): AxisSignal[] => signals.filter((signal) => signal.kind === kind)

  const detailHigh = byKind('detail-high')
  const detailLow = byKind('detail-low')
  const formalityHigh = byKind('formality-high')
  const formalityLow = byKind('formality-low')
  const lengthMax = byKind('length-max')
  const lengthMin = byKind('length-min')
  const formatSignals = byKind('format')

  const issues: LintIssue[] = []

  // 详略轴：优先报「详细 vs 简洁」，其次报「详细 vs 很短的长度上限」这类跨轴冲突
  const firstDetailHigh = detailHigh[0]
  const firstDetailLow = detailLow[0]
  const shortMax = lengthMax.find((signal) => (signal.value ?? Number.POSITIVE_INFINITY) <= 200)
  const longMin = lengthMin.find((signal) => (signal.value ?? 0) >= 500)
  if (firstDetailHigh !== undefined && firstDetailLow !== undefined) {
    issues.push(
      conflictIssue(
        'detail',
        firstDetailHigh,
        firstDetailLow,
        `约束在「详略」轴上矛盾：一处要求「${firstDetailHigh.text}」，另一处要求「${firstDetailLow.text}」`,
      ),
    )
  } else if (firstDetailHigh !== undefined && shortMax !== undefined) {
    issues.push(
      conflictIssue(
        'detail',
        firstDetailHigh,
        shortMax,
        `约束互相矛盾：「${firstDetailHigh.text}」要求充分展开，而「${shortMax.text}」把篇幅限制在 ${shortMax.value} 字以内`,
      ),
    )
  } else if (firstDetailLow !== undefined && longMin !== undefined) {
    issues.push(
      conflictIssue(
        'detail',
        longMin,
        firstDetailLow,
        `约束互相矛盾：「${firstDetailLow.text}」要求压缩篇幅，而「${longMin.text}」要求至少 ${longMin.value} 字`,
      ),
    )
  }

  // 长度轴：任一对「下限 > 上限」都算冲突，取文档顺序中最先出现的一对
  let lengthConflict: { min: AxisSignal; max: AxisSignal } | null = null
  for (const min of lengthMin) {
    if (min.value === undefined) continue
    for (const max of lengthMax) {
      if (max.value === undefined) continue
      if (min.value > max.value) {
        lengthConflict = { min, max }
        break
      }
    }
    if (lengthConflict !== null) break
  }
  if (lengthConflict !== null) {
    issues.push(
      conflictIssue(
        'length',
        lengthConflict.min,
        lengthConflict.max,
        `约束在「长度」轴上矛盾：下限 ${lengthConflict.min.value} 字高于上限 ${lengthConflict.max.value} 字`,
      ),
    )
  }

  // 正式度轴
  const firstFormalityHigh = formalityHigh[0]
  const firstFormalityLow = formalityLow[0]
  if (firstFormalityHigh !== undefined && firstFormalityLow !== undefined) {
    issues.push(
      conflictIssue(
        'formality',
        firstFormalityHigh,
        firstFormalityLow,
        `约束在「正式度」轴上矛盾：一处要求「${firstFormalityHigh.text}」，另一处要求「${firstFormalityLow.text}」`,
      ),
    )
  }

  // 格式轴：去重后超过一种即冲突
  const formats: OutputFormat[] = []
  for (const signal of formatSignals) {
    const format = signal.format
    if (format !== undefined && !formats.includes(format)) {
      formats.push(format)
    }
  }
  if (formats.length > 1) {
    const first = formatSignals.find((signal) => signal.format === formats[0])
    const second = formatSignals.find((signal) => signal.format !== formats[0])
    if (first !== undefined && second !== undefined) {
      issues.push(
        conflictIssue(
          'format',
          first,
          second,
          `约束在「输出格式」轴上矛盾：同时点名了 ${formats.join('、')}`,
        ),
      )
    }
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* R009 不可验证的形容词                                                       */
/* -------------------------------------------------------------------------- */

function runR009(_schema: PromptSchema, ctx: LintContext): LintIssue[] {
  const issues: LintIssue[] = []
  for (const field of ctx.fields) {
    for (const word of VAGUE_ADJECTIVES) {
      const spans = findLiteralOccurrences(field.text, word)
      const first = spans[0]
      if (first === undefined) continue
      const replacement = VAGUE_ADJECTIVE_REPLACEMENTS[word]
      const countText = spans.length > 1 ? `出现 ${spans.length} 次，` : ''
      issues.push(
        makeIssue({
          ruleId: 'R009',
          path: field.path,
          span: first,
          message: `不可验证的形容词「${word}」${countText}没有说明判据`,
          why: '形容词描述的是主观感受，不同评审者会给出不同结论，无法作为验收依据。',
          suggestion: `替换为可核对判据，例如「${replacement}」。`,
          fixable: true,
          data: { word, replacement, count: spans.length },
        }),
      )
    }
  }
  return issues
}

/* -------------------------------------------------------------------------- */
/* R010 缺长度或规模约束                                                       */
/* -------------------------------------------------------------------------- */

function runR010(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const sources: string[] = [
    schema.output.length ?? '',
    schema.constraints.boundaries.formatBoundary ?? '',
    schema.objective.goal,
    ...schema.objective.successCriteria,
    ...schema.constraints.must,
    ...schema.constraints.mustNot,
    ...schema.constraints.boundaries.scopeIn,
    ...schema.constraints.boundaries.scopeOut,
  ]
  if (sources.some((text) => SCALE_CONSTRAINT_PATTERN.test(text))) return []

  const defaultLength = TASK_LENGTH_DEFAULTS[schema.meta.taskType]
  return [
    makeIssue({
      ruleId: 'R010',
      path: 'output.length',
      message: '没有长度或规模约束',
      why: '不限制篇幅时，模型倾向写长；长输出不仅更贵，也会稀释关键结论。',
      suggestion: `在 output.length 写清字数或条目数，例如「${defaultLength}」。`,
      fixable: true,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R011 正文引用了未声明的变量                                                 */
/* -------------------------------------------------------------------------- */

const VARIABLE_TOKEN_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/

function extractVariableTokens(text: string): Array<{ name: string; span: LintSpan }> {
  const tokens: Array<{ name: string; span: LintSpan }> = []
  for (const match of collectMatches(text, VARIABLE_TOKEN_PATTERN)) {
    const name = match.groups[0]
    if (name === undefined || name.length === 0) continue
    tokens.push({ name, span: match.span })
  }
  return tokens
}

function runR011(schema: PromptSchema, ctx: LintContext): LintIssue[] {
  const declared = new Set(schema.input.variables.map((variable) => variable.name))
  const seen = new Set<string>()
  const issues: LintIssue[] = []

  for (const field of ctx.fields) {
    for (const token of extractVariableTokens(field.text)) {
      if (declared.has(token.name) || seen.has(token.name)) continue
      seen.add(token.name)
      issues.push(
        makeIssue({
          ruleId: 'R011',
          path: field.path,
          span: token.span,
          message: `正文引用了未声明的变量「${token.name}」`,
          why: '渲染时没有值可替换，模型会看到原始占位符，或在填充变量后出现字段缺失。',
          suggestion: `在 input.variables 中声明 ${token.name}（建议 type=text、required=true），或从正文删除该占位符。`,
          fixable: true,
          data: { variableName: token.name },
        }),
      )
    }
  }
  return issues
}

/* -------------------------------------------------------------------------- */
/* R012 声明了变量但正文未使用                                                 */
/* -------------------------------------------------------------------------- */

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function runR012(schema: PromptSchema, ctx: LintContext): LintIssue[] {
  const body = ctx.fields.map((field) => field.text).join('\n')
  const issues: LintIssue[] = []

  schema.input.variables.forEach((variable, index) => {
    const tokenPattern = new RegExp(`\\{\\{\\s*${escapeRegExp(variable.name)}\\s*\\}\\}`)
    if (tokenPattern.test(body)) return
    issues.push(
      makeIssue({
        ruleId: 'R012',
        path: `input.variables[${index}]`,
        message: `变量「${variable.name}」已声明但正文从未使用`,
        why: '这个变量不会影响渲染结果，用户填写后看不到任何变化，属于无效输入项。',
        suggestion: `在正文中用 {{${variable.name}}} 引用它；如果确实不需要，删除该变量声明。`,
        fixable: true,
        data: { variableName: variable.name },
      }),
    )
  })

  return issues
}

/* -------------------------------------------------------------------------- */
/* R013 指代不明                                                               */
/* -------------------------------------------------------------------------- */

function buildAntecedentPool(schema: PromptSchema): readonly string[] {
  const pool = new Set<string>(ANTECEDENT_NOUNS)
  const sources = [
    schema.meta.title,
    schema.objective.goal,
    schema.role.persona,
    schema.role.expertise ?? '',
    ...schema.output.sections,
    ...schema.context.knownFacts,
    ...schema.input.variables.map((variable) => variable.label),
  ]
  for (const source of sources) {
    for (const piece of source.split(/[，。；：、！？\s（）()【】[\]]/)) {
      const trimmed = piece.trim()
      const charCount = Array.from(trimmed).length
      if (charCount >= 2 && charCount <= 12) {
        pool.add(trimmed)
      }
    }
  }
  return [...pool]
}

/** 指代词扫描上限：防止病态输入（整段都是「它」）拖慢 50ms 预算 */
const MAX_PRONOUN_SCAN = 200

function findAmbiguousPronoun(
  text: string,
  pool: readonly string[],
): { span: LintSpan; word: string; count: number } | null {
  const re = new RegExp(PRONOUN_PATTERN_SOURCE, 'g')
  let first: { span: LintSpan; word: string } | null = null
  let count = 0
  let scanned = 0
  let match = re.exec(text)
  while (match !== null && scanned < MAX_PRONOUN_SCAN) {
    scanned += 1
    const word = match[0] ?? ''
    const start = match.index
    const previous = text.slice(Math.max(0, start - 200), start)
    const hasPreviousText = previous.trim().length > 0
    // 「上述」只要前面有内容就默认有先行词；它的误报代价高于漏报
    const ambiguous =
      word === '上述'
        ? !hasPreviousText
        : !hasPreviousText || !pool.some((noun) => previous.includes(noun))
    if (ambiguous) {
      count += 1
      if (first === null) {
        first = { span: [start, start + word.length], word }
      }
    }
    match = re.exec(text)
  }
  if (first === null) return null
  return { ...first, count }
}

function runR013(schema: PromptSchema, ctx: LintContext): LintIssue[] {
  const pool = buildAntecedentPool(schema)
  const issues: LintIssue[] = []

  for (const field of ctx.fields) {
    const found = findAmbiguousPronoun(field.text, pool)
    if (found === null) continue
    const countText = found.count > 1 ? `（本字段共 ${found.count} 处）` : ''
    issues.push(
      makeIssue({
        ruleId: 'R013',
        path: field.path,
        span: found.span,
        message: `指代词「${found.word}」找不到明确先行词${countText}`,
        why: '模型可能把指代对象绑定到错误的名词，尤其在长上下文里，输出会答非所问。',
        suggestion: `把「${found.word}」替换成具体名词（例如「报告」「这份数据」），或先写出指代对象。`,
        fixable: false,
        data: { word: found.word, count: found.count },
      }),
    )
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* R014 提示词过长                                                             */
/* -------------------------------------------------------------------------- */

function runR014(_schema: PromptSchema, ctx: LintContext): LintIssue[] {
  const tokens = Math.round(ctx.estimateTokens(ctx.renderedText))
  if (!Number.isFinite(tokens) || tokens <= ctx.tokenWarnThreshold) return []

  const level: LintLevel = tokens > ctx.tokenErrorThreshold ? 'error' : 'warn'
  const threshold = level === 'error' ? ctx.tokenErrorThreshold : ctx.tokenWarnThreshold
  return [
    makeIssue({
      ruleId: 'R014',
      level,
      path: '$',
      message: `渲染后约 ${tokens} tokens，超过${level === 'error' ? ' error ' : ' warn '}阈值 ${threshold}`,
      why: '上下文窗口、延迟和费用都随 token 线性上升；过长的提示词还会让关键约束被模型忽略。',
      suggestion: '把背景资料与示例拆到检索资料或子任务，主提示词只保留目标、边界与输出格式，压到 2000 tokens 以内。',
      fixable: false,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R015 示例敏感型任务缺示例                                                   */
/* -------------------------------------------------------------------------- */

const EXAMPLE_SENSITIVE_TASK_TYPES: readonly TaskType[] = ['extraction', 'transformation']

function runR015(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  if (!EXAMPLE_SENSITIVE_TASK_TYPES.includes(schema.meta.taskType)) return []
  if (schema.examples.items.length > 0) return []

  return [
    makeIssue({
      ruleId: 'R015',
      path: 'examples.items',
      message: `任务类型「${schema.meta.taskType}」依赖示例，但 examples.items 为空`,
      why: '抽取与转换任务的边界格式很难只靠文字说清；没有示例时模型会自行猜测字段与粒度。',
      suggestion: '补 2 条「输入 → 输出」示例，至少覆盖一条正常输入和一条边界输入。',
      fixable: false,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* R016 must 清单过长且未分组                                                  */
/* -------------------------------------------------------------------------- */

const MUST_UNGROUPED_LIMIT = 8
const OTHER_GROUP_LABEL = '其他'

function classifyMustItem(item: string): string {
  const lower = item.toLowerCase()
  for (const theme of MUST_GROUP_THEMES) {
    if (theme.keywords.some((keyword) => lower.includes(keyword))) {
      return theme.label
    }
  }
  return OTHER_GROUP_LABEL
}

/** 供 applyFix 使用：按主题稳定分组，并给未分组条目加前缀 */
export function groupMustItems(items: readonly string[]): string[] {
  const order: string[] = [...MUST_GROUP_THEMES.map((theme) => theme.label), OTHER_GROUP_LABEL]
  const buckets = new Map<string, string[]>()
  for (const label of order) {
    buckets.set(label, [])
  }

  for (const item of items) {
    const existing = MUST_GROUPED_PATTERN.exec(item)
    if (existing !== null) {
      const label = existing[0].slice(1, -1)
      if (!buckets.has(label)) {
        order.push(label)
        buckets.set(label, [])
      }
      buckets.get(label)?.push(item)
      continue
    }
    const label = classifyMustItem(item)
    buckets.get(label)?.push(`【${label}】${item}`)
  }

  return order.flatMap((label) => buckets.get(label) ?? [])
}

function runR016(schema: PromptSchema, _ctx: LintContext): LintIssue[] {
  const items = schema.constraints.must
  if (items.length <= MUST_UNGROUPED_LIMIT) return []
  if (items.some((item) => MUST_GROUPED_PATTERN.test(item))) return []

  return [
    makeIssue({
      ruleId: 'R016',
      path: 'constraints.must',
      message: `constraints.must 有 ${items.length} 条且未分组，超过 ${MUST_UNGROUPED_LIMIT} 条`,
      why: '扁平长清单难以逐条核对，约束之间容易重复或冲突，模型也更容易漏掉后面的条目。',
      suggestion: '按格式、内容、语气、流程、安全分组，每组不超过 8 条。',
      fixable: true,
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* 规则注册表                                                                  */
/* -------------------------------------------------------------------------- */

export const RULES: readonly LintRule[] = [
  { id: 'R001', title: RULE_TITLES.R001, run: runR001 },
  { id: 'R002', title: RULE_TITLES.R002, run: runR002 },
  { id: 'R003', title: RULE_TITLES.R003, run: runR003 },
  { id: 'R004', title: RULE_TITLES.R004, run: runR004 },
  { id: 'R005', title: RULE_TITLES.R005, run: runR005 },
  { id: 'R006', title: RULE_TITLES.R006, run: runR006 },
  { id: 'R007', title: RULE_TITLES.R007, run: runR007 },
  { id: 'R008', title: RULE_TITLES.R008, run: runR008 },
  { id: 'R009', title: RULE_TITLES.R009, run: runR009 },
  { id: 'R010', title: RULE_TITLES.R010, run: runR010 },
  { id: 'R011', title: RULE_TITLES.R011, run: runR011 },
  { id: 'R012', title: RULE_TITLES.R012, run: runR012 },
  { id: 'R013', title: RULE_TITLES.R013, run: runR013 },
  { id: 'R014', title: RULE_TITLES.R014, run: runR014 },
  { id: 'R015', title: RULE_TITLES.R015, run: runR015 },
  { id: 'R016', title: RULE_TITLES.R016, run: runR016 },
]
