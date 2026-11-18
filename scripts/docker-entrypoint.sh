#!/bin/sh
# PromptPilot 容器首启初始化：表结构与内置模板就绪后才启动服务。
# 任何一步失败都不启动应用（set -e）；全程不读取、不打印任何密钥值。
set -e

cd /app

# 数据目录由 bind mount 提供；mkdir -p 保证首启与重复启动都幂等。
mkdir -p /var/lib/prompt-pilot

# schema 变更前守卫：已有数据库先留一份滚动备份，再执行 db push。
# 只保留最近一份（每次启动覆盖），磁盘占用有界；首启无库时跳过。
# 此时应用尚未启动，数据库无进程写入，直接复制文件是安全的。
DB_FILE="${DATABASE_URL#file:}"
if [ -n "$DB_FILE" ] && [ -f "$DB_FILE" ]; then
  rm -f "$DB_FILE.pre-push.bak-wal" "$DB_FILE.pre-push.bak-shm"
  cp "$DB_FILE" "$DB_FILE.pre-push.bak"
  if [ -f "$DB_FILE-wal" ]; then
    cp "$DB_FILE-wal" "$DB_FILE.pre-push.bak-wal"
  fi
  if [ -f "$DB_FILE-shm" ]; then
    cp "$DB_FILE-shm" "$DB_FILE.pre-push.bak-shm"
  fi
  echo "schema 同步前已备份现有数据库到 $DB_FILE.pre-push.bak（滚动快照，仅最近一份）。"
fi

# 按 schema 同步表结构。故意不带 --accept-data-loss：
# 破坏性变更会在此报错并阻止启动，须人工备份后确认，绝不静默重置共享数据。
pnpm exec prisma db push

# 写入 12 条内置模板（按 slug 幂等 upsert，自定义模板不受影响，可重复执行）。
pnpm db:seed

# 交信号：exec 让 next start 成为 PID 1，正确接收 SIGTERM / SIGINT 优雅退出。
exec "$@"
