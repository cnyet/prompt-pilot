# 17 — 撤销后假设 chip 的「已改」标记不同步

**What to build:** 撤销或重做之后，假设 chip 上的「已改」标记与字段的实际内容保持一致。撤销掉一次 chip 修改，标记就回到未改；撤销一次无关编辑，chip 标记不受影响。

**Blocked by:** 04 — 假设 chip 与字段级重算

**Status:** done

- [ ] 改 chip 后撤销一次，字段文本与该 chip 的「已改」标记同时回退
- [ ] 撤销一次与 chip 无关的编辑，chip 标记保持不变
- [ ] 重做同样一致
- [ ] 有 reducer 级测试覆盖上述三种路径

## Comments

### 2026-11-10 Lead 复核 04 时确认

`useGeneration.ts` 的 `undo` / `redo` 分支只做 `{ ...state, doc: undoDoc(state.doc) }`，不碰 `state.assumptionEdits`：

```ts
case 'undo':
  return { ...state, doc: undoDoc(state.doc) }
case 'redo':
  return { ...state, doc: redoDoc(state.doc) }
```

后果：撤销后字段文本回到 `语言：中文`，但 chip 仍显示「已改」。用户看到的是"我撤销了，但界面说我还改过"。

04 的 agent 已如实标注这是越界项（撤销栈在 `doc.ts`，不在它的作用域）。根因是两个状态源分离：`assumptionEdits` 是扁平映射，`doc` 有自己的命令栈，撤销不会回写前者。

修复方向（实现者判断）：在 undo/redo 后根据当前 doc 的叶子值重新推导「已改」集合，而不是新增一个删除动作；或者在生成完成时保存一份基线值，用「当前值 ≠ 基线值」作为标记依据。后者更稳，因为它不依赖撤销路径。

- 2026-11-10 采用基线方案：`lib/engine/assumptions.ts` 新增 `captureAssumptionBaseline`，chip 的 `modified` 改为「当前展示值 ≠ 基线值」，「已改」不再依赖独立映射；`pnpm exec vitest run tests/unit/assumptions.test.ts` 16 passed。
- 2026-11-10 接线 reducer：`GenerationState.assumptionEdits` 替换为 `baselineAssumptionValues`；`done`/`stop`/`fail` 按本次 `scheduled` 字段捕获基线，`undo`/`redo` 仍只回写 `doc`，标记由字段文本自动派生。目标测试 34 passed。
- 2026-11-10 补齐三条 reducer 路径测试（撤销 chip 修改、撤销无关编辑、重做），另加手改叶子与同字段连续改两条的回归；`pnpm exec tsc --noEmit --incremental false` exit 0；全量 `pnpm exec vitest run` 32 files / 420 passed。未触碰 `StudioWorkspace.tsx` 等禁改文件。
