# Active Context

> Last updated: 2026-11-11T01:05:00Z

## Current Task
- Done: R1 工作台 bento、简化轮、shadcn 模式推广（fed11f2）、R2 提示词库行式 bento（86f6d41），均 typecheck ✓、493 测试 ✓、build ✓。
- Goal: 按 `docs/BENTO-REFACTOR-PLAN.md`（ADR-0004 编辑部 bento）继续 R3 评估页。
- Next step: R3 顶部创建区重排 + KPI 条衬线数字 + 样本对照双栏，行为不变。
- Blockers: 无。

## Current Constraints
- 零依赖基调（ADR-0005 修订）：UI 基座允许 cva + @radix-ui/react-slot；动效库、图标库、CSS-in-JS、图表库、状态库仍禁。Cormorant 未引 webfont，用 Georgia 系回退。
- 界面中文；禁止感叹号与 em dash。
- 跑测试前必须停掉 3100 上的服务（共用 SQLite）；测试偶发单失败重跑即过。
- Chrome 隔离只加 `--user-data-dir` 与 `--password-store=basic`，**绝不覆盖 HOME**。

## Hard Constraints
- `lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结契约。
- 未知一律 null，不写 0。
- 密钥只存本机 SQLite，接口只回末四位。
- 单屏 border 容器 ≤3；每屏 primary 按钮 1 个；卡片不加阴影。

## Do Not Retry
- 组件函数返回的 JSX 元素当 null 判断（`<Preview/>` 永远非 null）| 原因: FieldPreview 空卡 bug 根因；回退判断要用纯函数调用返回值。
- 预览组件里用 useMemo 再被父组件当普通函数调用 | 原因: hook 数量随分支变化，违反 hooks 规则；预览函数保持无 hook。
- 把 `MOCK_LLM_FAULT=valid` 无条件放进 registry | 原因: e2e 8 字段变 0。
- 用 `HOME=/tmp/...` 跑 Chrome | 原因: 钥匙串弹窗。

## Current Decisions
- 组件层回归 shadcn 路线（ADR-0005）：cva 变体 + Radix Slot `asChild`，保留项目 token 与内联 SVG | Reason: ARCHITECTURE.md 原选型即 shadcn，手写实现造成规划分叉；不映射 shadcn 默认 token 名，避免 bg-accent 二义。
- 编辑部 bento（ADR-0004）：改构图不改色，Orbit 色板 ≈ 现有色板 | Reason: 参考即用户指定的 open-design Orbit。
- 八字段异构预览 + 编辑态统一回退 FieldBlock | Reason: 文本是唯一事实源，预览只读解析。
- 预览跨度：objective/constraints/examples/selfCheck 各占 2 列 + grid-flow-dense | Reason: 单列下巨型衬线与做/不做双栏过挤。
- R2 行式 bento：列表行 = 标题/单行描述/标签 + 版本数、v0 胜率两列衬线数字；搜索与排序（最近更新/版本最多/标题）在列表上方一行 | Reason: 卡片网格信息密度低，行式更接近编辑部目录。
- 列表接口 `winRate` 取该提示词最近一次已完成评估任务的胜率（最多扫 200 条任务），无数据一律 null → 前端显示 — | Reason: 未知不写 0。
- R1 只动工作台页，其他页面不动 | Reason: 用户要求先测效果再推广。
- 视觉方向、动效、评估判定、设置优先级沿袭 ADR-0001..0003。

## Current References
- `docs/BENTO-REFACTOR-PLAN.md`（R0-R5 计划）、`docs/adr/0004-editorial-bento-redesign.md`
- `components/studio/FieldPreview.tsx`、`FlowTimeline.tsx`、`StudioWorkspace.tsx`
- `docs/DESIGN.md`、`CONTEXT.md`、`docs/adr/0001..0003`
