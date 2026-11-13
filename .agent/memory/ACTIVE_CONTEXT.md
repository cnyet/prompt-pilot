# Active Context

> Last updated: 2026-11-13T03:10:00Z

## Current Task
- Done（Phase 0 文档收口，2026-11-13）：① 遗留改动验收提交 `fc00f4c`（网关端点规范化 + 测试库隔离 test.db）；② 分支 `feat/v3-result-first` + 备份 `data/app.db.bak-20261113-1047`；③ 文档收口 `f3a281d`（ADR-0007、CONTEXT/ARCHITECTURE/HANDOVER/README 重写、删 docs/ROADMAP.md）；④ P0-2 stage 枚举、P0-3 埋点字段、FR-4.5、DESIGN 7 处修正。
- In progress: 无（persist 收口）。
- Next step（按序）：① P1 剩余：NFR-9 i18n 决策、AC 补缺与去重、design.json colorMeta 补全；② P2 批次（11 条）；③ Phase 1 数据层与 API（3 人日，前置已清空可开工）。
- Blockers: design-parser.mjs 脚本本机缺失，改 DESIGN.md 结构前需先解决。

## Current Constraints
- v3 四件套为事实源：PRODUCT.md、docs/ROADMAP-V3.md、DESIGN.md、.impeccable/design.json；v2 八字段/评估/版本树已废弃。
- ARCHITECTURE.md 为「v3 目标契约 + 现状声明」，冲突以文档为准；代码仍运行 v2，Phase 6 前旧约定在 v2 代码存活期有效。
- DESIGN.md 六段固定结构 + frontmatter，改后跑 design-parser（暂缺失）；改令牌同步 app/globals.css 双主题并跑 `pnpm check:contrast`。
- 文字 ≥4.5:1；中文最小 12px；金色单屏 ≤10%；glow 只给 active/selected/focus 且同屏 ≤2；动效只动 opacity/transform（glow box-shadow 唯一例外，已定）。
- 界面中文；禁感叹号与 em dash；单屏 primary 1 个。
- 测试已隔离：`tests/global-setup.ts` 建独立 `data/test.db`，跑测试不用停 3100；测试绝不读写 `data/app.db`。
- Chrome 只用 `--user-data-dir` 与 `--password-store=basic`，绝不覆盖 HOME。

## Hard Constraints
- `lib/llm/types.ts` 冻结；`lib/engine/schema.ts` 冻结至 Phase 1 新模型落地，Phase 6 删。
- stage 枚举 generate/optimize/repair，无「说明」阶段；未知一律 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，接口只回末四位。
- 无 prisma/migrations/，`db push` + `generate`；迁移只增不删，Phase 6 删表前再备份。
- ARK 默认端点 `https://opencode.ai/inference/go/openai/v1`，旧地址 `normalizeArkBaseUrl` 自动补齐。

## Do Not Retry
- 照搬 QuestUI 原稿 | 原因: 无中文、仅深色、11px、对比度不达标。
- 用 `readonly:` 变体 | 原因: Tailwind v4 必须用 `read-only:`。
- `about:blank` 上写 localStorage 再截图；覆盖 HOME 跑 Chrome | 原因: 历史坑。
- 模型显示名直接当 modelId | 原因: 用 kebab slug + `modelDisplayLabel()`。
- 测试直接读写 data/app.db | 原因: 会删用户密钥，已改独立 test.db。

## Current Decisions
- v3 方向：结果优先；导航 4 项；输出 Markdown + diff + ≤3 条改动说明；完成自动入库。
- 数据模型 PromptRecord（含 copiedAt/originTemplateId 埋点）/ PromptIteration / Template；SSE start/delta/meta/usage/error/done；元数据 `<<<PROMPTPILOT_META>>>` 服务端剥离，失败降级输入前 24 字标题 + 空说明。
- 本地检查 P1（R101-R108）；模板 12 条内置（三类各 4）+ 自定义，内置删除 409。
- 网关 provider `openai_compatible` + `x-opencode-session` 头；kebab slug + 显示名映射。
- 成本趋势上海时区切日；未知金额不入折线、不补 0。
- ADR-0001/0003/0004 废弃（0006/0007 依次取代）；0002/0005/0006/0007 有效。

## Current References
- v3 四件套；PM 评审清单（session-summary 2026-11-12 节）；本轮记录（2026-11-13 节）
- `scripts/contrast-check.mjs`、`.github/workflows/ci.yml`、`app/globals.css`
- 备份：`data/app.db.bak-20261113-1047`（最新）
