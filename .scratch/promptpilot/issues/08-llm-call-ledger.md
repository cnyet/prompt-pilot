# 08 — 调用账本与成本可见

**What to build:** 每次模型调用留一条记录：阶段、模型、首字延迟、输入输出 token、缓存命中、思维链 token、金额。用户在界面上能看到这一次花了多少钱，也能按阶段汇总看钱花在哪。

**Blocked by:** 05 — 接上火山方舟；15 — 真实模型的真流式与用量透传（用量事件是成本面板的数据源）

**Status:** ready-for-agent

- [x] 每次调用生成一条账本记录，字段齐全
- [x] 生成完成后可见本次耗时、token 与金额
- [x] 金额按人民币显示，价格表可配置而非硬编码
- [x] 缓存命中与被取消的调用都有区分
- [x] 重试次数写入 `LlmCall.attempts`（承接工单 07 未覆盖项）
- [x] 未拿到用量时明确显示"未知"，不伪造数字

## Comments

### 2026-11-10 决策：未知用 null，不用哨兵

`LlmCall` 的四个 token 字段与 `costCny` 已由 Lead 改为可空并执行 db push。账本写入遵循 null 语义：拿不到用量或价格就写 null，聚合时 null 不计入合计，界面显示「未知」。不使用 `-1` 之类魔法值，避免污染下游聚合与导出。

### 2026-11-10 账本模块与路由埋点

- 新建 `lib/db/prisma.ts`：globalThis 单例，缺 `DATABASE_URL` 或初始化失败时返回 null。
- 新建 `lib/llm/ledger.ts`：价格默认表加 AppSetting 覆盖、`recordLlmCall`（永不抛错）、`instrumentProvider`（chat/stream 埋点）、`summarizeCalls` / `getCostSummary` 聚合。
- `app/api/engine/generate/route.ts` 只在调用点接入：requestId 派生 traceId、fetch 计数折算 attempts、provider 包一层账本。流式事件顺序未改。
- 已验证：`pnpm exec tsc --noEmit --incremental false` 通过；既有 4 个路由与 SSE 测试文件 27 条全部通过。

### 2026-11-10 设置页、聚合接口与验证

- 新增 `app/api/stats/route.ts`，返回 `summarizeCalls` 的聚合结果；数据库不可用返回 503。
- 设置页新增「成本」区块：总金额、输入/输出 token、缓存命中率、成功/失败/取消/中断计数，以及按阶段、按模型的明细表。未知一律显示「未知」，部分未知带 `*` 脚注。
- 价格表：`lib/llm/ledger.ts` 的默认表来自 registry 模型预设，`AppSetting` 的 `llm.pricing.cny` 可按模型覆盖，30 秒缓存。
- 单测：`pnpm exec vitest run tests/unit/llm/ledger.test.ts`，22 条通过。全量 `pnpm exec vitest run`，26 个文件 345 条通过。
- 类型检查：`pnpm exec tsc --noEmit --incremental false`，exit 0。
- 真实 SQLite 验证（同一 traceId 写 5 条后聚合，脚本已清理测试数据）：
  - 原始 `aggregate`：3 条有金额，`costCny` 合计 2.92149，tokensIn 1,001,800，tokensOut 1,000,800，cached 200,200，reasoning 100。
  - `summarizeCalls`：5 条，成功 3、失败 1、取消 1，unknownUsage 2、unknownCost 2，缓存命中率 20%。
  - 按阶段：compose 2.92004，evaluate 0.00145，refine 0 且金额未知。
  - 价格覆盖：`verify-override-model` 用 AppSetting 覆盖价算出 2.9，证明价格表可配置。


