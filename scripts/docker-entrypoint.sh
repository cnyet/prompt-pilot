#!/bin/sh
# PromptPilot 容器首启初始化：表结构与内置模板就绪后才启动服务。
# 任何一步失败都不启动应用（set -e）；全程不读取、不打印任何密钥值。
set -e

cd /app

# 数据目录由 bind mount 提供；mkdir -p 保证首启与重复启动都幂等。
mkdir -p /var/lib/prompt-pilot

# 按 schema 同步表结构。故意不带 --accept-data-loss：
# 破坏性变更会在此报错并阻止启动，须人工备份后确认，绝不静默重置共享数据。
pnpm exec prisma db push

# 写入 12 条内置模板（按 slug 幂等 upsert，自定义模板不受影响，可重复执行）。
pnpm db:seed

# 交信号：exec 让 next start 成为 PID 1，正确接收 SIGTERM / SIGINT 优雅退出。
exec "$@"
