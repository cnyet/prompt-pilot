# 12 — 导出两种格式

**What to build:** 一键导出 Markdown 与 OpenAI messages 两种格式，产物语法合法，变量占位符按格式处理，粘进 SDK 就能跑。

**Blocked by:** 01 — 离线生成打通到页面

**Status:** done

- [ ] Markdown 导出结构可直接阅读，变量以双花括号保留
- [ ] OpenAI messages 导出是合法 JSON，含角色与变量清单
- [ ] 两种格式都不生成语法非法的字符串（用解析器验证）
- [ ] 导出可一键复制，并给出"已复制"反馈
- [ ] 含字面量花括号的内容不会被误当成变量

## Comments

- 2026-11-10 10:36 读完工单、架构 6.2 与十五、render/assumptions/chips/useGeneration。确定：纯函数消费 `buildExportAssumptions` 结果，导出层不读 hook，组件只做受控 UI。
- 2026-11-10 10:36 新增 `lib/engine/export.ts`：Markdown 与 OpenAI messages 两个纯函数，变量名/占位符/围栏/JSON 自检，消费 `buildExportAssumptions` 结果。`tests/unit/export.test.ts` 18 条通过。
- 2026-11-10 10:37 新增 `components/studio/ExportMenu.tsx`：受控格式切换、假设剔除开关、预览、复制与「已复制 / 复制失败」反馈；语法错误时禁用复制并列出原因。

### 2026-11-10 交付与验收（Lead 复核）

提交 `c67a5f0`（模块）与 `18c27e8`（挂载）。

| 检查 | 结果 |
|---|---|
| 越界 | 只新建 3 个文件，未改任何既有代码 |
| 单测 | 18 passed |
| 产物合法性 | JSON 生成后内部再 `JSON.parse`；Markdown 校验围栏配对与占位符完整 |
| 挂载 | `ExportMenu` 已接进工具栏，与假设 chip 共用 `exportWithoutAssumptions` 状态 |

设计上认可的三点：
1. 只有 `schema.input.variables` 声明的名字才算变量，未声明的 `{{literal}}` 按字面量保留并提示，不会被误替换
2. 代码围栏内的花括号跳过，不会被当占位符校验
3. 宁可拒绝也不产出坏文件：变量名非法、占位符缺右花括号、围栏不闭合都返回结构化错误

### 未覆盖

- 只支持 `{{name}}`，Handlebars 语法（`{{#if}}`、`{{a.b}}`）会被判非法并阻止导出
- 围栏识别是 CommonMark 常见子集，blockquote 或深缩进列表里的围栏不追踪
- OpenAI JSON 的 `variables` 是清单扩展键，不是官方请求参数；SDK 调用取 `model` 与 `messages`
- 组件未做视觉复核与剪贴板 E2E
