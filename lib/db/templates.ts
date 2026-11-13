import type { Template } from '@prisma/client'
import { getPrisma } from './prisma'

/**
 * v3 模板数据层（ROADMAP-V3 §2.1）。
 *
 * 内置模板由 prisma/seed.ts 按 slug 幂等写入；本层只负责读取、新建自定义
 * 模板与删除。自定义模板恒为 slug=null、builtin=false、coverKind=programmatic，
 * 这些内部字段不接受客户端覆盖。
 */

export interface TemplateDto {
  id: string
  slug: string | null
  category: 'text' | 'image' | 'video'
  style: string
  title: string
  description: string
  body: string
  mode: 'generate' | 'optimize'
  exampleInput: string | null
  coverKind: string
  featured: boolean
  builtin: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateCustomTemplateInput {
  category: TemplateDto['category']
  style: string
  title: string
  description: string
  body: string
  mode?: 'generate' | 'optimize'
  exampleInput?: string | null
  featured?: boolean
}

export type DeleteTemplateResult = 'deleted' | 'not_found' | 'builtin'

/** 数据库不可用等基础设施错误；路由统一映射为 500。 */
export class TemplatesStoreError extends Error {
  readonly code: 'DATABASE_UNAVAILABLE'

  constructor(message: string) {
    super(message)
    this.name = 'TemplatesStoreError'
    this.code = 'DATABASE_UNAVAILABLE'
  }
}

function requirePrisma() {
  const prisma = getPrisma()
  if (!prisma) {
    throw new TemplatesStoreError('数据库不可用，模板暂时无法读取或写入。')
  }
  return prisma
}

/** 数据库列是 String；取值由 seed 与 POST 校验保证，转成 DTO 的字面量联合。 */
function toTemplateDto(row: Template): TemplateDto {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category as TemplateDto['category'],
    style: row.style,
    title: row.title,
    description: row.description,
    body: row.body,
    mode: row.mode as TemplateDto['mode'],
    exampleInput: row.exampleInput,
    coverKind: row.coverKind,
    featured: row.featured,
    builtin: row.builtin,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function isPrismaNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2025'
  )
}

/**
 * 模板列表。排序固定：category asc、builtin desc、createdAt asc、id asc。
 * builtin desc 让同类内置模板排在自定义模板之前；id asc 为 createdAt 相同兜底。
 */
export async function listTemplates(
  category?: TemplateDto['category'],
): Promise<TemplateDto[]> {
  const prisma = requirePrisma()
  const rows = await prisma.template.findMany({
    where: category ? { category } : undefined,
    orderBy: [
      { category: 'asc' },
      { builtin: 'desc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  })
  return rows.map(toTemplateDto)
}

/** 新建自定义模板：内部字段强制，mode / featured / exampleInput 有默认值。 */
export async function createCustomTemplate(
  input: CreateCustomTemplateInput,
): Promise<TemplateDto> {
  const prisma = requirePrisma()
  const row = await prisma.template.create({
    data: {
      slug: null,
      category: input.category,
      style: input.style,
      title: input.title,
      description: input.description,
      body: input.body,
      mode: input.mode ?? 'optimize',
      exampleInput: input.exampleInput ?? null,
      coverKind: 'programmatic',
      featured: input.featured ?? false,
      builtin: false,
    },
  })
  return toTemplateDto(row)
}

/**
 * 删除自定义模板。内置模板返回 'builtin' 由路由映射为 409；
 * 不存在返回 'not_found'；并发下删除时行已消失同样按 'not_found' 处理。
 */
export async function deleteTemplate(id: string): Promise<DeleteTemplateResult> {
  const prisma = requirePrisma()
  const template = await prisma.template.findUnique({
    where: { id },
    select: { builtin: true },
  })
  if (!template) return 'not_found'
  if (template.builtin) return 'builtin'
  try {
    await prisma.template.delete({ where: { id } })
    return 'deleted'
  } catch (error) {
    if (isPrismaNotFound(error)) return 'not_found'
    throw error
  }
}
