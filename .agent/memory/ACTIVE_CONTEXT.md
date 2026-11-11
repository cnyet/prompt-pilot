# Active Context

> Last updated: 2026-11-11T12:30:00Z

## Current Task
- Done: Q0 设计系统（DESIGN.md、ADR-0006、样张、截图）；Q1 令牌层 + Button/Input/Chip/Card/Panel/Tabs + 对比度脚本；GitHub 标准仓库配置。
- Goal: 按 Q1-Q5 分阶段迁移，每阶段独立 diff。
- In progress: Q1 已提交（`0df71f3`），待推送 `origin main`。
- Next step: Q2 工作台迁移，验收 AC-1 / AC-3 / AC-12 / AC-13。
- Blockers: 无硬阻塞；真实 ARK 密钥验证仍缺凭据。

## Current Constraints
- 烛光羊皮纸：浅色羊皮纸日光为默认，深色烛光地下室；令牌以 `DESIGN.md` 第二节为准，代码在 `app/globals.css`。
- 全部文字组合 ≥4.5:1；`pnpm check:contrast` 为强制门禁（浅色最低 4.51，深色 4.70）。
- 中文标题系统宋体、正文系统无衬线、零网络字体；金色只给主操作/当前步骤/关键数字；glow 只给 active/selected/focus，同屏 ≤2。
- 组件走 cva + Radix Slot；不引动效库、图标库、CSS-in-JS、图表库、状态库。
- 旧令牌别名（`tint-coral/sage/lavender/butter`、`shadow-overlay`）供 Q1-Q5 迁移期兼容，迁移完成后删除。
- 界面中文；禁止感叹号与 em dash；单屏 primary 按钮 1 个。
- 跑测试前停 3100；Chrome 隔离只用 `--user-data-dir` 与 `--password-store=basic`，绝不覆盖 HOME。

## Hard Constraints
- `lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结契约。
- 未知一律 null，不写 0。
- 密钥只存本机 SQLite，接口只回末四位。
- 冻结契约与 CI 工作流改动须 code owner 审阅（`.github/CODEOWNERS`）。

## Do Not Retry
- 直接照搬 QuestUI 原稿 | 原因: 无中文、仅深色、11px 大写、语义色对比度 1.73-2.94:1；只借语法并重写令牌。
- 用 `readonly:` 变体 | 原因: Tailwind v4 无此变体，必须用 `read-only:`。
- `git add` 整个 `EvalWorkspace.tsx` | 原因: 会带入未完成的 R3 改动；只允许暂存单行 blob。
- 组件 JSX 当 null 判断 / 预览组件用 useMemo / 无条件启用 valid mock / 覆盖 HOME 跑 Chrome | 原因: 历史坑。

## Current Decisions
- Q1 只换令牌与基座组件，不改页面结构；旧 tint 别名映射到新语义色 | Reason: 分阶段迁移。
- 对比度脚本解析 `globals.css` 变量，不硬编码 | Reason: 防文档与代码漂移。
- CI 顺序：contrast → `next typegen` → typecheck → test → build | Reason: `next-env.d.ts` 未入库。
- 远端历史无关，已 `--allow-unrelated-histories` 合并，保留远端 MIT LICENSE 版权行；不 force push。
- ADR-0001/0004 视觉结论被 ADR-0006 取代；ADR-0002/0003/0005 继续有效。

## Current References
- `DESIGN.md`、`docs/adr/0006-questui-parchment-direction.md`
- `scripts/contrast-check.mjs`、`.github/workflows/ci.yml`
- `docs/design-preview/questui-workbench.html`、`docs/assets/design-v2/`
- `PRODUCT.md`、`CONTEXT.md`、`docs/HANDOVER.md`