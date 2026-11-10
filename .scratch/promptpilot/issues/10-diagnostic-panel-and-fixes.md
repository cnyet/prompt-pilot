# 10 — 诊断面板与一键修复

**What to build:** 右栏按 error / warn / info 分组列出问题。点一条跳到对应字段并选中相关文字；能单项修复，也能一次修完所有可自动修复项。修完问题即时消失。

**Blocked by:** 09 — 诊断引擎：16 条规则；03 — 字段编辑器与单字段重算

**Status:** ready-for-agent

- [ ] 右栏显示分组问题与计数，存在 error 时计数徽标变红
- [ ] 点击问题能定位到字段并高亮
- [ ] 单项修复与全部修复都可用，修复后计数实时更新
- [ ] 用户可忽略某条问题，忽略后不再提示且被记住
- [ ] 修复不覆盖用户手改过的字段内容

## Comments

- 2026-11-10：新增 `useDiagnostics`，完成 150ms 防抖诊断、error/warn/info 分组计数、忽略键与 sessionStorage 会话记忆、单项与批量修复计划（批量跳过 dirty 字段，单项 dirty 返回二次确认）；`diagnostics.test.ts` 12 条、`studio-diagnostics.test.ts` 11 条通过。
- 2026-11-10：新增 `DiagnosticsPanel` 并接入 `StudioWorkspace` 右栏，完成 error、warn、info 分组与计数、error 时 danger 徽标、点击定位并选中命中词、单项与全部修复、忽略与恢复、右栏折叠展开；`tsc --noEmit` 通过。
- 2026-11-10：3240 端口目视验证（已关闭）：error 徽标为 danger 色；批量修复提示「已修复 13 条问题，跳过 2 个手改字段」且手改字段原文未动；手改字段单项修复出现二次确认；4.3k 字文档连续输入无 long task，最后一次输入到诊断刷新约 176 毫秒。
