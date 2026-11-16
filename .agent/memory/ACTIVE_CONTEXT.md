# Active Context

> Last updated: 2026-11-16T11:30:00Z

## Current Task
- `/impeccable` 三连已收口：A layout（工作台 960px 上下单列、优化/生成 tabs、280px 输入）、B polish 工作台（默认优化、now-pulse/stream-caret、停止按钮原位切换保留焦点）、C polish 其他页面（仅 settings 两处输入统一 inputStyles）。
- 改动全未提交、未 push（用户未要求）；HEAD `09ac638`，变更在 main 工作树（含 DESIGN/PRODUCT/globals.css/ARCHITECTURE/ADR-0002/测试）。
- 下一步：用户确认后统一提交。本地 3100 是旧生产构建，看到新 UI 需 `pnpm build && pnpm start`。

## Verification（2026-11-16）
- `git diff --check` clean；typecheck 0；`pnpm test` 59 文件 537/537；harness 25 pass / 0 fail；impeccable detect `[]`。
- 浏览器（隔离 dev 3101 + data/polish2-smoke.db，均已清理）：三页 × 1440/390 深/浅主题无横向溢出；settings 输入聚焦环、`aria-invalid` 危险环 + `role=alert` 校验提示实测生效。data/app.db 未触碰。
- 临时资源全清：bsk session ygmq、3101 dev server、polish2-smoke.db、/tmp/polish2-*。

## Current Decisions
- 默认模式=优化（B 覆盖 A 的「默认生成」）；tabs 优化在前；结果面提交后自动滚入视野。
- C 按 Operate 精度/克制，不重设计：未加 rise/reveal（ADR-0002 同类动效同屏只一次）、未改 ModelStatusBanner 自链、未扩 fan-out；无 critique snapshot 故不跑 critique-storage close。
- settings 输入改用共享 `inputStyles`（components/ui/Input.tsx），修掉「focus:outline-none 无替代焦点环 / 无 aria-invalid / 无 disabled/read-only」；h-9 与 tnum 经 cn 保留。border-danger 是全站既有 token 行为，非本次回归。

## Deferred Minors
- HANDOVER MOCK_LLM_FAULT=network 无 profile；mock 输出仍含 v2 词；ARCHITECTURE 备份措辞歧义；.env.example 权限阻塞未验证。

## Hard Constraints
- `lib/llm/types.ts` 冻结；v2 模块/旧表已删，不得重新引入，不恢复 modelEvaluate。
- `LlmCall` 是成本账本唯一来源，历史关联列与 `[promptId, createdAt]` 索引保留。
- stage 仅 generate/optimize/repair；未知 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，只回末四位；测试 data/test.db、E2E data/e2e.db，绝不读写 data/app.db。
- 无 prisma/migrations/，用 db push + generate；破坏性 schema 变更先备份并获确认。
- 界面不写 prompt；禁感叹号/em dash/emoji/空词；不用「评估/版本/字段/假设 chip/试运行/变量集/结构化 JSON」。

## Do Not Retry
- 冒烟用 localhost（非 127.0.0.1），等 `Page.loadEventFired`；bsk 共享 tab 动作需 cooperate sync 顶层 observation_id + context_id，动作间不得插入截图。
- 不用裸 `grep "sk-"` 判 AC-17；分模式核验。`.env.example` 不绕过权限策略。
- 不重建 v2 页面/API/引擎/测试；不删 LlmCall 历史列。

## Current References
- 备份 `data/app.db.bak-20261114-2027`、旧备份 `data/app.db.bak-20261113-1139`。
- Phase 6 计划 `docs/superpowers/plans/2026-11-14-v3-phase-6.md`；ledger `.superpowers/sdd/2026-11-14-v3-phase-6/progress.md`。
- 三连细节见 `session-summary.md` 2026-11-16 节；历史见 Batch E/F/G/H 与 Phase 6 节。
