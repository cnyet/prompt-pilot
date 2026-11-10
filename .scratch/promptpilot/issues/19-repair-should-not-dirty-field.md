# 19 — 修复写入不应把字段标记为「用户手改」

**What to build:** 点「一键修复」之后，被修过的字段不会被当成用户手改。用户随后再点一次修复，这些字段仍然能被修复；只有用户真的在输入框里敲过字，才进入保护状态。

**Blocked by:** 10 — 诊断面板与一键修复

**Status:** done

- [ ] 修复写入后，该字段的来源显示为「修复」而不是「已手改」
- [ ] 连续点两次「一键修复」，第二次仍能修复第一次修过的字段里新出现的问题
- [ ] 用户真正手改字段后，批量修复仍然跳过它（现有保护不回退）
- [ ] 有测试断言「修复写入」与「用户编辑」两种来源在 dirty 判定上不同

## Comments

### 2026-11-10 Lead 复核 10 时发现

10 的实现里，修复通过 `updateField(field, text)` 写回，而 doc 层把任何 `updateField` 都记为 `dirty: true`。后果链：

1. 点一次「一键修复」，三个字段被修 → 这三个字段变成 dirty
2. 用户改了一处别的字段，再点「一键修复」
3. 第一次修过的三个字段被当成"手改字段"跳过

用户视角是「我修了一次，第二次它就不给我修了」，没有任何解释。

根因不是 10 的实现错，是工单里我给的约束「写回请用 `updateField`」导致的：当时为了让它不碰 `useGeneration`，选了现有 API，而现有 API 只有"用户编辑"一种写入语义。

正确做法应该有一条独立的写入路径：`origin: 'patch'`、`dirty: false`。`lib/engine/doc.ts` 里 `CommandType` 已经有 `'patch'` 与 `applyPatch`，但没有接到 React 层。

### 另一条同类问题

修复是 `applyFix → renderFieldText` 整字段重写，字段里解析器无法识别的游离行不会被保留。对用户手改字段，这条被二次确认挡住了；但对 AI 生成的规范文本，目前没有已知问题。若后续发现，归入工单 16 的同类处理。

### 2026-11-10 实现进度

- doc 层：新增 `applyRepair`（origin `'patch'`、dirty false、status done，撤销命令 type `'patch'`）与 `isUserEdited` 判定；复用既有枚举，避免改 FieldBlock / StudioWorkspace 的穷尽映射。`useGeneration` 新增 `repair-field` action 与 `repairField` 方法；`useDiagnostics` 的 `FieldWrite` 增加 `kind: 'repair' | 'edit'`，并提供 `applyFieldWrites` 把计划按 kind 落回文档。目标测试 68 条通过，`tsc` 0。
- 测试覆盖：`doc.test.ts` 修复与用户编辑 dirty 判定不同 + 撤销/重做一致；`studio-diagnostics.test.ts` 连续两次一键修复、手改字段仍被跳过、计划 kind 与 kind 分派；`studio-chips.test.ts` reducer 连续两次修复与撤销恢复。全量 451 条通过（34 个文件）。
- 待接线：`StudioWorkspace.tsx` 的 `applyWrites` 仍调用 `updateField`（禁改文件，另一位 agent 正在改）；接线时把写回改成 `repairField(write.field, write.text)` 即可，API 与本单测语义已就绪。来源 chip 沿用 `'patch'`，FieldBlock 现有文案是「补丁写入」、状态是「已生成」，不再是「已手改」。

### 2026-11-10 交付与验收（Lead 复核）

提交 `16cb5a8`（doc 层）与 `df66641`（UI 接线）。

| 检查 | 结果 |
|---|---|
| 目标测试 | 35 passed（doc + studio-diagnostics） |
| 全量 | 452 passed |
| 类型 | `tsc` 0 |
| 枚举成本 | 新增 `FieldOrigin 'repair'` 会触发 `FieldBlock` 穷尽 switch 报错，改为复用 `'patch'` |
| 写入区分 | `applyRepair` → `origin 'patch'` / `dirty false`；`applyUserEdit` → `origin 'user'` / `dirty true` |
| 统一判定 | `isUserEdited(field) = origin === 'user'` |

UI 接线由 Lead 完成（`applyWrites` 按 `write.kind` 分派到 `repairField` / `updateField`），因为该文件当时与工单 13 共用。

### 保留的例外

`applyPatch('overwrite')` 仍刻意保留 dirty。这是工单 02 定的 R4 保护——覆盖式补丁必须让用户知道字段被改过，与修复写入不是一回事，不应为了「dirty 完全等于 origin==='user'」的整齐而抹掉。

### 遗留

来源文案仍是「补丁写入」（`FieldBlock` 硬编码，`status` 为 `done` 时显示「已生成 · 补丁写入」）。改成「修复」需要扩枚举，代价大于收益，留待文案统一时处理。
