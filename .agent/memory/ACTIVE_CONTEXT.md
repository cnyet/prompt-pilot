# Active Context

> Last updated: 2026-11-10T09:30:00Z

## Current Task
- In progress: 无。三项收尾任务（成本字段可空、评估端到端、Mock 验证）已完成并提交。
- Goal: 交付一个可演示、可交接的 PromptPilot。
- Next step: 等用户决定是否接真实 ARK 密钥验一轮，或继续做可选项（版本回滚 UI、标签收藏）。
- Blockers: 真实 ARK 密钥缺失，真实模型与评估判定质量无法验证。

## Current Constraints
- 零依赖基调：不引动效库、图标库、CSS-in-JS；图标为内联 SVG。
- 界面中文；禁止感叹号与 em dash（——）。
- 测试文件串行（fileParallelism: false）；跑测试前必须停掉 3100 上的服务（共用 SQLite）。
- Chrome 隔离只加 `--user-data-dir` 与 `--password-store=basic`，**绝不覆盖 HOME**（钥匙串弹窗）。

## Hard Constraints
- `lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结契约。
- 未知一律 null，不写 0（用量、成本、胜率、通过率）。
- 密钥只存本机 SQLite，接口只回末四位，永不回传明文。
- 单屏 border 容器 ≤3；每屏 primary 按钮 1 个；卡片不加阴影。

## Do Not Retry
- 把 `MOCK_LLM_FAULT=valid` 无条件放进 registry | 原因: 生成路由改用 mock 文本解析结构化输出，e2e 8 字段变 0。
- 在提前 return 之后调用 hook | 原因: 空闲/生成态 hook 数量变化，页面白屏。
- 用字符串 grep 判断「功能是否实现」 | 原因: 误判 ⌥1..3 未实现，实际一直可用。
- 用 `HOME=/tmp/...` 跑 Chrome | 原因: 触发系统钥匙串弹窗。

## Current Decisions
- 视觉方向：编辑刊物感（暖纸底 + 衬线 h1 + 粉彩分区）| Reason: ADR-0001，工具感在五页产品里显空。
- 动效只用 CSS 两类（rise/reveal）| Reason: ADR-0002，两个百毫秒级过渡不值得引库。
- 评估判定输出并对比 v0；无评委模型标 needs_review | Reason: ADR-0003，不把「没判」显示成 0 分。
- 设置优先级：设置页 > 环境变量 > 默认 | Reason: 界面可改且可回落；读取带缓存与 300ms 超时。
- 五页三种骨架（reading/workbench/grid）| Reason: 之前五页同构是「看起来简单」的结构性原因。

## Current References
- `docs/DESIGN.md`（设计系统与禁令）、`CONTEXT.md`（词表）
- `docs/adr/0001..0003`
- `docs/UI-REFACTOR-PLAN.md`、`docs/BEAUTY-PLAN.md`
- `docs/HANDOVER.md`（含未验证项）、`lib/eval/service.ts`
