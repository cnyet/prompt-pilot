# Active Context

> Last updated: 2026-11-13T01:52:26Z

## Current Task
- Done（v3 重置文档轮，2026-11-12）：PRODUCT.md 重写 v3「结果优先」；新建 docs/ROADMAP-V3.md（7 阶段 16 人日）；DESIGN.md 重写六段 Stitch 格式；新建 .impeccable/design.json。验证：design-parser 覆盖 ✓、harness 24/24 ✓、check:contrast 全过 ✓。
- Done：独立 PM 评审（只读）。「有条件通过，暂不进 Phase 1」，19 条问题（3 P0 / 5 P1 / 11 P2），清单见 session-summary 2026-11-12 节。
- In progress: 无（persist 收口换新会话）。
- Next step（按序）：① P0-1 文档收口：CONTEXT.md、ARCHITECTURE.md、HANDOVER.md、README.md、ADR-0007、废弃 docs/ROADMAP.md；② P0-2 FR-9.1 删「说明」阶段并定 stage 落库值；③ P0-3 PromptRecord 补 copiedAt/originTemplateId 埋点；④ P1 修 DESIGN.md 4 处 v2 术语与口径矛盾。修完进 Phase 1。
- Blockers: 工作区遗留未提交代码改动（设置连通性测试/成本分页，`f3e8448` + 工作区），须先验收提交，勿与 v3 混提交。

## Current Constraints
- v3 四件套为事实源：PRODUCT.md、docs/ROADMAP-V3.md、DESIGN.md、.impeccable/design.json；v2 八字段/评估/版本树已废弃。
- DESIGN.md 为六段固定结构 + YAML frontmatter，改后跑 design-parser；改令牌同步 app/globals.css 双主题并跑 `pnpm check:contrast`。
- 文字 ≥4.5:1；中文最小 12px 禁大写变形；金色单屏 ≤10%；glow 只给 active/selected/focus 且同屏 ≤2。
- 组件走 cva + Radix Slot；不引动效/图标/CSS-in-JS/图表/状态库；动效只动 opacity 与 transform（glow 的 box-shadow 例外待澄清）。
- 界面中文；禁感叹号与 em dash；单屏 primary 1 个。
- 跑测试前停 3100；Chrome 只用 `--user-data-dir` 与 `--password-store=basic`，绝不覆盖 HOME。

## Hard Constraints
- `lib/llm/types.ts` 仍冻结；`lib/engine/schema.ts` 冻结至 Phase 1 新模型落地，Phase 6 删（HANDOVER 表述需同步修订）。
- 未知一律 null 不写 0；未评分显示「未评分」；未设置预算显示「未设置」。
- 密钥只存本机 SQLite，接口只回末四位。
- 无 prisma/migrations/，用 `pnpm exec prisma db push` + `prisma generate`；v3 迁移只增不删，Phase 6 删表前再备份。

## Do Not Retry
- 在 Phase 0 文档收口前开 Phase 1 | 原因: 现存两套 SSE 协议与数据模型（评审 P0-1）。
- 照搬 QuestUI 原稿 | 原因: 无中文、仅深色、11px、对比度不达标。
- 用 `readonly:` 变体 | 原因: Tailwind v4 必须用 `read-only:`。
- `about:blank` 上写 localStorage 再截图；覆盖 HOME 跑 Chrome | 原因: 历史坑。
- 模型显示名直接当 modelId | 原因: 用 kebab slug + `modelDisplayLabel()`。

## Current Decisions
- v3 方向：结果优先；导航 4 项（工作台/提示词库/模板/设置）；工作台只做生成+优化，输出 Markdown + diff + ≤3 条改动说明；完成自动入库，收藏/评分/存模板为事后动作。
- 数据模型 PromptRecord / PromptIteration / Template；SSE start/delta/meta/usage/error/done；元数据用 `<<<PROMPTPILOT_META>>>` 分隔符服务端剥离，失败降级为输入前 24 字标题 + 空说明。
- 本地检查 P1（R101-R108）；模板 12 条内置（文本/图片/视频各 4）+ 自定义，内置删除 409。
- 网关 `https://opencode.ai/inference/go`，provider `openai_compatible`；kebab slug + 显示名映射。
- 成本趋势上海时区切日；未知金额不入折线、不补 0；`role="img"` + sr-only 表。
- ADR-0001/0004 被 0006 取代；0002/0003/0005 有效；v3 须补 ADR-0007（未建）。

## Current References
- v3 四件套；PM 评审清单（session-summary 2026-11-12 节）
- `scripts/contrast-check.mjs`、`.github/workflows/ci.yml`、`app/globals.css`
- 备份：`data/app.db.bak-20261111-1430`（Phase 0 开工前再备份）
