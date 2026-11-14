# Active Context

> Last updated: 2026-11-14T00:35:00Z

## Current Task
- v3 Phase 2 Batch E 已完成并本地合入 `main`（快进 `cdc8ebc` → `f48833d`）：studio-v3 工作台、i18n zh.ts、Markdown/diff、R101-R108 检查、流式 reducer/hook、Rating、存模板、主题切换移顶栏、四项导航 + 移动底栏。
- Final review 1 Critical（C1 canceled 空输出覆盖 latestOutput）+ I1/I2/I3 与 7 条 Minor 已由 fix wave `f48833d` 修复；scoped re-review 11/11 ADDRESSED，无新 Critical/Important。
- 特性分支与 SDD 工作区已删；未 push，本地 main 领先 origin/main。
- Next: Phase 3 提示词库 v3 UI、Phase 4 模板页、Phase 5 设置/成本、Phase 6 v2 清理。
- 验证基线（merged main `f48833d`）：typecheck 0；78 文件 / 832 用例通过；harness 24 pass / 0 fail。

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
- 只用 record.status 判断并发（续写路径不写 running；用 appendIteration 的在飞检查）。
- `pnpm test -- <path>` 在 pnpm 10 下不过滤；定向测试用 `pnpm exec vitest run <path>`。

## Current Decisions
- 结果优先；导航 4 项；输出 Markdown + diff + ≤3 条改动说明；完成自动入库。
- 失败轮 failed、output 空；中断 canceled 保留正文；`finishReason=length` 视为失败。
- 流式：canceled 提交草稿，failed 丢弃草稿保留已提交输出；`sawDone` 后传输错误不改写完成态；结算重试 3 次失败后 clear settling，显示「用量信息不可用」。
- canceled 且正文为空时不覆盖 `latestOutput`（C1，`lib/db/records.ts`）。
- 重新生成仅限生成模式记录（UI guard）；API 层仍未按模式校验，属已知 out-of-scope。
- 对比原文：单轮优化「原文 vs 输出」，≥2 轮任选两轮（`lib/ui/compare.ts`）。
- 收藏/评分 PATCH 单飞合并，不原生 disable，保留方向键焦点（`lib/ui/meta-coalesce.ts`）。
- 记录标题仅生成时由 meta.title 更新；并发互斥在迭代层（running 迭代）。
- 记录日期筛选用 Asia/Shanghai 日历日：`from` 当日零点含，`to` 次日零点不含（`f616ee4`）。
- 重放仅 completed 发 meta；空源续写 409 `RECORD_HAS_NO_OUTPUT`；二次删除模板 404 `TEMPLATE_NOT_FOUND`。

## Current References
- 历史细节：`.agent/memory/session-summary.md` 2026-11-13 Batch E 节。
- Batch E 计划：`docs/superpowers/plans/2026-11-13-v3-batch-e.md`（已入库）。
- 备份：`data/app.db.bak-20261113-1139`。
