import { describe, expect, it } from 'vitest'
import { getPrisma } from '@/lib/db/prisma'

// 三模型与幂等第二层的契约测试；只增不删的护栏。
// 运行环境由 tests/global-setup.ts 提供：独立 data/test.db。
describe('v3 schema contract', () => {
  it('PromptIteration.requestId 唯一约束拒绝重复写入', async () => {
    const prisma = getPrisma()
    if (!prisma) throw new Error('test db unavailable')
    const record = await prisma.promptRecord.create({
      data: { title: 't', mode: 'generate', sourceInput: 's' },
    })
    await prisma.promptIteration.create({
      data: { recordId: record.id, seq: 1, kind: 'generate', requestId: 'req-1' },
    })
    await expect(
      prisma.promptIteration.create({
        data: { recordId: record.id, seq: 2, kind: 'optimize', requestId: 'req-1' },
      }),
    ).rejects.toThrow()
    await prisma.promptRecord.delete({ where: { id: record.id } })
  })

  it('LlmCall.cachedHit 可写 null，未知不落 0/false', async () => {
    const prisma = getPrisma()
    if (!prisma) throw new Error('test db unavailable')
    const call = await prisma.llmCall.create({
      data: { stage: 'generate', provider: 'mock', modelId: 'm' },
    })
    expect(call.cachedHit).toBeNull()
    expect(call.recordId).toBeNull()
    expect(call.iterationId).toBeNull()
    await prisma.llmCall.delete({ where: { id: call.id } })
  })

  it('删除记录级联删除迭代，但 LlmCall 不级联', async () => {
    const prisma = getPrisma()
    if (!prisma) throw new Error('test db unavailable')
    const record = await prisma.promptRecord.create({
      data: { title: 't2', mode: 'optimize', sourceInput: 's2' },
    })
    const iteration = await prisma.promptIteration.create({
      data: { recordId: record.id, seq: 1, kind: 'optimize' },
    })
    const call = await prisma.llmCall.create({
      data: { stage: 'optimize', provider: 'mock', modelId: 'm', iterationId: iteration.id },
    })
    await prisma.promptRecord.delete({ where: { id: record.id } })
    expect(await prisma.promptIteration.count({ where: { recordId: record.id } })).toBe(0)
    const survived = await prisma.llmCall.findUnique({ where: { id: call.id } })
    expect(survived).not.toBeNull()
    expect(survived?.iterationId).toBe(iteration.id)
    await prisma.llmCall.delete({ where: { id: call.id } })
  })
})
