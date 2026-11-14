# Active Context

> Last updated: 2026-11-14T09:35:00Z

## Current Task
- Batch H（v3 Phase 5 设置/成本）实现与全量验证已完成，HEAD `2793ee4`，未 push。
- 剩余唯一一步：独立 `verifier` 验收 AC-12/13/14/17/26（实现者不自签），通过后 Batch H 收口。
- 基线：typecheck 0；88 文件 / 906 用例；build ✓；check:contrast ✓；harness 24 pass / 0 fail。
- 下一会话第一步：派只读 `verifier` 核对计划、`83b0743..HEAD` diff 与验证证据；不要重做实现。

## Batch H 验证证据
- CDP 冒烟 22/22（隔离空库 `data/smoke.db`，已删）：生成/优化槽、无评估模型、四参数默认 0.7/8192、四 KPI、预算 100 → 0%、清除 → 未设置、1440/1024 无横向溢出。
- AC-17：`.next/static` 无 `ARK_API_KEY`、无 `Bearer`；`sk-` 仅命中 CSS `mask-*` 与 `task-list-item`。
- 未冒烟：stats null 分支（同目录第二个 `next dev` 被 Next 单实例锁拒绝）；该分支是既有服务端降级文案。
- 全量测试比基线 +19 用例（887 → 906）。

## Phase 5 关键决策
- 模型角色 generate/optimize；`modelEvaluate` 留在 store/API 供 v2 eval 到 Phase 6，UI 不暴露。
- 参数默认 0.7 / 8192；优化未设置时继承生成，source=`inherited`。
- `GET /api/settings` → `{ settings, budget: { monthlyCny } }`；PUT 增量写模型、四参数与 `budgetMonthlyCny`。
- 成本页用 `getV3Stats`：本月费用/调用/平均单次/预算使用率；未设预算「未设置」，未知「—」。
- 设置页移除「数据」分区；预算阈值集中在 `lib/budget.ts`，设置页与工作台共用。

## Hard Constraints
- `lib/llm/types.ts` 冻结；`lib/engine/schema.ts` 冻结至 Phase 6。v3 新代码不 import v2。
- stage 仅 generate/optimize/repair；未知 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，接口只回末四位。测试隔离 `data/test.db`，绝不读写 `data/app.db`。
- 无 prisma/migrations/，`db push` + `generate`。

## Do Not Retry
- 用 v2 `getCostSummary`；把 `modelEvaluate` 加回 UI；硬编码 `maxTokens: 8192`。
- 同目录并行起两个 `next dev`（单实例锁）；隔离库冒烟先停旧 server。
- 用裸 `grep "sk-"` 判 AC-17（会被 `mask-*` / `task-list-item` 误报），分模式核验。

## Current Decisions
- 结果优先；导航 4 项；Markdown + diff + ≤3 条说明；完成自动入库。
- 失败轮 failed 且 output 空；中断 canceled 保留正文；length 视为失败。
- 收藏/评分 PATCH 单飞合并；日期筛选按 Asia/Shanghai；模板 origin 只挂首条匹配模式产出。
- 其余历史决策见 `session-summary.md` Batch E/F/G/H 节。

## Current References
- Batch H 计划：`docs/superpowers/plans/2026-11-14-v3-batch-h.md`（任务 1-7，剩独立验收）。
- 历史细节：`.agent/memory/session-summary.md` Batch E/F/G/H 节。
- 备份：`data/app.db.bak-20261113-1139`。
