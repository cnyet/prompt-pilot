import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const prisma = getPrisma()
  if (!prisma) {
    return NextResponse.json(
      { error: { code: 'NO_DATABASE', message: '数据库不可用。' } },
      { status: 503 },
    )
  }

  const task = await prisma.evalTask.findUnique({
    where: { id },
    include: { checks: { orderBy: [{ sampleIndex: 'asc' }, { criterionIndex: 'asc' }] } },
  })
  if (!task) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: '找不到这次评估。' } },
      { status: 404 },
    )
  }

  let result: unknown = null
  if (task.resultJson) {
    try {
      result = JSON.parse(task.resultJson)
    } catch {
      result = null
    }
  }

  return NextResponse.json({
    task: {
      id: task.id,
      name: task.name,
      mode: task.mode,
      status: task.status,
      sampleCount: task.sampleCount,
      winRate: task.winRate,
      judgeModelId: task.judgeModelId,
      createdAt: task.createdAt.toISOString(),
      finishedAt: task.finishedAt?.toISOString() ?? null,
      checks: task.checks.map((check) => ({
        sampleIndex: check.sampleIndex,
        criterionIndex: check.criterionIndex,
        criterionText: check.criterionText,
        status: check.status,
        note: check.note,
      })),
      result,
    },
  })
}
