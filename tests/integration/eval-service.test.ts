import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import { createSkeletonSchema } from '@/lib/engine/schema'
import type { ChatRequest, ChatResult, LLMProvider } from '@/lib/llm/types'
import { EvalError, runEvaluation } from '@/lib/eval/service'

const createdPromptIds: string[] = []

function makeSchema(title: string, criteria: string[]) {
  const schema = createSkeletonSchema(title)
  schema.objective.successCriteria = criteria
  schema.role.persona = '你是测试用的编辑'
  return schema
}

function fakeProvider(
  chat: (req: ChatRequest) => ChatResult,
  id = 'fake-provider',
): LLMProvider {
  return {
    id,
    label: id,
    chat: async (req: ChatRequest) => chat(req),
    stream: async function* () {
      yield { type: 'done' } as never
    },
    structured: async () => {
      throw new Error('not used')
    },
    ping: async () => ({ ok: true, latencyMs: 1 }),
  } as unknown as LLMProvider
}

async function seedPrompt(options: {
  criteria: string[]
  withBaseline: boolean
}): Promise<{ promptId: string }> {
  const prisma = getPrisma()
  if (!prisma) {
    throw new Error('test needs database')
  }
  const title = `评估样本 ${randomUUID().slice(0, 6)}`
  const criteria = options.criteria
  const prompt = await prisma.prompt.create({
    data: { title, tags: '', status: 'draft' },
  })
  createdPromptIds.push(prompt.id)

  const v0 = await prisma.promptVersion.create({
    data: {
      promptId: prompt.id,
      versionNo: 0,
      origin: 'user_input',
      renderedText: '帮我写个周报',
      schemaJson: JSON.stringify(makeSchema(title, criteria)),
      changeSummary: '基线',
    },
  })
  if (options.withBaseline) {
    const v1 = await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        versionNo: 1,
        origin: 'ai_generated',
        renderedText: '结构化之后的提示词',
        schemaJson: JSON.stringify(makeSchema(title, criteria)),
        changeSummary: '新版本',
        parentVersionId: v0.id,
      },
    })
    await prisma.prompt.update({
      where: { id: prompt.id },
      data: { currentVersionId: v1.id },
    })
  } else {
    await prisma.prompt.update({
      where: { id: prompt.id },
      data: { currentVersionId: v0.id },
    })
  }
  return { promptId: prompt.id }
}

beforeAll(() => {
  // 确保使用测试库文件
})

afterAll(async () => {
  const prisma = getPrisma()
  if (prisma) {
    await prisma.criterionCheck.deleteMany({
      where: {},
    })
    await prisma.evalTask.deleteMany({
      where: { name: { contains: '评估样本' } },
    })
    for (const id of createdPromptIds) {
      await prisma.promptVersion.deleteMany({ where: { promptId: id } })
      await prisma.prompt.deleteMany({ where: { id } })
    }
  }
  await disconnectPrisma()
})

describe('评估执行', () => {
  it('跑样本、判定标准并写入任务与判定记录', async () => {
    const { promptId } = await seedPrompt({
      criteria: ['结构完整', '语气匹配'],
      withBaseline: false,
    })

    const generate = fakeProvider(() => ({
      text: '这是一段模型输出',
      finishReason: 'stop',
      usage: { tokensIn: 12, tokensOut: 30 },
    }))
    const judge = fakeProvider(
      () => ({
        text: JSON.stringify({
          verdicts: [
            { index: 1, verdict: 'satisfied', note: '有结构' },
            { index: 2, verdict: 'partial', note: '语气偏硬' },
          ],
          comparison: null,
        }),
        finishReason: 'stop',
        usage: { tokensIn: 20, tokensOut: 10 },
      }),
      'fake-judge',
    )

    const result = await runEvaluation(
      { promptId, samples: ['第一条样本', '第二条样本'] },
      { providers: { generate, judge } },
    )

    expect(result.status).toBe('completed')
    expect(result.samples).toHaveLength(2)
    expect(result.passRate).toBeCloseTo(0.75)
    expect(result.winRate).toBeNull()
    expect(result.counts.satisfied).toBe(2)
    expect(result.counts.partial).toBe(2)

    const prisma = getPrisma()
    const checks = await prisma?.criterionCheck.findMany({
      where: { evalTaskId: result.taskId },
    })
    expect(checks).toHaveLength(4)
    const task = await prisma?.evalTask.findUnique({
      where: { id: result.taskId },
    })
    expect(task?.sampleCount).toBe(2)
    expect(task?.mode).toBe('batch')
  })

  it('有基线时计算与 v0 的胜率', async () => {
    const { promptId } = await seedPrompt({
      criteria: ['结构完整'],
      withBaseline: true,
    })

    const generate = fakeProvider(() => ({
      text: '输出',
      finishReason: 'stop',
      usage: { tokensIn: 5, tokensOut: 5 },
    }))
    const judge = fakeProvider(
      () => ({
        text: '{"verdicts":[{"index":1,"verdict":"satisfied"}],"comparison":"better"}',
        finishReason: 'stop',
        usage: { tokensIn: 5, tokensOut: 5 },
      }),
      'fake-judge',
    )

    const result = await runEvaluation(
      { promptId, samples: ['样本一', '样本二'] },
      { providers: { generate, judge } },
    )

    expect(result.winRate).toBe(1)
    expect(result.samples.every((sample) => sample.baselineOutput !== null)).toBe(
      true,
    )
    const task = await getPrisma()?.evalTask.findUnique({
      where: { id: result.taskId },
    })
    expect(task?.mode).toBe('baseline')
  })

  it('没有判定模型时标为待人工判定，但仍保存输出', async () => {
    const { promptId } = await seedPrompt({
      criteria: ['结构完整'],
      withBaseline: false,
    })
    const generate = fakeProvider(() => ({
      text: '输出',
      finishReason: 'stop',
      usage: { tokensIn: 5, tokensOut: 5 },
    }))

    const result = await runEvaluation(
      { promptId, samples: ['样本'] },
      { providers: { generate, judge: null } },
    )

    expect(result.status).toBe('needs_review')
    expect(result.passRate).toBeNull()
    expect(result.samples[0]?.targetOutput).toBe('输出')
  })

  it('样本数量超限时明确报错', async () => {
    const { promptId } = await seedPrompt({
      criteria: ['结构完整'],
      withBaseline: false,
    })
    const generate = fakeProvider(() => ({
      text: 'x',
      finishReason: 'stop',
      usage: { tokensIn: 1, tokensOut: 1 },
    }))

    await expect(
      runEvaluation(
        { promptId, samples: ['1', '2', '3', '4', '5', '6'] },
        { providers: { generate, judge: null } },
      ),
    ).rejects.toBeInstanceOf(EvalError)
  })
})
