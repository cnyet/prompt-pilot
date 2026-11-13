# Active Context

> Last updated: 2026-11-13T09:05:00Z

## Current Task
- v3 Phase 1+2 实现（shape brief `docs/shape-studio-v3.md`）。Batch A-C 已验收并合入 `main`（`5d607b1`）。
- Batch D SDD 执行中（分支 `feat/v3-batch-d`，计划 `docs/superpowers/plans/2026-11-13-v3-batch-d.md`）：
  - Task 1（records list/detail/PATCH/DELETE API）完成：`aa6878d` + 修复 `f616ee4`；re-review clean；6 条 minor 已 ledger 待 final review。
  - Next: Task 2（templates API + 12 模板 seed），BASE `f616ee4`；实现者必须串行（`data/test.db` 单文件）。
- Ledger（进度与裁定）：`.superpowers/sdd/2026-11-13-v3-batch-d/progress.md`。

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

## Current Decisions
- 结果优先；导航 4 项；输出 Markdown + diff + ≤3 条改动说明；完成自动入库。
- 失败轮 failed、output 空；中断 canceled 保留正文；`finishReason=length` 视为失败。
- 记录标题仅生成时由 meta.title 更新。
- 并发互斥在迭代层（running 迭代）；首轮失败才把记录置 failed，续写失败只标迭代。
- 记录日期筛选用 Asia/Shanghai 日历日：`from` 当日零点含，`to` 次日零点不含（`f616ee4`）。

## Current References
- 历史细节：`.agent/memory/session-summary.md` 2026-11-13 Batch C / Batch D Task 1 节。
- 备份：`data/app.db.bak-20261113-1139`。
