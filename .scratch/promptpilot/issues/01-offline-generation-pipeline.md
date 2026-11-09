# 01 — 离线生成打通到页面

**What to build:** 用户在空态输入一句话并回车，服务端用确定性模板填出八字段结构，内容通过 SSE 逐字段出现在中栏，生成过程可随时停止，结果可一键复制为 Markdown。全程不依赖任何模型 API。

**Blocked by:** None. Can start immediately.

**Status:** done

- [x] 输入一句话后 20 秒内看到完整的八字段结构，且未配置任何 API Key
- [x] 字段按顺序逐个出现，当前字段有可见插入符
- [x] 点停止后已生成字段保持可编辑，未生成字段显示"未生成"并可单独重试
- [x] 复制出的 Markdown 能直接粘进对话窗口使用
- [x] 服务端事件顺序满足 stage 包裹 field 包裹 delta，并有测试断言
- [x] 生成中断网时给出明确错误，不静默卡死

## Comments

### 2026-11-09 交付与验收（Lead 复核）

提交 `ba47c8a`。未触碰 `schema.ts`、`types.ts`、`package.json`、`components/shell`、studio 之外的四页，`git diff` 逐项确认。

Lead 独立复跑：

| 检查 | 结果 |
|---|---|
| 作用域 | 14 个文件全部在允许范围内，4 个禁改文件与 4 个禁改页面 `git diff` 为空 |
| 单测 | 全量 100 passed / 7 files（含 lint 的 72 条） |
| 类型 | `tsc --noEmit --incremental false` exit 0 |
| 构建 | `pnpm build` 通过，`/api/engine/generate` 正确标为 `ƒ Dynamic`（agent 未跑，Lead 补跑） |
| SSE 响应头 | `text/event-stream; charset=utf-8`、`no-cache, no-transform`、`x-accel-buffering: no`、`Transfer-Encoding: chunked` |
| 真分块 | 真实模式实测：第 400 行 1.3s 到达、第 2800 行 9.0s、全程 10.4s，非一次性吐出 |
| 中断韧性 | 客户端 2s 强断后再次请求返回 200，服务端未崩 |
| 参数校验 | 空输入返回结构化 `INVALID_INPUT`，含 path 与可重试标记 |
| 内容质量 | 八字段齐全，六个边界问题均有实质内容；`compose` 无 `Math.random`/`Date.now`，确定性 |
| 设计禁令 | 11 个文件扫描：无纯黑白、无渐变、无左侧色条、无阴影、界面文案无 em dash 与禁用词 |

### 标为 done 但未覆盖的部分（不属本工单）

- 假设 chip 只读，修改与局部重算属工单 04
- 结构化 / 渲染文本 / JSON 三视图与右侧诊断面板属工单 03、10
- 未加 Playwright，浏览器验证由 agent 用 headless 手工执行；E2E 门槛在工单 14

### 协议偏离（已确认并接受）

1. `done` 事件额外携带 `title` 与 `assumptions`。事件名仍严格为五个；工单禁止新增 `assumption` 事件，但 UI 需要标题与 chip 数据，因此放在 `done` 里。已在 ARCHITECTURE 第五节补记为协议字段。
2. 提交方式为 Enter（Shift+Enter 换行），未做设计稿的 ⌘Enter。⌘Enter 属快捷键体系，随工单 14 统一。

### 留给后续工单的隐患

`useGeneration` 的 `delta` reducer 无条件追加文本，不检查 `dirty`。当前编辑只在停止后进行，所以不触发；但**工单 02 实现流式期间编辑时必须改为尊重 dirty**，否则就是 AC-17 要防的那个 bug。另外 `stop()` 只置 `closed` 与 abort，服务端循环靠 `request.signal` 退出，若断开信号未传播，服务端会空转到流结束（有 `cancel()` 但未打断等待）。
