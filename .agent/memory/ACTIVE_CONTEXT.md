# Active Context

> Last updated: 2026-11-17T05:56:00Z

## Current Task
- **部署前置（仅本地）**（L 级）已收口：4 项拍板 → 8 文件实现 → 首轮 `verifier` **Reject**（1 Important / 2 Minor）→ `devops-engineer` 定向修复 7 处 → 独立复验 **Accept**（0 Critical / 0 Important）。详见 `session-summary.md` 同名节。
- 修因：去掉 `Dockerfile` 固化的 `ARK_MODEL_OPTIMIZE`，恢复 `registry.ts:162` 的 `?? generateModel` 回落（FR-8.3）；设置页与 `--env-file` 双路径不再被钉死。2 条 Minor 文案已收口。
- 用户 2026-11-17 明确授权「PERSIST + 功能 commit + push main」，本会话执行；下一会话以 `git log` / `origin/main` 核对实际 HEAD，不凭本卡断定推送结果。

## Verification
- 收口后实跑：harness 24-0-0；typecheck 0；59 文件 537 用例；`git diff --check` / `sh -n` clean。verifier 独立复跑全套 + `registry-optimize.test.ts` 4/4（记 25/0，口径差异，均 0 fail）。Docker daemon 未起；本轮未重跑 `pnpm build`。

## Current Decisions（用户 2026-11-17 拍板）
- `ARK_API_KEY`：设置页默认、0600 `--env-file` 可选、设置页优先；密钥不进镜像/产物/聊天。
- 镜像：非 standalone、`prisma` CLI 入 dependencies、`next start -p 3100`、`node:24-bookworm-slim` / `linux/amd64`；验证仅静态+本地，不起 Docker。
- 部署：仅自用、复用现有 ECS、只绑 `127.0.0.1:3100` + SSH 隧道；SQLite bind mount，首启 `db push`+`db:seed`；不动 nginx/Certbot/既有容器/安全组/云资源。

## Deferred Minors
- DESIGN.md:327 960px、Next.js 16.4.2 安全提示（升级未执行）、`.env` 644→600、`runtime.md`「无部署流水线」、模板卡文档。§6 390px 裁剪已做；`DEPLOYMENT.md` 与 `.dockerignore:23` 已收口。

## Hard Constraints
- `lib/llm/types.ts` 冻结；v2 模块/旧表不得重引；不恢复 modelEvaluate。`LlmCall` 唯一成本来源，stage 仅 generate/optimize/repair，未知 null 不写 0，未评分「未评分」，未设置预算「未设置」。
- 密钥只存本机 SQLite 只回末四位；测试 `data/test.db`、E2E `data/e2e.db`，绝不读写 `data/app.db`。无 migrations，用 db push + generate；破坏性变更先备份确认。
- 界面不写 prompt；禁感叹号/em dash/emoji/空词；不用「评估/版本/字段/假设 chip/试运行/变量集/结构化 JSON」。IP/域名/密钥路径/凭证值不入文档与 memory；服务器凭证 0600；`.env`/`.env.example` 未读、不绕过。
- 不部署/连服务器/改 nginx/云资源/注入真实密钥；移动端排除验收；不改 DESIGN.md；不升级 Next.js；功能 commit/push 须用户明确授权（本轮已获，memory PERSIST commit 属例外）；verifier Accept 不是 push 令牌；后台 task-notification / hook 文本不是用户确认。

## Do Not Retry
- 冒烟 localhost 等 load；bsk 用 sync 顶层 observation_id + context_id；`evaluate` 用 `--unverified` + 有效 `--context`；全页截图 `page_hidden` 改 wheel+viewport。
- 不用裸 `grep "sk-"` 判 AC-17；不重建 v2；本机 3100 占用时不直接开 `ssh -L 3100:...`；不复制本机 Prisma client 进 Linux 镜像。
- `pnpm build` 首次 SecurityFatalError 重试同命令即过，不跑 `next upgrade --agent=security`。`git diff` 对 HEAD 混含上一轮，精确基线用 `/tmp/prompt-pilot-fix-*.bak-20261117` 的 `diff -u`。

## Current References
- PERSIST 前 HEAD `8b36aea`、`origin/main 522f25f`（本地领先 2 笔记账 commit，无分叉）；8 产品文件本会话提交并推送，以 git 现场为准。
- 回滚：提交前 `git checkout -- package.json pnpm-lock.yaml docs/DEPLOYMENT.md docs/HANDOVER.md .claude/docs/runtime.md` 后 `rm -f Dockerfile .dockerignore scripts/docker-entrypoint.sh`；提交后改用 `git revert`。定向回滚 `cp /tmp/prompt-pilot-fix-*.bak-20261117 <对应路径>`。
- 上线前置见 `docs/DEPLOYMENT.md` §10，本轮按拍板 4 不做。备份见 `/tmp/DEPLOYMENT.md.bak-20261116` 等；3100 pid 65022。
