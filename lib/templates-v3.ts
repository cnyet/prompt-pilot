/**
 * 模板页纯函数（Phase 4）。
 *
 * 客户端与服务端共用：不依赖 React、Prisma 或 node: 模块。
 * 数据库与 API 的 category / mode 是 string，这里统一收敛为字面量联合，
 * 未知值分别回落到 text / generate，避免模板页出现未定义分支。
 */

export type TemplateCategory = 'text' | 'image' | 'video'
export type TemplateMode = 'generate' | 'optimize'

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  'text',
  'image',
  'video',
]

/** 模板卡渲染所需字段；body 不进入列表页载荷。 */
export interface TemplateCard {
  id: string
  slug: string | null
  category: TemplateCategory
  style: string
  title: string
  description: string
  mode: TemplateMode
  exampleInput: string | null
  featured: boolean
  builtin: boolean
}

export interface TemplateCardSource {
  id: string
  slug: string | null
  category: string
  style: string
  title: string
  description: string
  mode: string
  exampleInput: string | null
  featured: boolean
  builtin: boolean
}

export interface TemplatePrefillSource extends TemplateCardSource {
  body: string
}

export interface TemplatePrefill {
  originTemplateId: string
  mode: TemplateMode
  sourceInput: string
  targetType: TemplateCategory
}

export interface TemplateOrigin {
  id: string
  mode: TemplateMode
}

export interface CoverModel {
  variant: TemplateCategory
  seed: number
  titleLines: string[]
  styleLabel: string
}

const COVER_TITLE_LINE_LIMIT = 6
const COVER_TITLE_CHAR_LIMIT = 12
const COVER_STYLE_CHAR_LIMIT = 12

export function toTemplateCategory(value: string): TemplateCategory {
  return value === 'image' || value === 'video' ? value : 'text'
}

export function toTemplateMode(value: string): TemplateMode {
  return value === 'optimize' ? 'optimize' : 'generate'
}

export function toTemplateCard(source: TemplateCardSource): TemplateCard {
  return {
    id: source.id,
    slug: source.slug,
    category: toTemplateCategory(source.category),
    style: source.style.trim(),
    title: source.title,
    description: source.description,
    mode: toTemplateMode(source.mode),
    exampleInput: source.exampleInput,
    featured: source.featured,
    builtin: source.builtin,
  }
}

/**
 * 「用它开始」的预填。
 *
 * 生成模板优先用示例需求；旧自定义模板没有 exampleInput 时退到说明、标题。
 * 优化模板永远预填正文；正文意外为空时同样退到说明、标题。
 * 没有任何可用文本时返回 null，工作台保持空白而不是伪造输入。
 */
export function resolveTemplatePrefill(
  source: TemplatePrefillSource,
): TemplatePrefill | null {
  const mode = toTemplateMode(source.mode)
  const targetType = toTemplateCategory(source.category)
  const preferred =
    mode === 'optimize' ? source.body : (source.exampleInput ?? '')
  const fallback = source.description.trim() || source.title.trim()
  const sourceInput = preferred.trim() || fallback

  if (sourceInput.length === 0) return null

  return {
    originTemplateId: source.id,
    mode,
    sourceInput,
    targetType,
  }
}

export function templateHref(id: string): string {
  return `/studio?template=${encodeURIComponent(id)}`
}

/** 模板来源只在用户用原模式提交时附上；切换模式后不再冒充模板使用。 */
export function originTemplateIdForMode(
  origin: TemplateOrigin | null,
  mode: TemplateMode,
): string | undefined {
  return origin?.mode === mode ? origin.id : undefined
}

export function countTemplatesByCategory(
  templates: readonly TemplateCard[],
): Record<TemplateCategory, number> {
  const counts: Record<TemplateCategory, number> = {
    text: 0,
    image: 0,
    video: 0,
  }
  for (const template of templates) {
    counts[template.category] += 1
  }
  return counts
}

export function templatesInCategory(
  templates: readonly TemplateCard[],
  category: TemplateCategory,
): TemplateCard[] {
  return templates.filter((template) => template.category === category)
}

/** 当前分类下出现过的风格，按首次出现顺序去重；空风格不进入筛选。 */
export function stylesInCategory(
  templates: readonly TemplateCard[],
  category: TemplateCategory,
): string[] {
  const seen = new Set<string>()
  const styles: string[] = []
  for (const template of templates) {
    if (template.category !== category) continue
    const style = template.style.trim()
    if (style.length === 0 || seen.has(style)) continue
    seen.add(style)
    styles.push(style)
  }
  return styles
}

/** 删除模板或切换分类后，已不存在的风格选择立即失效。 */
export function resolveStyleSelection(
  styles: readonly string[],
  style: string | null,
): string | null {
  return style !== null && styles.includes(style) ? style : null
}

export function filterTemplatesByStyle(
  templates: readonly TemplateCard[],
  style: string | null,
): TemplateCard[] {
  if (style === null) return [...templates]
  return templates.filter((template) => template.style === style)
}

/**
 * 程序化封面的确定性模型。
 *
 * 同一 slug（自定义模板回落到 id）总得到同一 seed，因此封面构图稳定；
 * 标题在 6 字以内单行，更长时按中点分两行，最多 12 字，超出加省略号。
 */
export function buildCoverModel(template: TemplateCard): CoverModel {
  const title = template.title.replace(/\s+/g, ' ').trim()
  const style = template.style.replace(/\s+/g, ' ').trim()

  return {
    variant: template.category,
    seed: hashString(template.slug ?? template.id),
    titleLines: splitCoverTitle(title),
    styleLabel: truncateChars(style, COVER_STYLE_CHAR_LIMIT),
  }
}

function splitCoverTitle(title: string): string[] {
  const chars = Array.from(title)
  if (chars.length === 0) return []
  if (chars.length <= COVER_TITLE_LINE_LIMIT) return [title]

  const clipped = chars.slice(0, COVER_TITLE_CHAR_LIMIT)
  const hasMore = chars.length > clipped.length
  const midpoint = Math.ceil(clipped.length / 2)
  const first = clipped.slice(0, midpoint).join('').trim()
  const second = clipped.slice(midpoint).join('').trim()

  if (second.length === 0) return [first]
  return [first, hasMore ? `${second}…` : second]
}

function truncateChars(value: string, limit: number): string {
  const chars = Array.from(value)
  if (chars.length <= limit) return value
  return `${chars.slice(0, limit).join('')}…`
}

function hashString(value: string): number {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  return hash
}
