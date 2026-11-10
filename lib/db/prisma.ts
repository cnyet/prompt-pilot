import { PrismaClient } from '@prisma/client'

/**
 * Prisma 单例。
 *
 * Next.js 开发模式会反复热加载路由模块，若每次都 new PrismaClient()
 * 会快速耗尽 SQLite 连接，所以把实例挂在 globalThis 上复用。
 *
 * 账本与统计都属于「有则更好」的旁路能力：DATABASE_URL 缺失或客户端
 * 初始化失败时返回 null，由调用方跳过写入，绝不让数据库问题影响主流程。
 */

const globalForPrisma = globalThis as unknown as {
  __promptpilotPrisma?: PrismaClient
}

export function isDatabaseConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const url = env.DATABASE_URL?.trim()
  return Boolean(url && url.length > 0)
}

export function getPrisma(): PrismaClient | null {
  if (!isDatabaseConfigured()) {
    return null
  }
  if (globalForPrisma.__promptpilotPrisma) {
    return globalForPrisma.__promptpilotPrisma
  }
  try {
    globalForPrisma.__promptpilotPrisma = new PrismaClient()
  } catch (error) {
    console.warn(
      '[db] Prisma 客户端初始化失败，数据库相关功能暂不可用：',
      error instanceof Error ? error.message : String(error),
    )
    return null
  }
  return globalForPrisma.__promptpilotPrisma
}

/** 测试、脚本与进程退出时释放连接；会清掉全局单例。 */
export async function disconnectPrisma(): Promise<void> {
  const client = globalForPrisma.__promptpilotPrisma
  if (!client) {
    return
  }
  globalForPrisma.__promptpilotPrisma = undefined
  await client.$disconnect()
}
