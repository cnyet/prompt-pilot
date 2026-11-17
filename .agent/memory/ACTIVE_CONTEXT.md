# Active Context

> Last updated: 2026-11-17T12:00:00Z

## Current Task
- **宽度一致性：已实现并验证，未提交**。四页统一 `PageShell` 单一 1280px 容器，去 cva / 三变体 / 内层 960 / settings 自定 1080；6 文件 +21−32，仅 className 与注释。验证、回滚与阻塞项见 `session-summary.md` 2026-11-17「宽度一致性落地 + 部署影响面评估」节。
- **部署影响面评估：已交付（只读）**，无连服务器 / 无改动 / 无部署。结论：服务器影响小且隔离（回环 3100 + 1 容器 + 1 宿主目录 + 1 SSH 隧道），风险集中在发布链路。
- 剩余决策仅 `ARK_API_KEY` 注入路径（§4.3）；部署前置未实施，另开阶段。移动端显示仍排除验收。
- 6 文件未提交 / 未 push；未获 commit 授权，不擅自提交。

## Verification
- 宽度落地全绿：typecheck 0 / 59 文件 537 用例 / harness 24-0-0 / `git diff --check` clean / build 重试后 0 / 4 页 200 / 渲染 HTML 均 1280 且 960、1080 各 0 次。build 首次被 Next.js 16.4.2 安全闸门拦，重试通过。明细见同日节。
- 未验证：移动端（用户排除）、桌面截图、Docker 内构建行为、SSH 隧道长流空闲超时。

## Current Decisions
- `PageShell` 只保留一条 1280px 容器，分栏交页面内 className。默认模式=优化、tabs 优化在前、settings 输入统一 `inputStyles`、进行中 `readOnly` + `.now-pulse`/`.rise`、模板卡等宽三列 + 封面 5:3 + 仅 featured 金边（用户选择覆盖 DESIGN.md，不改文档）。
- 部署：不对外开放、仅自用、暂不申请域名；复用现有 ECS，容器只绑 `127.0.0.1:3100` + SSH 隧道；不动 nginx/Certbot/既有容器/安全组/云资源。SQLite `file:/var/lib/prompt-pilot/app.db` + bind mount，首启 `db push` + `db:seed`。
- 插件：项目 `.claude/settings.json` 启用 3 个 `@local-tools`，共 8 个 MCP server（超治理默认 3 个）。

## Deferred Minors
- DESIGN.md:327 的 960px 漂移（宽度落地后新增）、`DEPLOYMENT.md` §6 的 390px 验收与「移动端排除」冲突、Next.js 16.4.2 安全提示（升级未执行）、`.env` 644→600、`.claude/docs/runtime.md` 仍写「无部署流水线」、模板卡文档漂移。按 impeccable 不顺手改文档。

## Hard Constraints
- `lib/llm/types.ts` 冻结；v2 模块/旧表已删，不得重新引入；不恢复 modelEvaluate。
- `LlmCall` 是成本账本唯一来源；stage 仅 generate/optimize/repair；未知 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，只回末四位；测试 `data/test.db`、E2E `data/e2e.db`，绝不读写 `data/app.db`。
- 无 prisma/migrations/，用 db push + generate；破坏性 schema 变更先备份并确认。
- 界面不写 prompt；禁感叹号/em dash/emoji/空词；不用「评估/版本/字段/假设 chip/试运行/变量集/结构化 JSON」。
- IP/域名/密钥路径/凭证值不写入仓库文档与 memory；`app_timeline.jsonl` 不写凭据；`ARK_API_KEY` 不进镜像/产物/聊天，服务器含凭证文件保持 0600。
- `.env` / `.env.example` 内容因权限策略未读取，不重试、不绕过。

## Do Not Retry
- 冒烟用 localhost 等 load；bsk 用 sync 顶层 observation_id + context_id；`evaluate` 用 `--unverified` + 有效 `--context`；全页截图 `page_hidden` 改 wheel + viewport。
- 不用裸 `grep "sk-"` 判 AC-17；不重建 v2；不删 LlmCall 历史列；无云资源、无 nginx 变更；卸载只停容器、删镜像、按需删 `/var/lib/prompt-pilot`。
- 不复制本机 Prisma client 进 Linux 镜像（引擎仅 darwin-arm64）；本机 3100 被占用时不直接开 `ssh -L 3100:...`。

## Current References
- 备份 `/tmp/DEPLOYMENT.md.bak-20261116`、`/tmp/prompt-pilot-settings.json.bak-20261117`、`data/app.db.bak-20261114-2027`；3100 当前 `nohup pnpm start` pid 65022 / 日志 `/tmp/prompt-pilot-start-20261117-width.log`。
- 详见 `session-summary.md` 2026-11-17 两节与 `docs/DEPLOYMENT.md`。
