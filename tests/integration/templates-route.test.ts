import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as listRoute, POST as createRoute } from '@/app/api/templates/route'
import { DELETE as deleteRoute } from '@/app/api/templates/[id]/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import type { TemplateDto } from '@/lib/db/templates'
import { seedBuiltinTemplates } from '@/prisma/seed'

// 模板读取 / 新建 / 删除 API 的契约测试。
// 数据在隔离的 data/test.db；路由直接以 Request 调用，不起 HTTP 服务。

let prisma: ReturnType<typeof getPrisma> = null

/** 响应里的日期是 JSON 字符串，其余字段与 TemplateDto 一致。 */
interface WireTemplate extends Omit<TemplateDto, 'createdAt' | 'updatedAt'> {
  createdAt: string
  updatedAt: string
}

interface ListBody {
  templates: WireTemplate[]
}

interface CreateBody {
  template: WireTemplate
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const listGet = (qs = '') =>
  listRoute(new Request(`http://localhost/api/templates${qs}`))

const createPost = (body: unknown) =>
  createRoute(
    new Request('http://localhost/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const createRawPost = (raw: string) =>
  createRoute(
    new Request('http://localhost/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    }),
  )

const deleteReq = (id: string) =>
  deleteRoute(new Request(`http://localhost/api/templates/${id}`, { method: 'DELETE' }), ctx(id))

const validBody = {
  category: 'text',
  style: '营销',
  title: '我的自定义模板',
  description: '一句话说明这个模板做什么。',
  body: '你是一名编辑，请把下面的草稿改成结构清楚的短文。',
}

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

describe('GET /api/templates 列表', () => {
  it('seed 后返回 12 条内置模板，按 category asc 分组，响应 no-store', async () => {
    await seedBuiltinTemplates(prisma!)

    const response = await listGet()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')

    const body = (await response.json()) as ListBody
    expect(body.templates).toHaveLength(12)
    expect(body.templates.every((template) => template.builtin)).toBe(true)
    // category asc 是字符串升序：image < text < video。
    expect(body.templates.map((template) => template.category)).toEqual([
      'image',
      'image',
      'image',
      'image',
      'text',
      'text',
      'text',
      'text',
      'video',
      'video',
      'video',
      'video',
    ])

    const weekly = body.templates.find((template) => template.slug === 'weekly-report')
    expect(weekly).toMatchObject({
      title: '周报助手',
      category: 'text',
      style: '公文',
      mode: 'generate',
      featured: true,
    })
    expect(weekly!.body).toContain('你是一名注重事实的行政助理。')
    expect(weekly!.createdAt).toBeTypeOf('string')
  })

  it('同一分类内 builtin 在前，其次 createdAt asc，最后 id asc 兜底', async () => {
    await seedBuiltinTemplates(prisma!)
    const sameAt = new Date('2026-01-01T00:00:00.000Z')
    await prisma!.template.updateMany({ where: { builtin: true }, data: { createdAt: sameAt } })

    // 自定义模板 createdAt 更早，但 builtin=false，仍排在同类内置模板之后。
    const custom = await prisma!.template.create({
      data: {
        slug: null,
        category: 'text',
        style: '营销',
        title: '自定义模板',
        description: '自定义说明',
        body: '自定义正文',
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    })

    const first = (await (await listGet()).json()) as ListBody
    const textRows = first.templates.filter((template) => template.category === 'text')
    expect(textRows).toHaveLength(5)
    expect(textRows.slice(0, 4).every((template) => template.builtin)).toBe(true)
    expect(textRows[4]!.id).toBe(custom.id)

    // createdAt 相同 → 同类内置模板按 id asc。
    const textIds = textRows.slice(0, 4).map((template) => template.id)
    expect(textIds).toEqual([...textIds].sort())

    // 把其中一条的 createdAt 调晚，它应排到该分类内置模板末尾。
    await prisma!.template.update({
      where: { slug: 'weekly-report' },
      data: { createdAt: new Date('2026-02-01T00:00:00.000Z') },
    })
    const second = (await (await listGet()).json()) as ListBody
    const textAfter = second.templates.filter((template) => template.category === 'text')
    expect(textAfter[3]!.slug).toBe('weekly-report')
    expect(textAfter[4]!.id).toBe(custom.id)

    // image 分类同样按 createdAt asc：调晚的一条排到最后。
    await prisma!.template.update({
      where: { slug: 'isometric-3d' },
      data: { createdAt: new Date('2026-03-01T00:00:00.000Z') },
    })
    const third = (await (await listGet()).json()) as ListBody
    const imageRows = third.templates.filter((template) => template.category === 'image')
    expect(imageRows[3]!.slug).toBe('isometric-3d')
  })

  it('?category=image 只返回图片模板', async () => {
    await seedBuiltinTemplates(prisma!)

    const body = (await (await listGet('?category=image')).json()) as ListBody
    expect(body.templates).toHaveLength(4)
    expect(body.templates.every((template) => template.category === 'image')).toBe(true)
  })

  it('非法 category 返回 400 INVALID_QUERY', async () => {
    for (const qs of ['?category=bogus', '?category=', '?category=IMAGE']) {
      const response = await listGet(qs)
      expect(response.status, qs).toBe(400)
      expect(await response.json(), qs).toMatchObject({
        code: 'INVALID_QUERY',
        retryable: false,
      })
    }
  })
})

describe('POST /api/templates 新建自定义模板', () => {
  it('最小输入返回 201，强制 builtin=false、slug=null、coverKind=programmatic，mode 默认 optimize', async () => {
    const response = await createPost(validBody)
    expect(response.status).toBe(201)

    const { template } = (await response.json()) as CreateBody
    expect(template).toMatchObject({
      slug: null,
      category: 'text',
      style: '营销',
      title: '我的自定义模板',
      description: '一句话说明这个模板做什么。',
      body: '你是一名编辑，请把下面的草稿改成结构清楚的短文。',
      mode: 'optimize',
      exampleInput: null,
      coverKind: 'programmatic',
      featured: false,
      builtin: false,
    })
    expect(template.id).toBeTypeOf('string')
    expect(template.createdAt).toBeTypeOf('string')

    const row = await prisma!.template.findUnique({ where: { id: template.id } })
    expect(row).not.toBeNull()
    expect(row!.builtin).toBe(false)
    expect(row!.slug).toBeNull()
    expect(row!.coverKind).toBe('programmatic')

    const listed = (await (await listGet()).json()) as ListBody
    expect(listed.templates.map((item) => item.id)).toContain(template.id)
  })

  it('保留调用方给出的 mode、exampleInput 与 featured；边界长度可接受', async () => {
    const response = await createPost({
      category: 'video',
      style: '分镜'.repeat(20), // 40 字符，等于上限
      title: '标'.repeat(80),
      description: '说'.repeat(200),
      body: '正文'.repeat(4000), // 8000 字符，等于上限
      mode: 'generate',
      exampleInput: '示例需求',
      featured: true,
    })
    expect(response.status).toBe(201)

    const { template } = (await response.json()) as CreateBody
    expect(template.category).toBe('video')
    expect(template.style).toHaveLength(40)
    expect(template.title).toHaveLength(80)
    expect(template.description).toHaveLength(200)
    expect(template.body).toHaveLength(8000)
    expect(template.mode).toBe('generate')
    expect(template.exampleInput).toBe('示例需求')
    expect(template.featured).toBe(true)
  })

  it('非法输入返回 400 INVALID_INPUT', async () => {
    const cases: Array<[string, unknown]> = [
      ['空对象', {}],
      ['category 非法', { ...validBody, category: 'bogus' }],
      ['style 为空', { ...validBody, style: '' }],
      ['style 全空格', { ...validBody, style: '   ' }],
      ['style 超长', { ...validBody, style: 'a'.repeat(41) }],
      ['title 为空', { ...validBody, title: '' }],
      ['title 超长', { ...validBody, title: 'a'.repeat(81) }],
      ['description 为空', { ...validBody, description: '' }],
      ['description 超长', { ...validBody, description: 'a'.repeat(201) }],
      ['body 为空', { ...validBody, body: '' }],
      ['body 超长', { ...validBody, body: 'a'.repeat(8001) }],
      ['mode 非法', { ...validBody, mode: 'repair' }],
      ['exampleInput 超长', { ...validBody, exampleInput: 'a'.repeat(2001) }],
      ['featured 类型错误', { ...validBody, featured: 'yes' }],
      ['客户端传入 builtin', { ...validBody, builtin: true }],
      ['客户端传入 slug', { ...validBody, slug: 'my-template' }],
      ['客户端传入 coverKind', { ...validBody, coverKind: 'photo' }],
      ['客户端传入 id', { ...validBody, id: 'tpl-1' }],
      ['客户端传入时间戳', { ...validBody, createdAt: '2026-01-01T00:00:00.000Z' }],
    ]

    for (const [label, payload] of cases) {
      const response = await createPost(payload)
      expect(response.status, label).toBe(400)
      expect(await response.json(), label).toMatchObject({
        code: 'INVALID_INPUT',
        retryable: false,
      })
    }
    expect(await prisma!.template.count()).toBe(0)
  })

  it('请求体不是合法 JSON 返回 400 INVALID_INPUT', async () => {
    const response = await createRawPost('{not json')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('DELETE /api/templates/[id] 删除', () => {
  it('删除自定义模板返回 204 空响应体，再次删除返回 404', async () => {
    const created = await createPost(validBody)
    const { template } = (await created.json()) as CreateBody

    const response = await deleteReq(template.id)
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(await prisma!.template.findUnique({ where: { id: template.id } })).toBeNull()

    const again = await deleteReq(template.id)
    expect(again.status).toBe(404)
    expect(await again.json()).toMatchObject({
      code: 'TEMPLATE_NOT_FOUND',
      retryable: false,
    })
  })

  it('删除不存在的模板返回 404 TEMPLATE_NOT_FOUND', async () => {
    const response = await deleteReq('missing-id')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'TEMPLATE_NOT_FOUND' })
  })

  it('内置模板不可删除，返回 409 TEMPLATE_BUILTIN 且行保留', async () => {
    await seedBuiltinTemplates(prisma!)
    const builtin = await prisma!.template.findUniqueOrThrow({
      where: { slug: 'weekly-report' },
    })

    const response = await deleteReq(builtin.id)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'TEMPLATE_BUILTIN',
      retryable: false,
    })
    expect(
      await prisma!.template.findUnique({ where: { id: builtin.id } }),
    ).not.toBeNull()
  })
})
