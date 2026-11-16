# Active Context

> Last updated: 2026-11-14T12:38:44Z

## Current Task
- Phase 6（v2 清理与收口）已完成 Task 1-5；独立 verifier 结论 Accept with minors，无 Critical/Important。
- 全部改动未提交、未 push（按用户未要求提交的 ruling），HEAD 仍为 `f4d3749`，变更在 main 工作树。
- 下一步：用户确认后提交 Phase 6 改动并删除 `.superpowers/sdd/2026-11-14-v3-phase-6/`；之后接真实 ARK 密钥验证。

## Phase 6 Verification
- harness 25 pass / 0 fail；typecheck 0；59 文件 / 537 用例；clean build ✓；`pnpm e2e` ✓；contrast 最低 4.70:1。
- 浏览器冒烟：`/studio` `/library` `/templates` `/settings` × 1440/1024 无横向溢出，四导航项，无 `/eval` 与「试运行」；键盘主路径与详情抽屉可达；`prefers-reduced-motion` 下 `.rise` 为 `animation: none`。
- 库表只剩 `AppSetting`、`LlmCall`、`PromptRecord`、`PromptIteration`、`Template`；备份 `data/app.db.bak-20261114-2027`（831,488 字节，integrity ok）；`llm.modelEvaluate` 行数为 0。
- 测试基线从 536 更新到 537（短密钥掩码用例）；README/HANDOVER/ARCHITECTURE/ROADMAP 已同步。

## Deferred Minors
- HANDOVER 的 `MOCK_LLM_FAULT=network` 无对应 profile，设置后静默无效。
- `lib/llm/mock.ts` 输出仍含「试运行 / 变量」等 v2 词，仅 valid mock 可见。
- ARCHITECTURE 两处「在备份 data/app.db 后删除」措辞有歧义，未点明备份路径。
- `.env.example` 受权限策略阻止，未验证；可能仍列 `ARK_MODEL_EVALUATE` 或缺 `ARK_MODEL_OPTIMIZE`。

## Hard Constraints
- `lib/llm/types.ts` 冻结；v2 模块与旧表已删除，v3 新代码不得重新引入。
- `LlmCall` 是成本账本唯一来源，历史关联列与 `[promptId, createdAt]` 索引保留。
- stage 仅 generate/optimize/repair；未知 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，接口只回末四位；测试隔离 `data/test.db`，E2E 隔离 `data/e2e.db`，绝不读写 `data/app.db`。
- 无 `prisma/migrations/`，用 `db push` + `generate`；破坏性 schema 变更先备份并获确认。

## Do Not Retry
- 不重建 v2 页面/API/引擎/测试；不恢复 `modelEvaluate`；不删 `LlmCall` 历史列。
- 浏览器冒烟不要用 `127.0.0.1`（Next dev 阻断客户端资源，不 hydration）；用 `localhost` 并等 `Page.loadEventFired`。
- 不要用裸 `grep "sk-"` 判 AC-17；分模式核验。
- `.env.example` 不绕过权限策略；记录为未验证项。

## Current Decisions
- 结果优先；导航 4 项；Markdown + diff + ≤3 条说明；完成自动入库。
- 失败轮 failed 且 output 空；中断 canceled 保留正文；length 视为失败。
- 收藏/评分 PATCH 单飞合并；日期筛选按 Asia/Shanghai；模板 origin 只挂首条匹配模式产出。
- 历史细节见 `session-summary.md` Batch E/F/G/H 与 2026-11-14 Phase 6 节。

## Current References
- Phase 6 计划：`docs/superpowers/plans/2026-11-14-v3-phase-6.md`。
- Ledger：`.superpowers/sdd/2026-11-14-v3-phase-6/progress.md`（含全部 Ruling 与 final review）。
- 备份：`data/app.db.bak-20261114-2027`；旧备份 `data/app.db.bak-20261113-1139`。
