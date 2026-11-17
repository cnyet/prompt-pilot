# Active Context

> Last updated: 2026-11-17T11:00:00Z

## Current Task
- **在制品（未实现）**：工作台主体宽度与库/模版/设置不一致。只读排查完成，零编辑/验证/截图/Agent。三套宽度：工作台 `workbench` 壳 + 内层 960、设置页自定 1080、库/模板 `grid` 1280；两套 padding。方案（未批准）：四页统一 `grid` 1280 壳，收敛 `PageShell` 为单一 shell。定位 / 改动清单 / 下一步见 `session-summary.md` 2026-11-17「页面宽度一致性」节。**开新会话先读该节**。
- 按 hook 执行 PERSIST + commit 全部累积改动，未 push / 未部署 / 未建云资源。
- 部署：**不对外开放、仅自用、暂不申请域名**；复用现有 ECS，容器只绑 `127.0.0.1:3100` + SSH 隧道；域名/证书/公网鉴权消解，不动 nginx/Certbot。详见 `docs/DEPLOYMENT.md`。
- 2026-11-17 已完成：模板页 layout（三卡等宽等高、封面 5:3、仅 featured 2px 金边）+ 项目级启用 3 个 `local-tools` 插件；3100 已重启。**移动端显示暂不考虑**（不改代码，不要求窄屏截图）。
- 剩余决策仅 `ARK_API_KEY` 注入路径（§4.3）；前置确认后另开阶段。observe/operate 与 DESIGN.md 漂移待定夺。

## Verification（2026-11-17）
- layout：typecheck 0 / 537 用例 / harness 25-0-0 / detect [] / diff --check clean；build 成功。宽度任务仅只读排查，未验证。细节见 `session-summary.md`。

## Current Decisions
- 默认模式=优化；tabs 优化在前；settings 输入统一 `inputStyles`。进行中 `readOnly` + `.now-pulse` / `.rise`，不加进度条与 glow。模板卡：单一 `items-stretch` 三列，封面 5:3，所有卡 2px 顶边、featured 金色；用户选择覆盖 DESIGN.md 异构网格，不改文档。
- 直连 build → `docker save`/scp/`docker load` → `127.0.0.1:3100` → SSH 隧道；宿主无 Node，需 Dockerfile（未创建）。SQLite `file:/var/lib/prompt-pilot/app.db` + bind mount；首启 `db push` + `db:seed`。已有服务必须共存、不得改动；SSE 已设 `X-Accel-Buffering: no`。「暂不申请域名」按可逆处理。
- 插件：项目 `.claude/settings.json` 启用 3 个 `@local-tools`；项目根不建 `.mcp.json`，`${BAILIAN_API_KEY}` 由登录 shell 注入；共 8 个 MCP server，超治理默认 3 个。

## Deferred Minors
- `.env` 644 待改 600（权限阻塞不重试/不绕过）；`.claude/docs/runtime.md` 仍写「无部署流水线」；DESIGN.md / `.impeccable/design.json` 漂移待定（宽度任务落地新增 DESIGN.md:327 960px 漂移，按 impeccable 不顺手改文档）；Next.js 16.4.2 构建报安全漏洞，升级未执行。

## Hard Constraints
- `lib/llm/types.ts` 冻结；v2 模块/旧表已删，不得重新引入；不恢复 modelEvaluate。
- `LlmCall` 是成本账本唯一来源；stage 仅 generate/optimize/repair；未知 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，只回末四位；测试 `data/test.db`、E2E `data/e2e.db`，绝不读写 `data/app.db`。
- 无 prisma/migrations/，用 db push + generate；破坏性 schema 变更先备份并确认。
- 界面不写 prompt；禁感叹号/em dash/emoji/空词；不用「评估/版本/字段/假设 chip/试运行/变量集/结构化 JSON」。
- IP/域名/密钥路径/凭证值不写入仓库文档与 memory；`app_timeline.jsonl` 不写凭据。

## Do Not Retry
- 冒烟用 localhost 等 load；bsk 用 sync 顶层 observation_id + context_id；`evaluate` 用 `--unverified` + 有效 `--context`。全页截图 `page_hidden`，改用 wheel + viewport。
- 不用裸 `grep "sk-"` 判 AC-17；`.env`/`.env.example` 不绕过权限策略；不重建 v2；不删 LlmCall 历史列。
- 无云资源、无 nginx 变更；卸载只停容器、删镜像、按需删 `/var/lib/prompt-pilot`。

## Current References
- 备份 `/tmp/DEPLOYMENT.md.bak-20261116`、`/tmp/prompt-pilot-settings.json.bak-20261117`、`data/app.db.bak-20261114-2027`；UI 回滚见 `session-summary.md` 2026-11-17 节。
