# Active Context

> Last updated: 2026-11-13T12:30:00Z

## Current Task
- v3 Phase 1+2 实现（shape brief `docs/shape-studio-v3.md`）。SDD 批次：
  - Batch A、B 已验收（见 session-summary）。
  - Batch C 已完成 4 个任务并通过各自 review（`03a26ea`, `59eb9b6`, `66df02f`, `03e96da`, `2e67025`, `4d9af1f`）；验证 typecheck 0，53 文件 / 579 用例通过。
- Next step: 1) Batch C 整分支 final review（范围 `6087412..HEAD`，triage ledger 中 minor/parked）；2) superpowers:finishing-a-development-branch；3) Batch D（records/templates/stats API + 12 模板 seed + 预算聚合）；4) Batch E（studio-v3 UI）。
- 计划与 ledger：`docs/superpowers/plans/2026-11-13-v3-batch-{a,b,c}.md`；`.superpowers/sdd/2026-11-13-v3-batch-c/progress.md`。
- Phase 2 收口项：主题切换移顶栏（AppShell.tsx:169-181）。

## Hard Constraints
- `lib/llm/types.ts` 冻结；`lib/engine/schema.ts` 冻结至 Phase 6 删除。v3 新代码不 import v2。
- stage 仅 generate/optimize/repair；未知一律 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，接口只回末四位。无 prisma/migrations/，`db push` + `generate`。
- 测试隔离 `data/test.db`，绝不读写 `data/app.db`。

## Current Constraints
- v3 四件套为事实源：PRODUCT.md、docs/ROADMAP-V3.md、DESIGN.md、.impeccable/design.json。
- 界面中文；禁感叹号与 em dash；单屏 primary 1 个；金色 ≤10%；glow 同屏 ≤2。
- 改 DESIGN 令牌同步 app/globals.css 双主题并跑 `pnpm check:contrast`。

## Do Not Retry
- 照搬 QuestUI 原稿（无中文、11px、对比度不达标）。
- `readonly:` 变体（Tailwind v4 用 `read-only:`）。
- 模型显示名直接当 modelId（用 kebab slug + `modelDisplayLabel()`）。
- 测试读写 data/app.db。
- 依赖 lib/llm/mock.ts valid 画像验证 META 不泄漏（它不输出分隔符，需测试内注入）。

## Current Decisions
- 结果优先；导航 4 项；输出 Markdown + diff + ≤3 条改动说明；完成自动入库。
- 失败轮 failed、output 空；中断 canceled 保留正文；`finishReason=length` 视为失败。
- 记录标题仅生成时由 meta.title 更新。

## Current References
- 历史细节：`.agent/memory/session-summary.md` 2026-11-13 Batch C 节。
- 备份：`data/app.db.bak-20261113-1139`。
