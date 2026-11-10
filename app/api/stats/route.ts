import { getCostSummary } from '@/lib/llm/ledger'

/**
 * 成本聚合接口。
 *
 * 数据源只有本机 SQLite 的 LlmCall 账本；null 表示「未知」，
 * 不会在响应里回退成 0。数据库不可用时返回 503，由界面显示暂不可用。
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const summary = await getCostSummary()
  if (!summary) {
    return new Response(
      JSON.stringify({
        code: 'DATABASE_UNAVAILABLE',
        message: '数据库不可用，成本数据暂不可用。',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
