# Active Context

> Last updated: 2026-11-14T09:40:00Z

## Current Task
- v3 Phase 4 模板页已完成（HEAD `83b0743`），未 push。
- Phase 5 设置/成本：计划已写入 `docs/superpowers/plans/2026-11-14-v3-batch-h.md`，尚未实现。
- 基线（2026-11-14 复跑）：typecheck 0；85 文件 / 887 用例通过。
- 下一会话第一步：按 Batch H 计划执行；不要重新探索设置/成本现状。

## Phase 5 关键决策
- 设置页从 v2 评估模型切到生成/优化双槽；`modelEvaluate` 留在 store/API 供 v2 eval 到 Phase 6，UI 不再暴露。
- 新增每角色 temperature（默认 0.7）与 max_tokens（默认 8192）；优化参数未单独设置时继承生成参数。
- `GET /api/settings` 返回 `{ settings, budget: { monthlyCny } }`；PUT 接受模型、四个参数与 `budgetMonthlyCny`。
- 成本页改用 `getV3Stats`：本月费用、调用次数、平均单次费用、预算使用率；未设预算「未设置」，未知「—」。
- 设置页移除「数据」分区；客户端可见文案移除 `ARK_API_KEY`（AC-17）。

## Hard Constraints
- `lib/llm/types.ts` 冻结；`lib/engine/schema.ts` 冻结至 Phase 6 删除。v3 新代码不 import v2。
- stage 仅 generate/optimize/repair；未知一律 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，接口只回末四位。无 prisma/migrations/，`db push` + `generate`。
- 测试隔离 `data/test.db`，绝不读写 `data/app.db`。
- Batch H 期间不要新增设置来源；不要用 v2 `getCostSummary`。

## Current Constraints
- v3 四件套为事实源：PRODUCT.md、docs/ROADMAP-V3.md、DESIGN.md、.impeccable/design.json。
- 界面中文；禁感叹号与 em dash；单屏 primary 1 个；金色 ≤10%；glow 同屏 ≤2。
- 改 DESIGN 令牌同步 app/globals.css 双主题并跑 `pnpm check:contrast`。

## Do Not Retry
- 照搬 QuestUI 原稿；`readonly:` 变体（用 `read-only:`）。
- 模型显示名当 modelId（用 slug + `modelDisplayLabel()`）。
- 测试读写 data/app.db；`pnpm test -- <path>` 不过滤，用 `pnpm exec vitest run <path>`。
- 只用 record.status 判断并发；依赖 mock valid 画像验证 META 不泄漏。
- 封面文字用 `--text-faint`（对比度不足），用 `--text-muted`。
- 成本页用 `getCostSummary`（v2）；把 `modelEvaluate` 加回 UI；硬编码 `maxTokens: 8192`。

## Current Decisions
- 结果优先；导航 4 项；Markdown + diff + ≤3 条说明；完成自动入库。
- 失败轮 failed 且 output 空；中断 canceled 保留正文；length 视为失败。
- 流式：canceled 提交草稿、failed 丢弃；sawDone 后传输错误不改完成态。
- 记录并发互斥在迭代层；标题仅生成时由 meta.title 更新。
- 对比原文：单轮「原文 vs 输出」，≥2 轮任选两轮。
- 收藏/评分 PATCH 单飞合并，保留方向键焦点。
- 记录日期筛选按 Asia/Shanghai 日历日。
- 模板 `originTemplateId` 只挂匹配模式首条产出提交。
- 其余历史决策见 `session-summary.md` Batch E/F/G 节。

## Current References
- 历史细节：`.agent/memory/session-summary.md` Batch E/F/G/H 节。
- Batch H 计划：`docs/superpowers/plans/2026-11-14-v3-batch-h.md`（待执行）。
- Batch G 计划：`docs/superpowers/plans/2026-11-14-v3-batch-g.md`（已入库）。
- 备份：`data/app.db.bak-20261113-1139`。
