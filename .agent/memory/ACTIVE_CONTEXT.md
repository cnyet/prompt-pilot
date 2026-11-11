# Active Context

> Last updated: 2026-11-11T03:46:00Z

## Current Task
- Done: Q0 烛光羊皮纸设计系统：`DESIGN.md` 重写、ADR-0006、工作台静态样张、1440/390 三张截图、WCAG 全组合实测；用户已确认方向。
- Goal: 按 Q1-Q5 迁移，不一次性重写。
- In progress: 会话预算收口，Q1 尚未启动。
- Next step: 新会话从 Q1 开始：令牌层 + Button / Input / Chip / Card / Panel / Tabs。
- Blockers: R3 `components/eval/EvalWorkspace.tsx` 仍未提交；Q1 需在新会话执行。

## Current Constraints
- 新方向：烛光羊皮纸（QuestUI 语法 + 中文适配）。浅色羊皮纸日光为默认，深色烛光地下室。
- 令牌见 `DESIGN.md` 第二节；浅/深所有文字组合 ≥4.5:1，实测最低 4.62:1（浅 accent/tint-gold）。
- 中文标题系统宋体，正文系统无衬线，零网络字体；金色只给主操作、当前步骤、关键数字；glow 只给 active/selected/focus，同屏 ≤2。
- 保留：八字段 Schema、假设 chip、16 条诊断、试运行、v0 盲评、版本链、导出、快捷键、离线可作业、密钥安全、修复不覆盖手改。
- 零依赖基调（ADR-0005）：cva + Radix Slot；不引动效库、图标库、CSS-in-JS、图表库、状态库。
- 界面中文；禁止感叹号与 em dash；单屏 primary 按钮 1 个。
- 跑测试前停 3100；Chrome 隔离只用 `--user-data-dir` 与 `--password-store=basic`，绝不覆盖 HOME。

## Hard Constraints
- `lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结契约。
- 未知一律 null，不写 0。
- 密钥只存本机 SQLite，接口只回末四位。

## Do Not Retry
- 直接照搬 QuestUI 原稿 | 原因: 无中文、仅深色、11px 大写、语义色对比度 1.73-2.94:1；只借语法并重写令牌。
- 在 Q0 未确认前改应用代码 | 原因: 方向未定，避免返工。
- 组件 JSX 当 null 判断 / 预览组件用 useMemo / 无条件启用 valid mock / 覆盖 HOME 跑 Chrome | 原因: 历史坑。

## Current Decisions
- 视觉方向定为「烛光羊皮纸」：QuestUI 的深棕分层、金色主操作、衬线标题、2-8px 圆角；浅色为羊皮纸日光变体 | Reason: 用户明确选择，替代瑞士黑白与旧暖纸 bento。
- 中文用系统宋体 + 无衬线正文，零网络字体 | Reason: 中文字体子集体积与首屏预算。
- Q0 只交付 DESIGN.md + 样张 + 截图，不改应用代码 | Reason: 先确认方向。
- ADR-0001/0004 视觉结论被 ADR-0006 取代；ADR-0002/0003/0005 继续有效。
- R1-R3 bento 实现暂保留；Q1 起按新系统迁移。
- 用户于 2026-11-11 确认 Q0 方向；Q1 未开始，因会话预算收口。

## Current References
- `DESIGN.md`、`docs/adr/0006-questui-parchment-direction.md`
- `docs/design-preview/questui-workbench.html`
- `docs/assets/design-v2/workbench-light-1440.png`、`workbench-dark-1440.png`、`workbench-light-390.png`
- `PRODUCT.md`、`CONTEXT.md`、`docs/BENTO-REFACTOR-PLAN.md`