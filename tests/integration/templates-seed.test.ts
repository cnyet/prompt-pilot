import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { BUILTIN_TEMPLATES, seedBuiltinTemplates } from '@/prisma/seed'

// 内置模板 seed 的契约测试。
// 连跑两次验证幂等；自定义模板（slug=null）不被触碰。
// 数据在隔离的 data/test.db，绝不读写 data/app.db。

let prisma: ReturnType<typeof getPrisma> = null

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})

beforeEach(async () => {
  await prisma!.template.deleteMany({})
})

afterAll(async () => {
  await disconnectPrisma()
})

describe('seedBuiltinTemplates', () => {
  it('连跑两次后内置模板仍为 12 条，text / image / video 各 4 条', async () => {
    expect(await seedBuiltinTemplates(prisma!)).toBe(12)
    expect(await seedBuiltinTemplates(prisma!)).toBe(12)

    const builtins = await prisma!.template.findMany({ where: { builtin: true } })
    expect(builtins).toHaveLength(12)

    const counts = { text: 0, image: 0, video: 0 }
    for (const row of builtins) {
      counts[row.category as keyof typeof counts] += 1
    }
    expect(counts).toEqual({ text: 4, image: 4, video: 4 })
  })

  it('每条 slug 非空且唯一、builtin=true、正文非空；text 四条的 style 互不相同', async () => {
    await seedBuiltinTemplates(prisma!)

    const builtins = await prisma!.template.findMany({ where: { builtin: true } })
    for (const row of builtins) {
      expect(row.slug, row.title).toBeTruthy()
      expect(row.builtin, row.title).toBe(true)
      expect(row.body.trim().length, row.title).toBeGreaterThan(0)
    }
    expect(new Set(builtins.map((row) => row.slug)).size).toBe(12)

    const textStyles = builtins
      .filter((row) => row.category === 'text')
      .map((row) => row.style)
    expect(textStyles).toHaveLength(4)
    expect(new Set(textStyles).size).toBe(4)
  })

  it('generate 模板都带示例输入，optimize 模板正文非空', async () => {
    await seedBuiltinTemplates(prisma!)

    const builtins = await prisma!.template.findMany({ where: { builtin: true } })
    const generate = builtins.filter((row) => row.mode === 'generate')
    expect(generate).toHaveLength(10)
    for (const row of generate) {
      expect(row.exampleInput, row.title).toBeTruthy()
      expect(row.exampleInput!.trim().length, row.title).toBeGreaterThan(0)
    }

    const optimize = builtins.filter((row) => row.mode === 'optimize')
    expect(optimize).toHaveLength(2)
    for (const row of optimize) {
      expect(row.body.trim().length, row.title).toBeGreaterThan(0)
    }
  })

  it('seed 前插入的自定义模板在 seed 后仍存在且保持自定义', async () => {
    const custom = await prisma!.template.create({
      data: {
        slug: null,
        category: 'text',
        style: '营销',
        title: '我的自定义模板',
        description: '自定义说明',
        body: '自定义正文',
      },
    })

    await seedBuiltinTemplates(prisma!)

    const still = await prisma!.template.findUnique({ where: { id: custom.id } })
    expect(still).not.toBeNull()
    expect(still!.slug).toBeNull()
    expect(still!.builtin).toBe(false)
    expect(still!.body).toBe('自定义正文')
    expect(await prisma!.template.count({ where: { builtin: false } })).toBe(1)
  })

  it('重复 seed 会按 slug 恢复被修改的内置模板内容', async () => {
    await seedBuiltinTemplates(prisma!)
    await prisma!.template.update({
      where: { slug: 'weekly-report' },
      data: { title: '被改坏的标题', body: '被改坏的正文', featured: false },
    })

    await seedBuiltinTemplates(prisma!)

    const row = await prisma!.template.findUniqueOrThrow({ where: { slug: 'weekly-report' } })
    expect(row.title).toBe('周报助手')
    expect(row.body).toContain('你是一名注重事实的行政助理。')
    expect(row.featured).toBe(true)
    expect(row.builtin).toBe(true)
  })

  it('BUILTIN_TEMPLATES 含 12 条且 slug 唯一', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(12)
    expect(new Set(BUILTIN_TEMPLATES.map((template) => template.slug)).size).toBe(12)
  })
})
