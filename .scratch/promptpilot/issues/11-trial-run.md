# 11 — 试运行：变量与真实输出

**What to build:** 变量自动生成表单，填完跑一次能看到真实的流式输出，同时显示耗时、token、费用。运行可取消，历史可回看。

**Blocked by:** 05 — 接上火山方舟；03 — 字段编辑器与单字段重算

**Status:** done

- [ ] 变量按类型生成表单（枚举下拉、长文本多行、数字输入）
- [ ] 运行后输出流式打印，可随时取消且保留已输出部分
- [ ] 顶部显示耗时、token、金额，随输出实时累加
- [ ] 必填变量缺失时给出提示，而不是带着空值运行
- [ ] 运行历史按版本归档，可回看任意一次

## Comments

- 变量派生与校验纯函数落在 `lib/engine/variables.ts`，六种类型的控件映射、默认值与必填校验有 9 条单测通过。
- `app/api/run` 的 SSE 流与 `Run` 落库完成，集成测试覆盖成功、取消、无模型拒绝与必填缺失拒绝。
- 试运行 UI（RunForm / RunDrawer / useTrialRun）接入工作台，reducer 覆盖取消保留输出与失败保留输出，10 条单测通过。
- 失败路径补测：Mock 限流画像落库为 `failed` 并记录 `LLM_RATE_LIMITED`；`recordRun` 存储失败只告警。集成测试 6 条通过。

### 2026-11-10 交付与验收（Lead 复核）

提交 `18c27e8`。禁改文件（`export.ts`、`ExportMenu`、`paths/doc/schema`、`lib/llm/**`、`prisma/schema.prisma`、generate 路由、`package.json`）经 `git diff` 确认未动。

| 检查 | 结果 |
|---|---|
| 全量测试 | 392 passed / 30 files |
| 类型 / 构建 | `tsc` 0；`pnpm build` 通过，`/api/run` 为动态路由 |
| 取消保留 | reducer 只在 running 时追加 delta；cancel 只改状态不清 output；迟到事件全部忽略 |
| 无模型 | GET 返回 available=false 与原因，POST 直接 503，不伪造输出 |
| 双端校验 | 客户端 `validateVariableValues` 与服务端 400 `INVALID_VARIABLES` 两道；未声明变量返回 `UNDECLARED_VARIABLES` |
| 落库 | 成功/失败/取消三态；写库失败只告警 |

### Lead 追加修正（同一提交）

agent 报告里写明「Run 表用量列为非空，拿不到 usage 时落 0，历史回看时三项全 0 按未知展示」。这与我们给 `LlmCall` 定的口径不一致，且「全零即未知」是脆弱的启发式。

已修正：
- `Run` 的 `tokensIn/tokensOut/cachedTokens/reasoningTokens/costCny` 改为可空
- `buildRunWrite` 未知写 `null`，不写 0
- `RunDrawer` 改为看 null 判定未知，删掉「全零即未知」的注释与逻辑
- 对应单测改为断言 `null`

### 未覆盖

- 没有生成结束自动试运行（已开 18）
- 没有全屏查看，只有可折叠与滚动输出区
- 运行历史按 `sessionKey` 归档，按版本归档要等 13；刷新或「重新开始」后旧会话历史不再显示
- 试运行的 stage 事件借用 `compose`（`sse.ts` 的 stage 枚举没有 run，且该文件当时禁改），label 写「正在试运行」区分
- 没有模型选择器与参数 UI，固定默认模型与参数
