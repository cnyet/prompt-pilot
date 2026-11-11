import { Prisma, type PrismaClient } from '@prisma/client'
import { getPrisma } from './prisma'
import {
  parsePromptSchema,
  type PromptSchema,
  type PromptVariable,
} from '@/lib/engine/schema'
import { renderSchemaMarkdown } from '@/lib/engine/render'

/**
 * 提示词与版本的落库层。
 *
 * 三条硬约束：
 * 1. v0 是用户首次输入，origin 固定为 user_input，任何修改或删除都在服务端拒绝。
 * 2. 版本号不接受客户端传入，由服务端按 max(versionNo) + 1 分配；并发写入靠
 *    SQLite 事务、唯一约束与有限重试保证不出现重复号。
 * 3. 写入失败必须抛出带 HTTP 语义的错误，路由层不猜数据库状态。
 */

export const PROMPT_VERSION_ORIGINS = [
  'user_input',
  'ai_generated',
  'ai_refined',
  'human_edited',
  'imported',
  'rollback',
] as const

export type PromptVersionOrigin = (typeof PROMPT_VERSION_ORIGINS)[number]

export function isPromptVersionOrigin(
  value: unknown,
): value is PromptVersionOrigin {
  return (
    typeof value === 'string' &&
    (PROMPT_VERSION_ORIGINS as readonly string[]).includes(value)
  )
}

export type PromptStoreErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INVALID_SCHEMA'
  | 'BASELINE_IMMUTABLE'
  | 'DATABASE_UNAVAILABLE'
  | 'WRITE_CONFLICT'
  | 'INTERNAL'

export class PromptStoreError extends Error {
  readonly code: PromptStoreErrorCode
  readonly status: number
  readonly detail?: unknown

  constructor(
    code: PromptStoreErrorCode,
    status: number,
    message: string,
    detail?: unknown,
  ) {
    super(message)
    this.name = 'PromptStoreError'
    this.code = code
    this.status = status
    if (detail !== undefined) {
      this.detail = detail
    }
  }
}

export interface PromptVersionSummary {
  id: string
  versionNo: number
  origin: PromptVersionOrigin
  changeSummary: string | null
  createdAt: string
  isBaseline: boolean
}

export interface PromptVersionDetail extends PromptVersionSummary {
  renderedText: string
  schemaJson: string
  /** 解析成功的结构化视图；历史数据损坏时返回 null，不阻断裂表。 */
  schema: PromptSchema | null
  parentVersionId: string | null
  modelId: string | null
}

export interface PromptVariableSummary {
  name: string
  label: string
  type: string
  required: boolean
  defaultValue: string | null
  options: string | null
  description: string | null
}

export interface PromptListItem {
  id: string
  title: string
  description: string | null
  tags: string
  status: string
  favorite: boolean
  createdAt: string
  updatedAt: string
  versionCount: number
  latestVersionNo: number | null
  latestOrigin: PromptVersionOrigin | null
  /** 最新版本正文的首行摘要，供库卡片展示；没有正文时为 null */
  preview: string | null
  /** 最近一次已完成评估的 v0 胜率（0-1）；没有评估或未判定时为 null */
  winRate: number | null
}

export interface PromptDetail extends PromptListItem {
  currentVersionId: string | null
  versions: PromptVersionDetail[]
  variables: PromptVariableSummary[]
}

export interface CreatePromptV0Input {
  title?: string
  description?: string
  tags?: string
  /** 用户第一次输入的那句话，原样作为 v0 的对照文本。 */
  sourceInput: string
  schema: unknown
}

export interface AppendPromptVersionInput {
  schema: unknown
  origin?: PromptVersionOrigin
  changeSummary?: string
  parentVersionId?: string
  /** 显式传入时优先；缺省由 schema 服务端渲染，避免客户端与库内容不一致。 */
  renderedText?: string
}

export interface UpdatePromptMetaInput {
  title?: string
  description?: string | null
  tags?: string
}

export interface ListPromptsInput {
  query?: string
  limit?: number
  offset?: number
}

export interface ListPromptsResult {
  prompts: PromptListItem[]
  total: number
}

const MAX_TITLE_LENGTH = 80
const MAX_CHANGE_SUMMARY_LENGTH = 200
const VERSION_WRITE_ATTEMPTS = 6

function requirePrisma(): PrismaClient {
  const prisma = getPrisma()
  if (!prisma) {
    throw new PromptStoreError(
      'DATABASE_UNAVAILABLE',
      503,
      '数据库不可用，提示词库暂不可用。',
    )
  }
  return prisma
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function isRetryableWriteConflict(error: unknown): boolean {
  const code = errorCodeOf(error)
  if (
    code === 'P2002' ||
    code === 'P2034' ||
    code === 'P2028' ||
    code === 'P1008'
  ) {
    return true
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('database is locked') || message.includes('sqlite_busy')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function toStoreError(error: unknown): PromptStoreError {
  if (error instanceof PromptStoreError) {
    return error
  }
  if (errorCodeOf(error) === 'P2025') {
    return new PromptStoreError('NOT_FOUND', 404, '提示词不存在。')
  }
  console.warn(
    '[prompt] 提示词库写入失败：',
    error instanceof Error ? error.message : String(error),
  )
  return new PromptStoreError('INTERNAL', 500, '提示词库操作失败，请稍后重试。')
}

function parseSchemaOrThrow(input: unknown): PromptSchema {
  const parsed = parsePromptSchema(input)
  if (!parsed.success) {
    throw new PromptStoreError(
      'INVALID_SCHEMA',
      400,
      '提示词结构不合法，无法保存。',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }
  return parsed.data
}

/**
 * 统一的基线保护。v0 是评估对照组，任何按版本号定位的写操作都要先过这里。
 * 导出给单测与后续版本编辑路由复用，避免每个调用方各写一遍判断。
 */
export function assertVersionWritable(versionNo: number): void {
  if (versionNo === 0) {
    throw new PromptStoreError(
      'BASELINE_IMMUTABLE',
      409,
      '基线 v0 不可修改或删除。',
      { versionNo: 0 },
    )
  }
}

/** 标题取显式值、生成结果或原始需求首行，压缩空白并限制长度。 */
export function normalizePromptTitle(
  explicitTitle: string | undefined,
  sourceInput: string,
): string {
  const explicit = explicitTitle?.trim() ?? ''
  const firstLine = sourceInput.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const candidate = explicit.length > 0 ? explicit : firstLine
  const compact = candidate.replace(/\s+/g, ' ').trim()
  if (compact.length === 0) {
    return '未命名提示词'
  }
  return compact.length > MAX_TITLE_LENGTH
    ? compact.slice(0, MAX_TITLE_LENGTH)
    : compact
}

function normalizeChangeSummary(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) {
    return null
  }
  return trimmed.length > MAX_CHANGE_SUMMARY_LENGTH
    ? trimmed.slice(0, MAX_CHANGE_SUMMARY_LENGTH)
    : trimmed
}

export function normalizeStoredOrigin(value: string): PromptVersionOrigin {
  return isPromptVersionOrigin(value) ? value : 'imported'
}

function schemaJsonOf(schema: PromptSchema): string {
  return JSON.stringify(schema)
}

function parseStoredSchema(schemaJson: string): PromptSchema | null {
  try {
    const value: unknown = JSON.parse(schemaJson)
    const parsed = parsePromptSchema(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function variablesOf(schema: PromptSchema): PromptVariable[] {
  return schema.input.variables
}

function toVersionSummary(row: {
  id: string
  versionNo: number
  origin: string
  changeSummary: string | null
  createdAt: Date
}): PromptVersionSummary {
  return {
    id: row.id,
    versionNo: row.versionNo,
    origin: normalizeStoredOrigin(row.origin),
    changeSummary: row.changeSummary,
    createdAt: row.createdAt.toISOString(),
    isBaseline: row.versionNo === 0,
  }
}

function toVersionDetail(row: {
  id: string
  versionNo: number
  origin: string
  changeSummary: string | null
  renderedText: string
  schemaJson: string
  parentVersionId: string | null
  modelId: string | null
  createdAt: Date
}): PromptVersionDetail {
  return {
    ...toVersionSummary(row),
    renderedText: row.renderedText,
    schemaJson: row.schemaJson,
    schema: parseStoredSchema(row.schemaJson),
    parentVersionId: row.parentVersionId,
    modelId: row.modelId,
  }
}

function toVariableSummary(row: {
  name: string
  label: string
  type: string
  required: boolean
  defaultValue: string | null
  options: string | null
  description: string | null
}): PromptVariableSummary {
  return {
    name: row.name,
    label: row.label,
    type: row.type,
    required: row.required,
    defaultValue: row.defaultValue,
    options: row.options,
    description: row.description,
  }
}

/** 取正文第一段有效文字作为卡片摘要 */
/** 评估任务里的 versionIds 是 JSON 数组字符串，坏数据按空数组处理。 */
function parseVersionIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * 每个提示词最近一次已完成评估的 v0 胜率。
 * 一次只取最近 200 条评估任务，列表页不为此做分页。
 */
async function latestWinRates(
  prisma: PrismaClient,
  promptIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (promptIds.length === 0) {
    return result
  }
  const [versions, tasks] = await Promise.all([
    prisma.promptVersion.findMany({
      where: { promptId: { in: promptIds } },
      select: { id: true, promptId: true },
    }),
    prisma.evalTask.findMany({
      where: { status: 'completed', winRate: { not: null } },
      orderBy: { finishedAt: 'desc' },
      take: 200,
      select: { winRate: true, versionIds: true },
    }),
  ])
  if (versions.length === 0 || tasks.length === 0) {
    return result
  }
  const promptOfVersion = new Map(
    versions.map((version) => [version.id, version.promptId]),
  )
  for (const task of tasks) {
    if (task.winRate === null) {
      continue
    }
    for (const versionId of parseVersionIds(task.versionIds)) {
      const promptId = promptOfVersion.get(versionId)
      // 任务按结束时间倒序，先写进结果的就是该提示词最近的一次评估。
      if (promptId && !result.has(promptId)) {
        result.set(promptId, task.winRate)
      }
    }
  }
  return result
}

function previewOf(text: string | undefined): string | null {
  if (!text) {
    return null
  }
  const line = text
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.length > 0)
  if (!line) {
    return null
  }
  return Array.from(line).slice(0, 90).join('')
}

function toListItem(row: {
  id: string
  title: string
  description: string | null
  tags: string
  status: string
  favorite: boolean
  createdAt: Date
  updatedAt: Date
  _count: { versions: number }
  versions: Array<{
    versionNo: number
    origin: string
    renderedText: string
  }>
}, winRate: number | null = null): PromptListItem {
  const latest = row.versions[0]
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags,
    status: row.status,
    favorite: row.favorite,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    versionCount: row._count.versions,
    preview: previewOf(latest?.renderedText),
    latestVersionNo: latest?.versionNo ?? null,
    latestOrigin: latest ? normalizeStoredOrigin(latest.origin) : null,
    winRate,
  }
}

async function syncVariables(
  tx: Prisma.TransactionClient,
  promptId: string,
  schema: PromptSchema,
): Promise<void> {
  const variables = variablesOf(schema)
  const names = variables.map((variable) => variable.name)
  if (names.length === 0) {
    await tx.variable.deleteMany({ where: { promptId } })
    return
  }
  await tx.variable.deleteMany({
    where: { promptId, name: { notIn: names } },
  })
  for (const variable of variables) {
    const data = {
      label: variable.label,
      type: variable.type,
      required: variable.required,
      defaultValue: variable.defaultValue ?? null,
      options:
        variable.options === undefined ? null : JSON.stringify(variable.options),
      description: variable.description ?? null,
    }
    await tx.variable.upsert({
      where: { promptId_name: { promptId, name: variable.name } },
      create: { promptId, name: variable.name, ...data },
      update: data,
    })
  }
}

/**
 * 创建提示词并写入 v0。
 *
 * v0 的 renderedText 固定为原始输入，供后续评估作为对照组；schemaJson 保存
 * 首次生成的结构化文档，供提示词库打开后继续编辑。两者用途不同，不能互相替代。
 */
export async function createPromptWithV0(
  input: CreatePromptV0Input,
): Promise<PromptDetail> {
  const sourceInput = input.sourceInput.trim()
  if (sourceInput.length === 0) {
    throw new PromptStoreError('INVALID_INPUT', 400, '原始需求不能为空。')
  }
  const schema = parseSchemaOrThrow(input.schema)
  const title = normalizePromptTitle(input.title, sourceInput)
  const description = input.description?.trim() ?? ''
  const tags = input.tags?.trim() ?? ''
  const schemaJson = schemaJsonOf(schema)
  const prisma = requirePrisma()

  try {
    const promptId = await prisma.$transaction(async (tx) => {
      const prompt = await tx.prompt.create({
        data: {
          title,
          description: description.length > 0 ? description : null,
          tags,
        },
      })
      const version = await tx.promptVersion.create({
        data: {
          promptId: prompt.id,
          versionNo: 0,
          origin: 'user_input',
          schemaJson,
          renderedText: sourceInput,
          changeSummary: '用户首次输入',
        },
      })
      await tx.prompt.update({
        where: { id: prompt.id },
        data: { currentVersionId: version.id },
      })
      await syncVariables(tx, prompt.id, schema)
      return prompt.id
    })
    const detail = await getPromptDetail(promptId)
    if (!detail) {
      throw new PromptStoreError('INTERNAL', 500, '提示词写入后无法读取。')
    }
    return detail
  } catch (error) {
    throw toStoreError(error)
  }
}

/**
 * 追加一个新版本。
 *
 * 版本号在事务内由 max(versionNo) + 1 计算，客户端传入的 versionNo 不会进入
 * 这里。并发写入时唯一约束会拒绝重复号，事务整体回滚后重试，直到拿到下一号。
 */
export async function appendPromptVersion(
  promptId: string,
  input: AppendPromptVersionInput,
): Promise<PromptDetail> {
  const schema = parseSchemaOrThrow(input.schema)
  const requestedOrigin = input.origin ?? 'human_edited'
  if (!isPromptVersionOrigin(requestedOrigin)) {
    throw new PromptStoreError(
      'INVALID_INPUT',
      400,
      '版本来源不在允许范围内。',
    )
  }
  if (requestedOrigin === 'user_input') {
    throw new PromptStoreError(
      'INVALID_INPUT',
      400,
      'user_input 只用于首次生成的基线 v0。',
    )
  }
  const origin: PromptVersionOrigin = requestedOrigin
  const changeSummary = normalizeChangeSummary(input.changeSummary)
  const renderedText = input.renderedText?.trim()
  const finalRenderedText =
    renderedText !== undefined && renderedText.length > 0
      ? renderedText
      : renderSchemaMarkdown(schema)
  const schemaJson = schemaJsonOf(schema)
  const prisma = requirePrisma()

  for (let attempt = 0; attempt < VERSION_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const versionId = await prisma.$transaction(
        async (tx) => {
          const prompt = await tx.prompt.findUnique({
            where: { id: promptId },
            select: { id: true },
          })
          if (!prompt) {
            throw new PromptStoreError('NOT_FOUND', 404, '提示词不存在。')
          }
          const latest = await tx.promptVersion.findFirst({
            where: { promptId },
            orderBy: { versionNo: 'desc' },
            select: { id: true, versionNo: true },
          })
          if (!latest) {
            throw new PromptStoreError(
              'WRITE_CONFLICT',
              409,
              '提示词缺少基线 v0，无法追加版本。',
            )
          }
          const nextVersionNo = latest.versionNo + 1
          // v0 只能由 createPromptWithV0 写入；追加路径永远从 1 起。
          assertVersionWritable(nextVersionNo)

          let parentVersionId = latest.id
          if (input.parentVersionId !== undefined) {
            const parent = await tx.promptVersion.findFirst({
              where: { id: input.parentVersionId, promptId },
              select: { id: true },
            })
            if (!parent) {
              throw new PromptStoreError(
                'INVALID_INPUT',
                400,
                '父版本不属于这条提示词。',
              )
            }
            parentVersionId = parent.id
          }

          const version = await tx.promptVersion.create({
            data: {
              promptId,
              versionNo: nextVersionNo,
              origin,
              schemaJson,
              renderedText: finalRenderedText,
              changeSummary,
              parentVersionId,
            },
          })
          await tx.prompt.update({
            where: { id: promptId },
            data: { currentVersionId: version.id },
          })
          await syncVariables(tx, promptId, schema)
          return version.id
        },
        { maxWait: 5_000, timeout: 10_000 },
      )
      if (versionId.length === 0) {
        throw new PromptStoreError('INTERNAL', 500, '版本写入后无法读取。')
      }
      const detail = await getPromptDetail(promptId)
      if (!detail) {
        throw new PromptStoreError('INTERNAL', 500, '版本写入后无法读取。')
      }
      return detail
    } catch (error) {
      if (
        attempt < VERSION_WRITE_ATTEMPTS - 1 &&
        isRetryableWriteConflict(error)
      ) {
        await sleep(20 * (attempt + 1))
        continue
      }
      throw toStoreError(error)
    }
  }
  throw new PromptStoreError(
    'WRITE_CONFLICT',
    409,
    '版本号写入冲突，请重试。',
  )
}

/** 更新提示词元信息，不触碰任何版本行。 */
export async function updatePromptMeta(
  promptId: string,
  input: UpdatePromptMetaInput,
): Promise<PromptDetail> {
  const data: Prisma.PromptUpdateInput = {}
  if (input.title !== undefined) {
    const title = normalizePromptTitle(input.title, '')
    if (title === '未命名提示词') {
      throw new PromptStoreError('INVALID_INPUT', 400, '标题不能为空。')
    }
    data.title = title
  }
  if (input.description !== undefined) {
    const description = input.description?.trim() ?? ''
    data.description = description.length > 0 ? description : null
  }
  if (input.tags !== undefined) {
    data.tags = input.tags.trim()
  }
  if (Object.keys(data).length === 0) {
    throw new PromptStoreError('INVALID_INPUT', 400, '没有需要更新的内容。')
  }
  const prisma = requirePrisma()
  try {
    await prisma.prompt.update({ where: { id: promptId }, data })
    const detail = await getPromptDetail(promptId)
    if (!detail) {
      throw new PromptStoreError('NOT_FOUND', 404, '提示词不存在。')
    }
    return detail
  } catch (error) {
    throw toStoreError(error)
  }
}

/** 缺少数据库时返回 null，由路由层转成 503。 */
export async function listPrompts(
  input: ListPromptsInput = {},
): Promise<ListPromptsResult> {
  const prisma = getPrisma()
  if (!prisma) {
    throw new PromptStoreError(
      'DATABASE_UNAVAILABLE',
      503,
      '数据库不可用，提示词库暂不可用。',
    )
  }
  const query = input.query?.trim() ?? ''
  const limit = Math.min(100, Math.max(1, Math.round(input.limit ?? 50)))
  const offset = Math.max(0, Math.round(input.offset ?? 0))
  const where: Prisma.PromptWhereInput =
    query.length > 0
      ? {
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
            { tags: { contains: query } },
            { versions: { some: { renderedText: { contains: query } } } },
          ],
        }
      : {}

  try {
    const [rows, total] = await Promise.all([
      prisma.prompt.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: { select: { versions: true } },
          versions: {
            orderBy: { versionNo: 'desc' },
            take: 1,
            select: { versionNo: true, origin: true, renderedText: true },
          },
        },
      }),
      prisma.prompt.count({ where }),
    ])
    const winRates = await latestWinRates(
      prisma,
      rows.map((row) => row.id),
    )
    return {
      prompts: rows.map((row) => toListItem(row, winRates.get(row.id) ?? null)),
      total,
    }
  } catch (error) {
    throw toStoreError(error)
  }
}

/** 详情带完整版本时间线与变量清单；找不到时返回 null。 */
export async function getPromptDetail(
  promptId: string,
): Promise<PromptDetail | null> {
  const prisma = getPrisma()
  if (!prisma) {
    throw new PromptStoreError(
      'DATABASE_UNAVAILABLE',
      503,
      '数据库不可用，提示词库暂不可用。',
    )
  }
  try {
    const row = await prisma.prompt.findUnique({
      where: { id: promptId },
      include: {
        _count: { select: { versions: true } },
        versions: { orderBy: { versionNo: 'asc' } },
        variables: { orderBy: { name: 'asc' } },
      },
    })
    if (!row) {
      return null
    }
    const versions = row.versions.map(toVersionDetail)
    const latest = versions[versions.length - 1]
    const winRates = await latestWinRates(prisma, [promptId])
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      tags: row.tags,
      status: row.status,
      favorite: row.favorite,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      versionCount: row._count.versions,
      preview: previewOf(latest?.renderedText),
      latestVersionNo: latest?.versionNo ?? null,
      latestOrigin: latest?.origin ?? null,
      winRate: winRates.get(promptId) ?? null,
      currentVersionId: row.currentVersionId,
      versions,
      variables: row.variables.map(toVariableSummary),
    }
  } catch (error) {
    throw toStoreError(error)
  }
}

/**
 * 删除提示词。只要存在 v0 就拒绝：删除整条记录等同于删除基线，与「不可删除」
 * 冲突。没有 v0 的异常数据仍允许清理。
 */
export async function deletePrompt(promptId: string): Promise<void> {
  const prisma = requirePrisma()
  try {
    const baseline = await prisma.promptVersion.findFirst({
      where: { promptId, versionNo: 0 },
      select: { id: true },
    })
    if (baseline) {
      throw new PromptStoreError(
        'BASELINE_IMMUTABLE',
        409,
        '这条提示词包含基线 v0，不能删除。',
        { versionId: baseline.id, versionNo: 0 },
      )
    }
    const result = await prisma.prompt.deleteMany({ where: { id: promptId } })
    if (result.count === 0) {
      throw new PromptStoreError('NOT_FOUND', 404, '提示词不存在。')
    }
  } catch (error) {
    throw toStoreError(error)
  }
}
