# 05 — 接上火山方舟

**What to build:** 配置了 API Key 后，同一个界面改走真实模型。生成时不带思维链，流式输出正常，用量与思维链分别落到各自位置，不混进提示词正文。

**Blocked by:** 01 — 离线生成打通到页面

**Status:** done（provider 层完成，界面透传转出到工单 15）

**已验证**
- [x] 生成默认不带思维链，可通过开关开启
- [x] 无 Key 时离线路径逐行零漂移（与改动前 SSE 输出做 diff，3225 行完全一致）
- [x] 连接性测试给出耗时或明确失败原因（`ping()`）
- [x] 流式请求显式带 `include_usage`；拿不到用量时不伪造 0 成本

**代码就绪，但缺 Key 无法端到端验证**
- [ ] 配置 Key 后生成走的真实模型，输出质量与离线模板有明显差异

**已从本工单移出，转入工单 15**
- [ ] 用量透传到界面并显示成本 → 15
- [ ] 思维链出现在可折叠的「思考」区 → 15

## Comments

### 2026-11-09 交付与验收（Lead 复核）

提交 `5acbead`（前置依赖 `652a3ad` 装 openai 7.53.0）。禁改文件经 `git diff` 确认未动：`lib/llm/types.ts`、`lib/engine/**`、`components/**`、`package.json`、`docs/**`。

Lead 独立复跑：

| 检查 | 结果 |
|---|---|
| 全量测试 | 201 passed（其中 llm 79 条） |
| 类型 | `tsc` exit 0 |
| 构建 | `pnpm build` 通过 |
| 离线零漂移 | 同输入同参数，改动前后 SSE 输出 3225 行逐行一致（仅 `durationMs` 不同） |
| provider 选择 | `ARK_API_KEY` 为空时 `getGenerateProvider()` 返回 `null`，走原 heuristic 路径 |

六个方舟已知坑均有测试覆盖：流式 usage 默认 null 与末尾空 choices、`reasoning_content` 与正文分离、thinking 默认 disabled、两种 max_tokens 互斥、`length` 三成因、错误码分级与退避。

### 本工单留下的架构问题（重要）

有 Key 时路由的实现是：`await provider.structured(...)` 拿到完整 JSON 后，再把字段一次性回放成 SSE。后果：

1. **首字延迟等于整次生成时长**（10 到 20 秒），违反 NFR-2「首字 < 2s」。离线模式反而是真流式，真模型路径更差。
2. 回放的 delta 没有节流，界面表现为"卡住很久，然后瞬间出现全文"。
3. 用量与思维链没有事件通道，无法到界面。

这不是实现失误，是工单范围没覆盖到：05 只负责"接上"，真流式与透传需要单独处理。已开 **工单 15** 承担，并让 **08（账本与成本）** 依赖它。

### 缺 Key 未验证清单

- 真实 401/403/429 错误体与限流行为
- 真实 `thinking` / `stream_options` / 缓存命中
- `json_schema` strict 在方舟的实际支持度（代码已做 400 降级，但只验证了降级路径）
