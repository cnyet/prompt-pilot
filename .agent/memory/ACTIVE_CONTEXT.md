# Active Context

> Last updated: 2026-11-11T13:45:00Z

## Current Task
- Done: Q0 设计系统；Q1 令牌层 + 基座组件 + 对比度脚本；Q2 工作台；Q3 评估（`5d771bb`）；Q4 模板/设置/chrome（`d1b86e8`）；Q5 响应式 + 双主题 + a11y（`1bb2d69`）。DESIGN.md 的 Q0-Q5 迁移全部收口；模板「用它开始」接通工作台预填（`3dae599`）；FR-6.4 盲评双向交换（`d9871fd`）。
- Goal: 维持「烛光羊皮纸」视觉与 DESIGN.md 一致；后续只做功能性欠账与真机验证。
- In progress: 无。
- Next step: 真实 ARK 密钥端到端验证（生成 → 试运行 usage 落库 → 评估 verdict → 成本页数字），需用户提供 key；无 key 时继续 P2 欠账（版本回滚 UI、库标签/收藏/分页）。
- Blockers: 环境无 ARK_API_KEY，真实链路未验。

## Current Constraints
- 令牌以 `DESIGN.md` 第二节为准，代码在 `app/globals.css`；改令牌须同步文档并跑 `pnpm check:contrast`。
- 全部文字组合 ≥4.5:1（深色最低 4.70:1）；中文标题系统宋体、零网络字体；金色只给主操作/当前步骤/关键数字；glow 只给 active/selected/focus，同屏 ≤2。
- 每页只有一个 h1（AppShell 顶栏页面名），内容标题用 h2；全局 `:focus-visible` 金色 2px。
- 左轨与 MobileNav 在 1024px 切换；玻璃拟态、渐变、emoji 图标禁止。
- 组件走 cva + Radix Slot；不引动效库、图标库、CSS-in-JS、图表库、状态库。
- 界面中文；禁止感叹号与 em dash；单屏 primary 按钮 1 个。
- 跑测试前停 3100；Chrome 隔离只用 `--user-data-dir` 与 `--password-store=basic`，绝不覆盖 HOME。

## Hard Constraints
- `lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结契约。
- 未知一律 null，不写 0；无判定显示「—」+ 待人工判定。
- 密钥只存本机 SQLite，接口只回末四位。
- 冻结契约与 CI 工作流改动须 code owner 审阅（`.github/CODEOWNERS`）。

## Do Not Retry
- 直接照搬 QuestUI 原稿 | 原因: 无中文、仅深色、11px 大写、语义色对比度不达标；只借语法并重写令牌。
- 用 `readonly:` 变体 | 原因: Tailwind v4 无此变体，必须用 `read-only:`。
- 工作台加右栏版本/对比/质量/导出 | 原因: DESIGN §4.1 + ADR-0004 不采用右栏诊断布局。
- 在 `about:blank` 上写 localStorage 再截图 | 原因: 源不同，主题不生效，会截出浅色冒充深色。
- 组件 JSX 当 null 判断 / 预览组件用 useMemo / 无条件启用 valid mock / 覆盖 HOME 跑 Chrome | 原因: 历史坑。

## Current Decisions
- 左轨 64px 默认、`\` 展开 208px，主题切换在轨底；顶栏持有唯一 h1 | Reason: 兼顾 DESIGN §3 与既有快捷键。
- Q2 时间轴副标签与诊断多栏借自 design-v2 截图，骨架保持 DESIGN §4.1 | Reason: 右栏依赖 FR-7/FR-11 未完成。
- 对比度脚本解析 `globals.css` 变量，不硬编码 | Reason: 防文档与代码漂移。
- CI 顺序：contrast → `next typegen` → typecheck → test → build | Reason: `next-env.d.ts` 未入库。
- ADR-0001/0004 视觉结论被 ADR-0006 取代；ADR-0002/0003/0005 继续有效。

## Current References
- `DESIGN.md`、`docs/adr/0006-questui-parchment-direction.md`
- `scripts/contrast-check.mjs`、`.github/workflows/ci.yml`
- 截图：`docs/assets/design-v2/`、`docs/assets/bento-r2/`、`docs/assets/bento-r3/`、`docs/assets/bento-q4/`、`docs/assets/q5/`
- `PRODUCT.md`、`CONTEXT.md`、`docs/HANDOVER.md`