import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    /*
     * 测试文件串行执行。
     * 原因：集成测试共用同一个 SQLite，设置测试会写入模型与密钥覆盖，
     * 并行时生成路由测试会读到别人的覆盖值而偶发失败。串行后稳定，
     * 代价是整体时长从约 3s 涨到约 10s。
     */
    fileParallelism: false,
  },
})
