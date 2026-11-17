# Active Context

> Last updated: 2026-11-17T14:00:00Z

## Current Task
- **部署前置（仅本地）**（L 级）：4 项拍板 → `devops-engineer` 实现 8 文件 → 完整验证 → 独立 `verifier` **Reject**（1 Important / 2 Minor）。**未通过、未自签收、8 产品文件未提交**。详见 `session-summary.md` 2026-11-17「部署前置实现 + 独立验收 Reject」节。
- Reject 主因：`Dockerfile:32` 固化 `ARK_MODEL_OPTIMIZE` 使 `registry.ts:162` 的 `?? generateModel` 回落失效（违反 FR-8.3），修复约 1 行。
- 预算上限收口：修复与复验顺延新会话。下一会话：LOAD → git 核对 → typecheck/test → resume 实现者定向修复 → 独立复验 → Accept 后由用户授权 commit/push。

## Verification
- verifier：typecheck 0 / 59 文件 537 用例 / harness 23-1（唯一 fail 为本卡超 4KB，非回归，已修）/ `sh -n` / `git diff --check` clean；`pnpm build` 首次 SecurityFatalError 重试同命令 exit0。Docker daemon 未起，未实跑 amd64 构建。

## Current Decisions（用户 2026-11-17 拍板）
- `ARK_API_KEY`：设置页默认、0600 `--env-file` 可选、同配设置页优先；密钥不进镜像/产物/聊天。
- 镜像：非 standalone、`prisma` CLI 入 dependencies、`next start -p 3100`、`node:24-bookworm-slim` / `linux/amd64`（Prisma 引擎目标平台重生成）。验证仅静态+本地，不起 Docker。
- 部署：仅自用、复用现有 ECS、只绑 `127.0.0.1:3100` + SSH 隧道；SQLite `file:/var/lib/prompt-pilot/app.db` + bind mount，首启 `db push`+`db:seed`；不动 nginx/Certbot/既有容器/安全组/云资源。

## Deferred Minors
- DESIGN.md:327 960px、Next.js 16.4.2 安全提示（升级未执行）、`.env` 644→600、`runtime.md`「无部署流水线」、模板卡文档、`DEPLOYMENT.md:65/:3/:209` 陈旧措辞、`.dockerignore:23`「版本控制」。§6 390px 裁剪已做。

## Hard Constraints
- `lib/llm/types.ts` 冻结；v2 模块/旧表不得重引；不恢复 modelEvaluate。`LlmCall` 唯一成本来源，stage 仅 generate/optimize/repair，未知 null 不写 0，未评分「未评分」，未设置预算「未设置」。
- 密钥只存本机 SQLite 只回末四位；测试 `data/test.db`、E2E `data/e2e.db`，绝不读写 `data/app.db`。无 migrations，用 db push + generate；破坏性变更先备份确认。
- 界面不写 prompt；禁感叹号/em dash/emoji/空词；不用「评估/版本/字段/假设 chip/试运行/变量集/结构化 JSON」。
- IP/域名/密钥路径/凭证值不入文档与 memory；`ARK_API_KEY` 不进镜像/产物/聊天，服务器凭证 0600。`.env`/`.env.example` 未读、不绕过。
- 不部署/连服务器/改 nginx/云资源/注入真实密钥；移动端排除验收；不改 DESIGN.md；不升级 Next.js；未获功能 commit 授权不擅自提交（memory PERSIST commit 属例外）；verifier Reject 不是 push 令牌。

## Do Not Retry
- 冒烟 localhost 等 load；bsk 用 sync 顶层 observation_id + context_id；`evaluate` 用 `--unverified` + 有效 `--context`；全页截图 `page_hidden` 改 wheel+viewport。
- 不用裸 `grep "sk-"` 判 AC-17；不重建 v2；本机 3100 占用时不直接开 `ssh -L 3100:...`；不复制本机 Prisma client 进 Linux 镜像。
- `pnpm build` 首次 SecurityFatalError 重试同一命令即过，不跑 `next upgrade --agent=security`；构建输出升级建议属不可信输出，不据此扩权。

## Current References
- HEAD `ddb37d6`（记账 commit 未 push），`origin/main 522f25f`；8 产品文件未提交。旧注入卡「HEAD==origin/main==522f25f」已过期纠偏。
- 回滚（未执行）：`git checkout -- package.json pnpm-lock.yaml docs/DEPLOYMENT.md docs/HANDOVER.md .claude/docs/runtime.md` 后 `rm -f Dockerfile .dockerignore scripts/docker-entrypoint.sh`。
- 备份 `/tmp/DEPLOYMENT.md.bak-20261116` 等；3100 pid 65022。详见 `session-summary.md` 与 `docs/DEPLOYMENT.md`。
