# 12 — 导出两种格式

**What to build:** 一键导出 Markdown 与 OpenAI messages 两种格式，产物语法合法，变量占位符按格式处理，粘进 SDK 就能跑。

**Blocked by:** 01 — 离线生成打通到页面

**Status:** ready-for-agent

- [ ] Markdown 导出结构可直接阅读，变量以双花括号保留
- [ ] OpenAI messages 导出是合法 JSON，含角色与变量清单
- [ ] 两种格式都不生成语法非法的字符串（用解析器验证）
- [ ] 导出可一键复制，并给出"已复制"反馈
- [ ] 含字面量花括号的内容不会被误当成变量

## Comments

- 2026-11-10 10:36 读完工单、架构 6.2 与十五、render/assumptions/chips/useGeneration。确定：纯函数消费 `buildExportAssumptions` 结果，导出层不读 hook，组件只做受控 UI。
- 2026-11-10 10:36 新增 `lib/engine/export.ts`：Markdown 与 OpenAI messages 两个纯函数，变量名/占位符/围栏/JSON 自检，消费 `buildExportAssumptions` 结果。`tests/unit/export.test.ts` 18 条通过。
- 2026-11-10 10:37 新增 `components/studio/ExportMenu.tsx`：受控格式切换、假设剔除开关、预览、复制与「已复制 / 复制失败」反馈；语法错误时禁用复制并列出原因。
