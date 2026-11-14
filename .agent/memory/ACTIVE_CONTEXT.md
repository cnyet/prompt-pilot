# Active Context

> Last updated: 2026-11-14T07:55:00Z

## Current Task
- v3 Phase 4 模板页 v3 UI 已完成并本地提交（HEAD `83b0743`；plan `docs/superpowers/plans/2026-11-14-v3-batch-g.md`）：三分类 Tabs、风格筛选、12 个内置模板卡与 SVG 封面、预填、自定义模板创建/删除。
- 验证：typecheck 0；85 文件 / 887 用例；build ✓；check:contrast ✓；CDP 冒烟 26/26；独立验收 pass（0C/0I；2 Minor 已修并复验 11/11）。
- 未 push，本地 main 领先 origin/main。Next: Phase 5 设置/成本，Phase 6 v2 清理。

## Hard Constraints
- `lib/llm/types.ts` 冻结；`lib/engine/schema.ts` 冻结至 Phase 6 删除。v3 新代码不 import v2。
- stage 仅 generate/optimize/repair；未知一律 null 不写 0；未评分「未评分」；未设置预算「未设置」。
- 密钥只存本机 SQLite，接口只回末四位。无 prisma/migrations/，`db push` + `generate`。
- 测试隔离 `data/test.db`，绝不读写 `data/app.db`。

## Current Constraints
- v3 四件套为事实源：PRODUCT.md、docs/ROADMAP-V3.md、DESIGN.md、.impeccable/design.json。
- 界面中文；禁感叹号与 em dash；单屏 primary 1 个；金色 ≤10%；glow 同屏 ≤2。
- 改 DESIGN 令牌同步 app/globals.css 双主题并跑 `pnpm check:contrast`。

## Do Not Retry
- 照搬 QuestUI 原稿（无中文、11px、对比度不达标）。
- `readonly:` 变体（Tailwind v4 用 `read-only:`）。
- 模型显示名直接当 modelId（用 kebab slug + `modelDisplayLabel()`）。
- 测试读写 data/app.db。
- 依赖 lib/llm/mock.ts valid 画像验证 META 不泄漏（它不输出分隔符，需测试内注入）。
- 只用 record.status 判断并发（续写路径不写 running；用 appendIteration 的在飞检查）。
- `pnpm test -- <path>` 在 pnpm 10 下不过滤；定向测试用 `pnpm exec vitest run <path>`。
- 封面文字填充不用 `--text-faint`（对 surface-inset/bg-sunken <4.5:1）；用 `--text-muted`。

## Current Decisions
- 结果优先；导航 4 项；输出 Markdown + diff + ≤3 条改动说明；完成自动入库。
- 失败轮 failed、output 空；中断 canceled 保留正文；`finishReason=length` 视为失败。
- 流式：canceled 提交草稿，failed 丢弃草稿；`sawDone` 后传输错误不改完成态；结算重试 3 次后 clear settling。
- canceled 且正文为空时不覆盖 `latestOutput`（C1，`lib/db/records.ts`）。
- 重新生成仅限生成模式记录（UI guard）；API 层仍未按模式校验，属已知 out-of-scope。
- 对比原文：单轮优化「原文 vs 输出」，≥2 轮任选两轮（`lib/ui/compare.ts`）。
- 收藏/评分 PATCH 单飞合并，不原生 disable，保留方向键焦点（`lib/ui/meta-coalesce.ts`）。
- 记录标题仅生成时由 meta.title 更新；并发互斥在迭代层（running 迭代）。
- 记录日期筛选用 Asia/Shanghai 日历日：`from` 当日零点含，`to` 次日零点不含（`f616ee4`）。
- 重放仅 completed 发 meta；空源续写 409 `RECORD_HAS_NO_OUTPUT`；二次删除模板 404 `TEMPLATE_NOT_FOUND`。
- 库列表元数据更新走 `applyMetaUpdate`：收藏/已评分筛选下移除并递减总数，其他筛选就地替换（`lib/library/rows.ts`）。
- 抽屉 `CheckPanel` 以 `key={output}` 重置；关闭抽屉取消在飞流，服务端标记已中断并保留正文。
- 模板页服务端解析 `?template=` 并 `resolveTemplatePrefill`；`originTemplateId` 只挂到匹配模式的首条产出提交。
- 模板列表载荷不含 body；`resolveStyleSelection` 在删除后回落「全部风格」。
- 封面仅内联 SVG（400×240 / 400×500 / 400×225），`aria-hidden`，无渐变、无外链。

## Current References
- 历史细节：`.agent/memory/session-summary.md` Batch E/F/G 节。
- Batch G 计划：`docs/superpowers/plans/2026-11-14-v3-batch-g.md`（已入库）。
- Batch F 计划：`docs/superpowers/plans/2026-11-14-v3-batch-f.md`（已入库）。
- 备份：`data/app.db.bak-20261113-1139`。
