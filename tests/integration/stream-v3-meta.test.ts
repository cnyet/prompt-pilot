import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// 元数据切分与完成落库失败的端到端断言。provider 与 completeIteration 仅在测试内替换，
// 生产 mock 不变；数据在隔离的 data/test.db。

const state = vi.hoisted(() => ({
  provider: null as unknown,
  failComplete: false,
}))

vi.mock('@/lib/llm/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/registry')>()
  return {
    ...actual,
    getGenerateProvider: (...args: Parameters<typeof actual.getGenerateProvider>) =>
      (state.provider as ReturnType<typeof actual.getGenerateProvider>) ??
      actual.getGenerateProvider(...args),
    getOptimizeProvider: (...args: Parameters<typeof actual.getOptimizeProvider>) =>
      (state.provider as ReturnType<typeof actual.getOptimizeProvider>) ??
      actual.getOptimizeProvider(...args),
  }
})

vi.mock('@/lib/db/records', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/records')>()
  return {
    ...actual,
    completeIteration: (...args: Parameters<typeof actual.completeIteration>) => {
      if (state.failComplete) return Promise.reject(new Error('boom'))
      return actual.completeIteration(...args)
    },
  }
})

import { POST as generate } from '@/app/api/generate/route'
import { POST as optimize } from '@/app/api/records/[id]/optimize/route'
import { POST as repair } from '@/app/api/records/[id]/repair/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { META_SEPARATOR } from '@/lib/engine/prompts/meta'
import { parseSseStreamV3, type SseV3Message } from '@/lib/engine/sse-v3'

let prisma: ReturnType<typeof getPrisma> = null

function metaProvider(title: string, notes: string[]) {
  const json = JSON.stringify({ title, notes })
  const text = `你是一名严谨的助手。\n${META_SEPARATOR}${json}`
  // 每 7 个字符一块，分隔符与 JSON 必然被劈开
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += 7) chunks.push(text.slice(i, i + 7))
  return {
    id: 'mock-meta',
    label: 'meta',
    async chat() {
      throw new Error('unused')
    },
    async *stream() {
      for (const delta of chunks) yield { delta }
      yield { delta: '', finishReason: 'stop', usage: { tokensIn: 10, tokensOut: 20 } }
    },
    async structured() {
      throw new Error('unused')
    },
    async ping() {
      throw new Error('unused')
    },
  }
}

function req(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function collect(response: Response): Promise<SseV3Message[]> {
  const messages: SseV3Message[] = []
  for await (const m of parseSseStreamV3(response.body!)) messages.push(m)
  return messages
}
function doneOf(ms: SseV3Message[]) {
  const d = ms.find((m) => m.event === 'done')
  if (!d || d.event !== 'done') throw new Error('缺少 done')
  return d.data
}
function metaOf(ms: SseV3Message[]) {
  const m = ms.find((x) => x.event === 'meta')
  if (!m || m.event !== 'meta') throw new Error('缺少 meta')
  return m.data
}
function deltaText(ms: SseV3Message[]) {
  return ms.map((m) => (m.event === 'delta' ? m.data.text : '')).join('')
}

beforeAll(() => {
  prisma = getPrisma()
  if (!prisma) throw new Error('test db unavailable')
})
beforeEach(async () => {
  state.provider = null
  state.failComplete = false
  process.env.MOCK_LLM_FAULT = 'valid'
  await prisma!.promptRecord.deleteMany({})
})
afterAll(async () => {
  delete process.env.MOCK_LLM_FAULT
  await disconnectPrisma()
})

describe('元数据切分（真实分隔符，劈成多块）', () => {
  it('generate：标题更新，分隔符不入事件与落库正文', async () => {
    state.provider = metaProvider('周报模板', ['补了角色', '加了格式'])
    const ms = await collect(await generate(req({ mode: 'generate', sourceInput: '帮我写个周报' })))
    expect(JSON.stringify(ms)).not.toContain(META_SEPARATOR)
    expect(metaOf(ms)).toEqual({ title: '周报模板', notes: ['补了角色', '加了格式'] })
    const done = doneOf(ms)
    const record = await prisma!.promptRecord.findUnique({
      where: { id: done.recordId },
      include: { iterations: true },
    })
    expect(record?.title).toBe('周报模板')
    expect(record?.latestOutput).toBe(deltaText(ms))
    expect(record?.latestOutput).toContain('严谨的助手')
    expect(record?.latestOutput).not.toContain(META_SEPARATOR)
    expect(record?.iterations[0]?.output).not.toContain(META_SEPARATOR)
    expect(JSON.parse(record?.iterations[0]?.notesJson ?? '[]')).toEqual(['补了角色', '加了格式'])
  })

  it('optimize 与 repair：notes 落迭代，记录标题保持不变', async () => {
    state.provider = metaProvider('第一轮标题', [])
    const first = doneOf(await collect(await generate(req({ mode: 'generate', sourceInput: '帮我写个周报' }))))
    const recordId = first.recordId

    state.provider = metaProvider('不该覆盖的标题', ['更严格了'])
    const a = await collect(await optimize(req({ instruction: '更严格' }), ctx(recordId)))
    state.provider = metaProvider('也不该覆盖', ['修了模糊词'])
    const b = await collect(
      await repair(
        req({ issues: [{ id: 'R101', level: 'warn', message: '含模糊词', suggestion: null }] }),
        ctx(recordId),
      ),
    )
    for (const ms of [a, b]) {
      expect(JSON.stringify(ms)).not.toContain(META_SEPARATOR)
      expect(doneOf(ms).status).toBe('completed')
    }
    expect(metaOf(a)).toEqual({ title: '第一轮标题', notes: ['更严格了'] })
    expect(metaOf(b).notes).toEqual(['修了模糊词'])
    const record = await prisma!.promptRecord.findUnique({
      where: { id: recordId },
      include: { iterations: { orderBy: { seq: 'asc' } } },
    })
    expect(record?.title).toBe('第一轮标题')
    expect(record?.iterations).toHaveLength(3)
    for (const it of record!.iterations) expect(it.output).not.toContain(META_SEPARATOR)
  })
})

describe('完成落库失败', () => {
  it('completeIteration 抛错时以 error 与 done(failed) 收尾，记录不停在 running', async () => {
    state.provider = metaProvider('t', [])
    const seed = doneOf(await collect(await generate(req({ mode: 'generate', sourceInput: '写周报' }))))
    const seedRecord = await prisma!.promptRecord.findUnique({ where: { id: seed.recordId } })
    const seedOutput = seedRecord?.latestOutput ?? ''
    expect(seedOutput.length).toBeGreaterThan(0)

    state.failComplete = true
    const ms = await collect(await optimize(req({}), ctx(seed.recordId)))
    const names = ms.map((m) => m.event)
    expect(names).toContain('error')
    expect(names).not.toContain('usage')
    expect(names[names.length - 1]).toBe('done')
    expect(doneOf(ms).status).toBe('failed')
    const err = ms.find((m) => m.event === 'error')
    expect(err && err.event === 'error' ? err.data.message : '').not.toContain('!')

    state.failComplete = false
    const record = await prisma!.promptRecord.findUnique({ where: { id: seed.recordId } })
    expect(record?.status).toBe('completed')
    expect(record?.latestOutput).toBe(seedOutput)
    const iteration = await prisma!.promptIteration.findUnique({ where: { id: doneOf(ms).iterationId } })
    expect(iteration?.status).toBe('failed')

    // 失败轮不阻塞继续优化
    const retry = await optimize(req({}), ctx(seed.recordId))
    expect(retry.status).toBe(200)
    expect(doneOf(await collect(retry)).status).toBe('completed')
  })
})
