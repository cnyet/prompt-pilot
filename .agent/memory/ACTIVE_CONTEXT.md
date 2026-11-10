# Active Context

> Last updated: 2026-11-10T10:45:00Z

## Current Task
- In progress: R1 工作台 bento 重构已完成并验证（typecheck ✓、493 测试 ✓、build ✓），等待用户查看确认。
- Goal: 按 `docs/BENTO-REFACTOR-PLAN.md`（ADR-0004 编辑部 bento）逐阶段重构，先只做工作台页。
- Next step: 用户确认 R1 效果后进入 R2（提示词库页）；未确认则按反馈微调。
- Blockers: 无。

## Current Constraints
- 零依赖基调：不引动效库、图标库、CSS-in-JS；Cormorant 未引 webfont，用 Georgia 系回退。
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
- 编辑部 bento（ADR-0004）：改构图不改色，Orbit 色板 ≈ 现有色板 | Reason: 参考即用户指定的 open-design Orbit。
- 八字段异构预览 + 编辑态统一回退 FieldBlock | Reason: 文本是唯一事实源，预览只读解析。
- 预览跨度：objective/constraints/examples/selfCheck 各占 2 列 + grid-flow-dense | Reason: 单列下巨型衬线与做/不做双栏过挤。
- R1 只动工作台页，其他页面不动 | Reason: 用户要求先测效果再推广。
- 视觉方向、动效、评估判定、设置优先级沿袭 ADR-0001..0003。

## Current References
- `docs/BENTO-REFACTOR-PLAN.md`（R0-R5 计划）、`docs/adr/0004-editorial-bento-redesign.md`
- `components/studio/FieldPreview.tsx`、`FlowTimeline.tsx`、`StudioWorkspace.tsx`
- `docs/DESIGN.md`、`CONTEXT.md`、`docs/adr/0001..0003`
