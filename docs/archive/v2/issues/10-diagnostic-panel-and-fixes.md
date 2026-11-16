# 10 — 诊断面板与一键修复

**What to build:** 右栏按 error / warn / info 分组列出问题。点一条跳到对应字段并选中相关文字；能单项修复，也能一次修完所有可自动修复项。修完问题即时消失。

**Blocked by:** 09 — 诊断引擎：16 条规则；03 — 字段编辑器与单字段重算

**Status:** done

- [ ] 右栏显示分组问题与计数，存在 error 时计数徽标变红
- [ ] 点击问题能定位到字段并高亮
- [ ] 单项修复与全部修复都可用，修复后计数实时更新
- [ ] 用户可忽略某条问题，忽略后不再提示且被记住
- [ ] 修复不覆盖用户手改过的字段内容

## Comments

- 2026-11-10：新增 `useDiagnostics`，完成 150ms 防抖诊断、error/warn/info 分组计数、忽略键与 sessionStorage 会话记忆、单项与批量修复计划（批量跳过 dirty 字段，单项 dirty 返回二次确认）；`diagnostics.test.ts` 12 条、`studio-diagnostics.test.ts` 11 条通过。
- 2026-11-10：新增 `DiagnosticsPanel` 并接入 `StudioWorkspace` 右栏，完成 error、warn、info 分组与计数、error 时 danger 徽标、点击定位并选中命中词、单项与全部修复、忽略与恢复、右栏折叠展开；`tsc --noEmit` 通过。
- 2026-11-10：3240 端口目视验证（已关闭）：error 徽标为 danger 色；批量修复提示「已修复 13 条问题，跳过 2 个手改字段」且手改字段原文未动；手改字段单项修复出现二次确认；4.3k 字文档连续输入无 long task，最后一次输入到诊断刷新约 176 毫秒。

### 2026-11-10 交付与验收（Lead 复核）

提交 `7c96b18`。禁改文件（`useGeneration`、`types`、`AssumptionChips`、`ExportMenu`、`lint/rules`、`schema`、`package.json`）经 `git diff` 确认未动。

| 检查 | 结果 |
|---|---|
| 全量测试 | 423 passed / 32 files |
| 类型 / 构建 | `tsc` 0；`pnpm build` 通过 |
| 脏字段保护 | 计划阶段返回 `needs-confirmation`，批量阶段在计划与写回各过滤一次 |
| 忽略状态 | sessionStorage，键为「规则+路径+命中词」，改字后不会重新冒出来 |
| 性能 | 150ms 防抖；4365 字连续 30 次输入无 longtask，末次到面板更新约 176ms |

脏字段保护是双重的：`planAllFixes` 先过滤一遍，写回前再按 dirty 过滤一遍。这种"计划与执行各校验一次"的写法值得保留，因为两者之间有异步间隙。

### 已知问题

1. **修复写入被标记为手改**（已开 19）：修过的字段后续批量修复会被跳过，用户看到的是"修过一次就不给修了"。
2. `meta.title` 不在八字段内，标题级问题只能忽略，不能自动写回。
3. 修复是整字段重写，解析器无法识别的游离行不保留（脏字段有二次确认挡住）。
4. 诊断只基于 schema，textarea 里未解析的游离文本不参与；流式 pending 不参与诊断。
5. 右栏「版本」标签页留待工单 13。

### 环境备注

agent 报告 Turbopack dev 复用了旧的 Tailwind 产物导致新 utility 未生效，目视检查改用 webpack 模式。Lead 已跑全新 `pnpm build`，产物为全量生成，不影响源码。
