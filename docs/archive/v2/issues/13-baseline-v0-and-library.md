# 13 — 基线 v0 与最小提示词库

**What to build:** 用户第一次输入的那句话被存成 v0，不可删除。库里能看到保存过的提示词，点开可以继续编辑，新版本与 v0 同时存在。

**Blocked by:** 11 — 试运行：变量与真实输出

**Status:** done

- [ ] 首次生成自动创建 v0，且不可删除或覆盖
- [ ] 保存后库里出现该提示词，显示标题、版本数、更新时间
- [ ] 点开可继续编辑并另存为新版本，v0 仍在
- [ ] 版本号单调递增，记录来源
- [ ] 空库时给出可执行引导

## Comments

- 2026-11-10 11:44 完成 `lib/db/prompts.ts`：v0 创建、并发安全追加、列表与详情；`tests/unit/prompts.test.ts` 与 `tests/integration/prompts-route.test.ts` 共 18 条通过。
- 2026-11-10 11:45 完成 `/api/prompts` 与 `/api/prompts/[id]`：v0 修改与删除返回 409，版本号由服务端分配。
- 2026-11-10 11:50 完成提示词库列表、详情抽屉、版本时间线与基于任意版本另存新版本。
- 2026-11-10 11:52 完成 Studio 保存入口与首次生成后自动写入 v0。
- 2026-11-10 11:49 验证：新增测试 19 条通过，全量 452 条通过，`tsc --noEmit --incremental false` 无报错。
- 2026-11-10 11:52 3250 端口目视检查：空库引导、生成后自动出现 v0、列表、详情、基于 v1 另存 v2、v0 仍在，均符合预期；测试数据已清理，dev server 已关停。

### 2026-11-10 交付与验收（Lead 复核）

提交 `df66641`。`prisma/schema.prisma`、`useGeneration`、`types`、`lib/engine/**`、`package.json` 确认未动。

| 检查 | 结果 |
|---|---|
| 全量测试 | 452 passed / 34 files |
| 类型 / 构建 | `tsc` 0；`pnpm build` 通过，新增 `/api/prompts` 与 `/api/prompts/[id]` |
| v0 保护 | `assertVersionWritable(0)` 服务端 409，改、删、经由 PATCH 的路径都拦 |
| 版本号 | 事务内 max+1，`@@unique([promptId, versionNo])` 兜底，P2002/P2034/SQLITE_BUSY 重试 6 次 |
| 并发实测 | 4 次 PATCH 并发得 `[0,1,2,3,4]`，无重复，currentVersionId 指向最大号 |

值得记的一点：v0 的 `renderedText` 存首次输入原文，`schemaJson` 存首次生成的结构化文档。两者用途不同——前者是后续评估的对照组，后者是库内继续编辑的起点。

### 未覆盖

- 自动建 v0 只在正常完成时触发，停止/中断需手动保存
- 没有 `/versions` 子路由、回滚与导入 UI（API 已接受 rollback/imported）
- 无标签过滤、收藏、删除、分页 UI
- POST 无服务端幂等键，极端重试可能产生重复 v0
- 1440 并排布局的 `xl` 变体未在截图确认（clean build 已生成，留待 14 复核）
