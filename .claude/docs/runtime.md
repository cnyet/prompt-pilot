# Runtime Rules

> On-demand project runtime details.

## Environment

- Runtime: Node.js + Next.js 16 App Router（全栈单体），dev/start 端口 3100。
- Package manager: pnpm（`pnpm@10.14.0`，见 package.json `packageManager`）。
- Version pinning: `pnpm-lock.yaml`；Prisma 6.19.3、Next ^16.4.2、React ^19.3.1、zod ^4.6.7。
- CI baseline: 无 CI；本地验证 = harness check + `pnpm run typecheck` + `pnpm test`。

## Build And Test

```bash
pnpm run typecheck   # tsc --noEmit（本项目无 lint 脚本）
pnpm test             # vitest run（单测 + 集成）
node scripts/e2e-http.mjs   # HTTP 端到端（需 dev server）
```

## Database

```bash
pnpm db:generate    # prisma generate
pnpm db:push       # prisma db push（SQLite，data/ 目录）
pnpm db:studio     # prisma studio
```

## Repository Layout

```text
app/(workspace)/   四个主页面：studio / library / templates / settings
app/api/           generate、records、templates、settings、stats 路由
lib/engine/        v3 引擎：check(R101–R108) / diff / sse-v3 / stream-v3 / prompts / idempotency
lib/llm/           LLM 适配层：registry / openai-compat / mock / SSE / structured / ledger
lib/settings/      设置读取、参数继承与保存
components/        shell / studio-v3 / library-v3 / templates-v3 / settings / ui
prisma/            数据模型（SQLite）
docs/              PRODUCT / DESIGN / ARCHITECTURE / ROADMAP-V3 / HANDOVER + adr
scripts/           e2e-http.mjs 等脚本
```

## Platform Constraints

- macOS 本地开发为主；无外部服务依赖（SQLite 落 `data/`）。
- LLM 默认火山方舟（豆包），适配层可切任意 OpenAI 兼容端点；无 ARK_API_KEY 时生成与优化禁用并说明原因。
- 密钥等敏感配置不进仓库；MCP 凭据不落明文。

## Release Or Deployment

- 本地开发：`pnpm dev`（端口 3100）；本地验收以 `pnpm build` 的 clean build 为准。
- 交付形态：多阶段 `Dockerfile`（`node:24-bookworm-slim`，固定 `--platform=linux/amd64`）产出镜像，
  容器内 `next start -p 3100`（非 standalone）；入口脚本首启执行 `prisma db push` 与 `pnpm db:seed`。
  镜像只固化非机密默认值，模型密钥由设置页录入或 `--env-file` 注入，不进镜像与产物。
- 链路：本地构建镜像 → 传输 → `docker load` → 容器运行（仅绑 `127.0.0.1:3100`）；详见 `docs/DEPLOYMENT.md`。
- 本轮仅落地项目侧前置文件并做静态与本地验证；amd64 实构建与服务器部署未执行，属上线前置未验证项。
