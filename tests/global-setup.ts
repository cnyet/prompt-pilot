import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 测试使用独立的 SQLite，绝不读写 data/app.db。
 * 之前测试直接复用开发库，设置测试会删掉用户保存的密钥。
 */
const TEST_DATABASE_URL = 'file:../data/test.db'

function removeTestDb(): void {
  const dbPath = resolve(process.cwd(), 'data/test.db')
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(`${dbPath}${suffix}`, { force: true })
  }
}

export async function setup(): Promise<void> {
  removeTestDb()
  execFileSync(
    'pnpm',
    [
      'exec',
      'prisma',
      'db',
      'push',
      '--skip-generate',
      '--schema',
      'prisma/schema.prisma',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'inherit',
    },
  )
}

export async function teardown(): Promise<void> {
  removeTestDb()
}