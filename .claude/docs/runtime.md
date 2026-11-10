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
app/(workspace)/   五个主页面：studio / library / templates / eval / settings
app/api/           engine（五阶段）、run、eval、prompts、models、templates 路由
lib/engine/        Prompt 引擎：schema、compose、harden、refine、lint(R001–R016)、render、diff、export
lib/llm/           LLM 适配层：ark / openai-compat / mock / SSE / 结构化修复重试
lib/eval/          评估：成功标准逐条判定 + 基线 v0 盲评胜率
components/        shell / studio / library / eval / settings / ui
prisma/            数据模型（SQLite）
docs/              PRODUCT / DESIGN / ARCHITECTURE / ROADMAP / REVIEW / EXECUTION / HANDOVER + adr
scripts/           e2e-http.mjs 等脚本
```

## Platform Constraints

- macOS 本地开发为主；无外部服务依赖（SQLite 落 `data/`）。
- LLM 默认火山方舟（豆包），适配层可切任意 OpenAI 兼容端点；无 ARK_API_KEY 时走 L1 离线模板模式。
- 密钥等敏感配置不进仓库；MCP 凭据不落明文。

## Release Or Deployment

- 演示版阶段：`pnpm build` + `pnpm start`（端口 3100）本地运行；无部署流水线。
