# PromptPilot 交付镜像。
# 目标平台固定 linux/amd64（ECS x86_64 / Alibaba Cloud Linux 3）。
# Prisma native 引擎必须在同一目标平台阶段内生成，绝不复制本机 darwin-arm64 产物。
# 构建与运行同为 node:24-bookworm-slim（Debian glibc / OpenSSL 3 → debian-openssl-3.0.x）。
FROM --platform=linux/amd64 node:24-bookworm-slim AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# corepack 固定 pnpm 10.14.0。pnpm 10 默认拦截依赖构建脚本，
# 用 onlyBuiltDependencies 放行 prisma 三件套，让 native 引擎在安装阶段固化进镜像。
RUN corepack enable \
 && corepack prepare pnpm@10.14.0 --activate \
 && printf "onlyBuiltDependencies:\n  - '@prisma/client'\n  - '@prisma/engines'\n  - 'prisma'\n" > /app/pnpm-workspace.yaml

# 构建阶段：全量依赖（含 devDependencies）→ 目标平台内 generate → build。
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate
RUN pnpm build

# 运行阶段：只带 .next/、生产依赖、package.json、prisma/ 与目标平台 Prisma client。
FROM base AS runner
# 只固化非机密默认值；密钥不进镜像、不进产物，由设置页或 --env-file 注入。
# 优化模型刻意不固化；未单独配置时由 lib/llm/registry.ts 回落复用生成模型（FR-8.3）。
# PATH 前置 node_modules/.bin，使 CMD 里的 next 可直接解析为 PID 1。
ENV NODE_ENV=production \
    DATABASE_URL="file:/var/lib/prompt-pilot/app.db" \
    ARK_BASE_URL="https://opencode.ai/inference/go/openai/v1" \
    ARK_MODEL_GENERATE="deepseek-v4.1-flash" \
    PATH="/app/node_modules/.bin:${PATH}"
# 构建所需最小集合（来自干净上下文；.npmrc / data/ / .env* 已由 .dockerignore 排除）。
COPY package.json pnpm-lock.yaml ./
COPY next.config.ts ./
COPY prisma ./prisma
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY --from=builder /app/.next ./.next
# 仅生产依赖；prisma CLI 已移入 dependencies 供 entrypoint 的 db push 使用。
# 在目标平台阶段再次 generate，确保运行镜像的 native 引擎就是 linux/amd64。
# 排除 .npmrc 后 pnpm 用镜像内默认 store，不依赖本机 store / cache 路径。
RUN pnpm install --prod --frozen-lockfile \
 && pnpm db:generate \
 && chmod +x ./scripts/docker-entrypoint.sh

# 容器默认监听 3100；实际只映射宿主回环 127.0.0.1:3100，不对公网开放。
EXPOSE 3100
# 首启初始化后由 exec 把信号交给 next start（PID 1 正确收 SIGTERM）。
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["next", "start", "-p", "3100"]
