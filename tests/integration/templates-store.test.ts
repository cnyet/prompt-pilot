import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import {
  createCustomTemplate,
  deleteTemplate,
  getTemplate,
} from '@/lib/db/templates'
import { resolveTemplatePrefill } from '@/lib/templates-v3'
import { BUILTIN_TEMPLATES, seedBuiltinTemplates } from '@/prisma/seed'

// v3 模板数据层：单条读取与「用它开始」预填的数据链路。
// 数据在隔离的 data/test.db；绝不读写 data/app.db。

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

describe('getTemplate', () => {
  it('returns the full DTO for an existing template', async () => {
    await seedBuiltinTemplates(prisma!)
    const row = await prisma!.template.findUniqueOrThrow({
      where: { slug: 'weekly-report' },
    })

    const template = await getTemplate(row.id)

    expect(template).not.toBeNull()
    expect(template).toMatchObject({
      id: row.id,
      slug: 'weekly-report',
      category: 'text',
      title: '周报助手',
      mode: 'generate',
      exampleInput: expect.stringContaining('本周完成新版落地页上线'),
      featured: true,
      builtin: true,
    })
    expect(template!.body).toContain('你是一名注重事实的行政助理。')
    expect(template!.createdAt).toBeInstanceOf(Date)
    expect(template!.updatedAt).toBeInstanceOf(Date)
  })

  it('returns null for a missing id', async () => {
    expect(await getTemplate('missing-id')).toBeNull()
  })
})

describe('built-in template prefill', () => {
  it('resolves a generate template from its example input', async () => {
    await seedBuiltinTemplates(prisma!)
    const row = await prisma!.template.findUniqueOrThrow({
      where: { slug: 'weekly-report' },
    })

    const prefill = resolveTemplatePrefill((await getTemplate(row.id))!)

    expect(prefill).toMatchObject({
      originTemplateId: row.id,
      mode: 'generate',
      targetType: 'text',
    })
    expect(prefill!.sourceInput).toContain('本周完成新版落地页上线')
  })

  it('resolves an optimize template from its body', async () => {
    await seedBuiltinTemplates(prisma!)
    const row = await prisma!.template.findUniqueOrThrow({
      where: { slug: 'camera-move' },
    })

    const prefill = resolveTemplatePrefill((await getTemplate(row.id))!)

    expect(prefill).toMatchObject({
      originTemplateId: row.id,
      mode: 'optimize',
      targetType: 'video',
    })
    expect(prefill!.sourceInput).toContain('镜头慢慢推近')
  })

  it('resolves every built-in template to a non-empty prefill', async () => {
    await seedBuiltinTemplates(prisma!)

    for (const seed of BUILTIN_TEMPLATES) {
      const row = await prisma!.template.findUniqueOrThrow({
        where: { slug: seed.slug },
      })
      const prefill = resolveTemplatePrefill((await getTemplate(row.id))!)

      expect(prefill, seed.slug).not.toBeNull()
      expect(prefill!.mode, seed.slug).toBe(seed.mode)
      expect(prefill!.sourceInput.trim().length, seed.slug).toBeGreaterThan(0)
    }
  })
})

describe('custom template round trip', () => {
  it('reads and prefills a custom generate template with example input', async () => {
    const created = await createCustomTemplate({
      category: 'text',
      style: '运营',
      title: '活动方案模板',
      description: '把活动目标扩写成可执行方案。',
      body: '你是一名运营，请根据目标写活动方案。',
      mode: 'generate',
      exampleInput: '写一份新品首发活动方案',
    })

    const loaded = await getTemplate(created.id)
    expect(loaded).not.toBeNull()
    expect(loaded).toMatchObject({
      id: created.id,
      slug: null,
      title: '活动方案模板',
      mode: 'generate',
      exampleInput: '写一份新品首发活动方案',
      builtin: false,
    })

    expect(resolveTemplatePrefill(loaded!)).toMatchObject({
      originTemplateId: created.id,
      mode: 'generate',
      sourceInput: '写一份新品首发活动方案',
      targetType: 'text',
    })

    expect(await deleteTemplate(created.id)).toBe('deleted')
    expect(await getTemplate(created.id)).toBeNull()
  })

  it('prefills a custom optimize template from its body', async () => {
    const created = await createCustomTemplate({
      category: 'video',
      style: '运镜',
      title: '我的运镜模板',
      description: '把口语化运镜改成可执行镜头。',
      body: '  镜头围绕人物旋转半圈。  ',
      mode: 'optimize',
    })

    const loaded = await getTemplate(created.id)
    expect(resolveTemplatePrefill(loaded!)).toMatchObject({
      originTemplateId: created.id,
      mode: 'optimize',
      sourceInput: '镜头围绕人物旋转半圈。',
      targetType: 'video',
    })
  })
})
