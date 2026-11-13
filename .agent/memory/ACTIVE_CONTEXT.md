# Active Context

> Last updated: 2026-11-13T05:20:00Z

## Current Task
- In progress: v3 Phase 1+2 craft 实现（shape brief 已确认，见 `docs/shape-studio-v3.md`）。SDD 批次推进中：
  - Batch A 数据层第一批：**已验收**（reviewer approve）。提交 `8ee16b3` schema 三模型+LlmCall 列、`7e402a5` settings modelOptimize+预算键、`cd77c37` registry optimize 角色。备份 `data/app.db.bak-20261113-1139`。
  - Batch B 引擎纯函数层：**实现完成待终审**。提交 `aec9c65` meta 切分、`bcbacf0` sse-v3、`542cde0` 幂等 LRU、`9008711` 三组系统提示词。545/545 测试。两处计划偏差有理由（提前出现降级分支；容量用例断言矛盾修正）。
- 批次计划：`docs/superpowers/plans/2026-11-13-v3-batch-{a,b,c}.md`；B/C 已写好，C 待 B 终审通过后派实现者。
- Next step: 1) Batch B 终审；2) Batch C（ledger 加法 → lib/db/records.ts → /api/generate → optimize/repair 路由）；3) Batch D（records/templates/stats API + 12 模板 seed + 预算聚合）；4) Batch E（studio-v3 UI）。
- Phase 2 收口项：主题切换移顶栏（DESIGN §4.1 对账，AppShell.tsx:169-181 现状）。

## Current Constraints
- v3 四件套为事实源：PRODUCT.md、docs/ROADMAP-V3.md、DESIGN.md、.impeccable/design.json；v2 八字段/评估/版本树已废弃。
- ARCHITECTURE.md 为「v3 目标契约 + 现状声明」，冲突以文档为准；代码仍运行 v2，Phase 6 前旧约定在 v2 代码存活期有效。
- DESIGN.md 六段固定结构 + frontmatter，改后跑 design-parser（暂缺失）；改令牌同步 app/globals.css 双主题并跑 `pnpm check:contrast`。
- 文字 ≥4.5:1；中文最小 12px；金色单屏 ≤10%；glow 只给 active/selected/focus 且同屏 ≤2；动效只动 opacity/transform（glow box-shadow 唯一例外，已定）。
- 界面中文；禁感叹号与 em dash；单屏 primary 1 个。
- 测试已隔离：`tests/global-setup.ts` 建独立 `data/test.db`，跑测试不用停 3100；测试绝不读写 `data/app.db`。
- Chrome 只用 `--user-data-dir` 与 `--password-store=basic`，绝不覆盖 HOME。
- v3 新代码不 import v2（lib/engine/schema.ts、lib/engine/sse.ts、lib/templates.ts）；v2 存活至 Phase 6。
- types.ts 冻结零触碰；v3 stage 在 ledger 本地扩展（LedgerStage），不改 EngineStage。

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
- 幂等容量驱逐测试断言「b 仍复用」 | 原因: 一致的最旧完成驱逐策略下不成立（Batch B 已修正为 c 复用）。

## Current Decisions
- v3 方向：结果优先；导航 4 项；输出 Markdown + diff + ≤3 条改动说明；完成自动入库。
- Shape 裁定：diff 默认行内；重新生成=追加迭代；主题切换移顶栏。
- 数据模型 PromptRecord（含 copiedAt/originTemplateId 埋点）/ PromptIteration / Template；SSE start/delta/meta/usage/error/done；元数据 `<<<PROMPTPILOT_META>>>` 服务端剥离，失败降级输入前 24 字标题 + 空说明。
- 失败轮落库 status failed、output 空（时间线可见可重试）；中断保留正文 status canceled（FR-4.5）。
- 本地检查 P1（R101-R108）；模板 12 条内置（三类各 4）+ 自定义，内置删除 409。
- 网关 provider `openai_compatible` + `x-opencode-session` 头；kebab slug + 显示名映射。
- 成本趋势上海时区切日；未知金额不入折线、不补 0。
- ADR-0001/0003/0004 废弃（0006/0007 依次取代）；0002/0005/0006/0007 有效。

## Current References
- shape brief `docs/shape-studio-v3.md`；批次计划 `docs/superpowers/plans/2026-11-13-v3-batch-{a,b,c}.md`
- v3 四件套；ARCHITECTURE §五/§九/§十二；ROADMAP-V3 §2
- 备份：`data/app.db.bak-20261113-1139`（最新）
