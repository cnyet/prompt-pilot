# 04 — 假设 chip 与字段级重算

**What to build:** 生成完成后，中栏顶部出现一排假设 chip（输出语言、长度量级、受众、格式），显示模型替用户做了哪些决定。用户点开某个 chip 改成别的值，只有受影响的字段被重算，其余字段保持不动。

**Blocked by:** 02 — 文档状态模型与手改保护；03 — 字段编辑器与单字段重算

**前置缺口（05 验收时发现）：** 工单 02 的 `PromptDoc.schema` 目前是 `null`，文档值只有字段文本，没有结构化路径。假设 chip 要按 `output.language` 这类路径重算字段，必须先补一层「字段文本 ↔ 结构化路径」映射，否则重算与补丁会打空。

**Status:** done

- [ ] 生成后至少出现三个假设 chip，每个带当前值与可选候选
- [ ] 改一个 chip 只重算受影响字段，其余字段逐字不变
- [ ] 改过的 chip 有可见标记，未改过的保持低调
- [ ] 假设可在导出时选择剔除
- [ ] 没有可用模型时，chip 仍可编辑并触发离线重算

## Comments

- 2026-11-10 新增 `lib/engine/assumptions.ts`：五条假设路径定义、chip 派生、复用 `replaceLeafValue` 的字段写回、导出假设数据。`pnpm exec vitest run tests/unit/assumptions.test.ts` 14 passed。
- 2026-11-10 接线 `generationReducer` 与 `useGeneration`：新增 `assumption-change` 与导出开关动作，chip 值从字段叶子派生。`tests/unit/studio-chips.test.ts` 13 passed，原有 reducer/field-ops 26 passed。
- 2026-11-10 新增 `components/studio/AssumptionChips.tsx` 并接入 `StudioWorkspace`：中栏顶部五条 chip、已改标记、候选选择、导出剔除开关。当时 `tsc --noEmit --incremental false` 在本工单文件无报错，仅剩作用域外 `lib/llm/ledger.ts` 的 5 条空值错误（后续已由对方修复）。
- 2026-11-10 验证完成：`pnpm exec vitest run tests/unit/assumptions.test.ts tests/unit/studio-chips.test.ts tests/unit/doc.test.ts` 43 passed；`pnpm exec tsc --noEmit --incremental false` exit 0；全量 `pnpm exec vitest run` 345 passed。未启动 dev server，视觉复核步骤见交付报告。


### 2026-11-10 交付与验收（Lead 复核）

提交 `c29549e`。禁改文件 `paths.ts`、`doc.ts`、`schema/compose/render/sse`、`lib/llm/**`、`app/api/**`、`prisma/**`、`package.json` 经 `git diff` 确认未动。

| 检查 | 结果 |
|---|---|
| 全量测试 | 345 passed / 26 files |
| 类型 | `tsc` exit 0 |
| 构建 | `pnpm build` 通过 |
| 只动受影响字段 | 五条路径各有 `it.each` 断言：其余七个字段 `toBe` 同一引用，目标字段等于 `replaceLeafValue` 的结果，字段内其他叶子不变 |
| 无 Key 重算 | 用 stub 让 `fetch` 抛错，dispatch 仍完成修改，证明不依赖网络 |
| 内容保全 | 手写游离行在 chip 写回后逐字保留（继承工单 16 的规则） |

### 已知问题（已开 17）

撤销 chip 修改后，字段文本回退但 chip 的「已改」标记不回退。根因是 `assumptionEdits` 与 `doc` 的撤销栈是两个状态源，`undo` 只回写 `doc`。

### 边界

- chip 是叶子级重算，不是语义重写：改「输出语言」只改 `语言：` 这一行，不翻译正文
- chip 修改走 `applyUserEdit`，目标字段会显示「已手改」，保留已有 AI 建议
- 只展示五条约定的路径，模型给出的其他假设保留在 schema 与导出里，不出 chip
- 导出剔除开关与数据已就绪，等工单 12 消费
