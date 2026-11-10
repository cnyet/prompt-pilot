import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db/prisma'
import { EvalError, runEvaluation } from '@/lib/eval/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SummaryShape {
  passRate?: number | null
}

function readSummary(resultJson: string | null): SummaryShape | null {
  if (!resultJson) {
    return null
  }
  try {
    const parsed = JSON.parse(resultJson) as { summary?: SummaryShape }
    return parsed.summary ?? null
  } catch {
    return null
  }
}

export async function GET(): Promise<NextResponse> {
  const prisma = getPrisma()
  if (!prisma) {
    return NextResponse.json(
      { error: { code: 'NO_DATABASE', message: '数据库不可用。' } },
      { status: 503 },
    )
  }

  const tasks = await prisma.evalTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return NextResponse.json({
    tasks: tasks.map((task) => {
      const summary = readSummary(task.resultJson)
      return {
        id: task.id,
        name: task.name,
        mode: task.mode,
        status: task.status,
        sampleCount: task.sampleCount,
        winRate: task.winRate,
        passRate: summary?.passRate ?? null,
        judgeModelId: task.judgeModelId,
        createdAt: task.createdAt.toISOString(),
      }
    }),
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: '请求体不是合法 JSON。' } },
      { status: 400 },
    )
  }

  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: '请求体必须是 JSON 对象。' } },
      { status: 400 },
    )
  }

  const body = payload as Record<string, unknown>
  const promptId = typeof body.promptId === 'string' ? body.promptId.trim() : ''
  if (promptId.length === 0) {
    return NextResponse.json(
      { error: { code: 'NO_PROMPT', message: '请先选择要评估的提示词。' } },
      { status: 400 },
    )
  }

  const versionId =
    typeof body.versionId === 'string' && body.versionId.length > 0
      ? body.versionId
      : undefined
  const name = typeof body.name === 'string' ? body.name : undefined
  const samples = Array.isArray(body.samples)
    ? body.samples.filter((item): item is string => typeof item === 'string')
    : []

  try {
    const result = await runEvaluation({ promptId, versionId, samples, name })
    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof EvalError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      )
    }
    console.warn('[eval] 未预期错误：', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: '评估执行失败。' } },
      { status: 500 },
    )
  }
}
