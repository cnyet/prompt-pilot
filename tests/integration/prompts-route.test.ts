import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  GET as listPromptsRoute,
  POST as createPromptRoute,
} from '@/app/api/prompts/route'
import {
  DELETE as deletePromptRoute,
  GET as getPromptRoute,
  PATCH as patchPromptRoute,
} from '@/app/api/prompts/[id]/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { createSkeletonSchema, type PromptSchema } from '@/lib/engine/schema'
import type {
  ListPromptsResult,
  PromptDetail,
  PromptListItem,
} from '@/lib/db/prompts'

interface PromptResponse {
  prompt: PromptDetail
}

interface ListResponse extends ListPromptsResult {
  query: string
  limit: number
  offset: number
}

const createdIds: string[] = []
let prisma: ReturnType<typeof getPrisma> = null

function makeSchema(title: string): PromptSchema {
  const schema = createSkeletonSchema(title, 'writing')
  return {
    ...schema,
    objective: {
      ...schema.objective,
      goal: '写一份结构清晰、可以直接发给团队的本周周报',
      successCriteria: ['包含三条进展', '风险单独成段'],
    },
  }
}

function versionedSchema(title: string, goal: string): PromptSchema {
  const schema = makeSchema(title)
  return {
    ...schema,
    objective: { ...schema.objective, goal },
  }
}

function request(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function contextOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

async function createPrompt(
  title: string,
  sourceInput = '帮我写个周报',
  schema: PromptSchema = makeSchema(title),
): Promise<PromptDetail> {
  const response = await createPromptRoute(
    request('POST', 'http://localhost/api/prompts', {
      title,
      sourceInput,
      schema,
    }),
  )
  expect(response.status).toBe(201)
  const payload = (await response.json()) as PromptResponse
  createdIds.push(payload.prompt.id)
  return payload.prompt
}

function patchPrompt(id: string, body: unknown): Promise<Response> {
  return patchPromptRoute(
    request('PATCH', `http://localhost/api/prompts/${id}`, body),
    contextOf(id),
  )
}

function getPrompt(id: string): Promise<Response> {
  return getPromptRoute(
    request('GET', `http://localhost/api/prompts/${id}`),
    contextOf(id),
  )
}

function deletePrompt(id: string): Promise<Response> {
  return deletePromptRoute(
    request('DELETE', `http://localhost/api/prompts/${id}`),
    contextOf(id),
  )
}

beforeAll(() => {
  vi.stubEnv('DATABASE_URL', 'file:../data/app.db')
  prisma = getPrisma()
  expect(prisma).not.toBeNull()
})

afterAll(async () => {
  if (prisma && createdIds.length > 0) {
    await prisma.promptVersion.deleteMany({
      where: { promptId: { in: createdIds } },
    })
    await prisma.variable.deleteMany({
      where: { promptId: { in: createdIds } },
    })
    await prisma.prompt.deleteMany({ where: { id: { in: createdIds } } })
  }
  await disconnectPrisma()
  vi.unstubAllEnvs()
})

describe('创建基线 v0', () => {
  it('首次创建写入 v0，原始输入作为 renderedText，版本号为 0', async () => {
    const title = `周报助手-${randomUUID().slice(0, 8)}`
    const prompt = await createPrompt(title, '帮我写个周报', makeSchema(title))

    expect(prompt.title).toBe(title)
    expect(prompt.versionCount).toBe(1)
    expect(prompt.latestVersionNo).toBe(0)
    expect(prompt.versions).toHaveLength(1)
    const baseline = prompt.versions[0]
    expect(baseline).toBeDefined()
    if (!baseline) {
      return
    }
    expect(baseline.versionNo).toBe(0)
    expect(baseline.origin).toBe('user_input')
    expect(baseline.renderedText).toBe('帮我写个周报')
    expect(baseline.isBaseline).toBe(true)
    expect(baseline.schema?.objective.goal).toContain('周报')
    expect(prompt.currentVersionId).toBe(baseline.id)
    expect(prompt.variables).toHaveLength(0)
  })

  it('兼容 schemaJson 字符串与 userInput 别名', async () => {
    const title = `别名-${randomUUID().slice(0, 8)}`
    const response = await createPromptRoute(
      request('POST', 'http://localhost/api/prompts', {
        title,
        userInput: '用一句话写产品说明',
        schemaJson: JSON.stringify(makeSchema(title)),
      }),
    )
    expect(response.status).toBe(201)
    const payload = (await response.json()) as PromptResponse
    createdIds.push(payload.prompt.id)
    expect(payload.prompt.versions[0]?.renderedText).toBe('用一句话写产品说明')
    expect(payload.prompt.versions[0]?.schema?.meta.title).toBe(title)
  })

  it('列表返回标题、版本数与更新时间，并可按标题检索', async () => {
    const title = `检索目标-${randomUUID().slice(0, 8)}`
    const prompt = await createPrompt(title)

    const response = await listPromptsRoute(
      request('GET', `http://localhost/api/prompts?q=${encodeURIComponent(title)}`),
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as ListResponse
    expect(payload.total).toBe(1)
    const item = payload.prompts[0]
    expect(item).toBeDefined()
    if (!item) {
      return
    }
    expect(item.id).toBe(prompt.id)
    expect(item.title).toBe(title)
    expect(item.versionCount).toBe(1)
    expect(item.latestVersionNo).toBe(0)
    expect(item.latestOrigin).toBe('user_input')
    expect(item.winRate).toBeNull()
    expect(Date.parse(item.updatedAt)).toBeGreaterThan(0)
  })

  it('详情按版本号升序返回时间线，并带变量清单', async () => {
    const title = `变量提示词-${randomUUID().slice(0, 8)}`
    const schema = makeSchema(title)
    const withVariable: PromptSchema = {
      ...schema,
      input: {
        variables: [
          {
            name: 'topic',
            label: '主题',
            type: 'text',
            required: true,
            defaultValue: '秋季新品',
          },
        ],
      },
    }
    const prompt = await createPrompt(title, '写一段新品介绍', withVariable)
    expect(prompt.variables).toHaveLength(1)
    expect(prompt.variables[0]?.name).toBe('topic')

    const response = await getPrompt(prompt.id)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as PromptResponse
    expect(payload.prompt.versions.map((version) => version.versionNo)).toEqual([0])
  })
})

describe('追加新版本与 v0 共存', () => {
  it('保存新版本时版本号由服务端加一，v0 原样保留', async () => {
    const title = `追加版本-${randomUUID().slice(0, 8)}`
    const prompt = await createPrompt(title, '帮我写个周报')
    const baseline = prompt.versions[0]
    expect(baseline).toBeDefined()
    if (!baseline) {
      return
    }

    const response = await patchPrompt(prompt.id, {
      version: {
        schema: versionedSchema(title, '写一份包含进展、风险与下周计划的本周周报'),
        origin: 'human_edited',
        changeSummary: '补充通过标准',
      },
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as PromptResponse
    const detail = payload.prompt
    expect(detail.versionCount).toBe(2)
    expect(detail.latestVersionNo).toBe(1)
    expect(detail.versions.map((version) => version.versionNo)).toEqual([0, 1])

    const v0 = detail.versions[0]
    const v1 = detail.versions[1]
    expect(v0?.id).toBe(baseline.id)
    expect(v0?.renderedText).toBe('帮我写个周报')
    expect(v0?.origin).toBe('user_input')
    expect(v1?.origin).toBe('human_edited')
    expect(v1?.parentVersionId).toBe(baseline.id)
    expect(v1?.renderedText).toContain('包含进展、风险与下周计划')
    expect(detail.currentVersionId).toBe(v1?.id)
  })

  it('并发保存不会出现重复版本号，且当前版本指向最大号', async () => {
    const title = `并发版本-${randomUUID().slice(0, 8)}`
    const prompt = await createPrompt(title)

    const responses = await Promise.all(
      [1, 2, 3, 4].map((index) =>
        patchPrompt(prompt.id, {
          version: {
            schema: versionedSchema(title, `并发目标 ${index}：写一份完整周报`),
            origin: 'ai_generated',
            changeSummary: `并发保存 ${index}`,
          },
        }),
      ),
    )
    for (const response of responses) {
      expect(response.status).toBe(200)
    }

    const response = await getPrompt(prompt.id)
    const payload = (await response.json()) as PromptResponse
    const detail = payload.prompt
    expect(detail.versionCount).toBe(5)
    const numbers = detail.versions.map((version) => version.versionNo)
    expect(numbers).toEqual([0, 1, 2, 3, 4])
    expect(new Set(numbers).size).toBe(numbers.length)
    const latest = detail.versions[detail.versions.length - 1]
    expect(detail.currentVersionId).toBe(latest?.id)
    expect(detail.latestVersionNo).toBe(4)
  })
})

describe('v0 的服务端保护', () => {
  it('修改 v0 的请求返回 409，删除整条提示词也返回 409', async () => {
    const title = `基线保护-${randomUUID().slice(0, 8)}`
    const prompt = await createPrompt(title)
    const baseline = prompt.versions[0]
    expect(baseline).toBeDefined()

    const patchBaseline = await patchPrompt(prompt.id, {
      version: {
        versionNo: 0,
        schema: versionedSchema(title, '试图覆盖基线'),
      },
    })
    expect(patchBaseline.status).toBe(409)
    const patchBody = (await patchBaseline.json()) as { code: string }
    expect(patchBody.code).toBe('BASELINE_IMMUTABLE')

    const patchRootBaseline = await patchPrompt(prompt.id, {
      versionNo: 0,
      title: '试图改标题',
    })
    expect(patchRootBaseline.status).toBe(409)

    const deleteResponse = await deletePrompt(prompt.id)
    expect(deleteResponse.status).toBe(409)
    const deleteBody = (await deleteResponse.json()) as { code: string }
    expect(deleteBody.code).toBe('BASELINE_IMMUTABLE')

    const stillThere = await getPrompt(prompt.id)
    expect(stillThere.status).toBe(200)
    const payload = (await stillThere.json()) as PromptResponse
    expect(payload.prompt.versions).toHaveLength(1)
    expect(payload.prompt.versions[0]?.renderedText).toBe('帮我写个周报')
  })

  it('客户端传入非零版本号不被接受', async () => {
    const title = `版本号拒绝-${randomUUID().slice(0, 8)}`
    const prompt = await createPrompt(title)
    const response = await patchPrompt(prompt.id, {
      version: {
        versionNo: 7,
        schema: versionedSchema(title, '客户端指定版本号'),
      },
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { code: string }
    expect(body.code).toBe('SERVER_ASSIGNED_VERSION')
  })
})

describe('输入校验与不存在', () => {
  it('缺少原始需求与非法结构都返回 400', async () => {
    const title = `校验-${randomUUID().slice(0, 8)}`
    const missingSource = await createPromptRoute(
      request('POST', 'http://localhost/api/prompts', {
        title,
        schema: makeSchema(title),
      }),
    )
    expect(missingSource.status).toBe(400)

    const invalidSchema = await createPromptRoute(
      request('POST', 'http://localhost/api/prompts', {
        title,
        sourceInput: '帮我写个周报',
        schema: { schemaVersion: 'pp-schema-v1' },
      }),
    )
    expect(invalidSchema.status).toBe(400)
    const payload = (await invalidSchema.json()) as { code: string }
    expect(payload.code).toBe('INVALID_SCHEMA')
  })

  it('详情、更新与删除不存在的提示词返回 404', async () => {
    const id = `missing-${randomUUID()}`
    expect((await getPrompt(id)).status).toBe(404)
    expect((await patchPrompt(id, { title: '新标题' })).status).toBe(404)
    expect((await deletePrompt(id)).status).toBe(404)
  })
})

describe('列表项形状', () => {
  it('列表项只暴露摘要，不携带完整正文', async () => {
    const title = `摘要形状-${randomUUID().slice(0, 8)}`
    await createPrompt(title)
    const response = await listPromptsRoute(
      request('GET', `http://localhost/api/prompts?q=${encodeURIComponent(title)}`),
    )
    const payload = (await response.json()) as ListResponse
    const item: PromptListItem | undefined = payload.prompts[0]
    expect(item).toBeDefined()
    if (!item) {
      return
    }
    expect(item).not.toHaveProperty('versions')
    expect(item).not.toHaveProperty('renderedText')
  })
})
