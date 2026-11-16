# 02 — 文档状态模型与手改保护

**What to build:** 用户在某个字段里改字的同时，流式生成的剩余内容到达同一字段。用户输入不被覆盖，界面改为提示「AI 有新版本，查看差异」。撤销与重做按编辑历史回退，而不是整份文档快照。

**Blocked by:** 01 — 离线生成打通到页面

**Status:** done

- [x] 在字段 A 打字时流式写入字段 A，最终保留的是用户输入
- [x] 被跳过的 AI 内容以"建议"形式可查看，用户可显式采纳
- [x] 撤销 50 步后回到初始状态，重做可逐步还原
- [x] 撤销栈能区分"AI 写入"与"用户编辑"
- [x] 单测覆盖四种写入规则的冲突路径

## Comments

### 2026-11-09 交付与验收（Lead 复核）

提交 `a29e9df`。改动只落在 `components/studio/**`、`lib/engine/doc.ts` 与两个测试文件；禁改的 `schema.ts`、`lint/**`、`llm/**`、`app/api/**`、`package.json` 经 `git diff` 确认未动。

Lead 独立复跑：

| 检查 | 结果 |
|---|---|
| 全量测试 | 201 passed / 14 files |
| 类型 | `tsc --noEmit --incremental false` exit 0 |
| 构建 | `pnpm build` 通过 |
| 设计禁令 | 新增组件扫描无纯黑白、无渐变、无左侧色条、无阴影、无禁用文案 |
| 规则落点 | R1 `applyStreamDelta` 只写 `pending`、R2 `commitField` 尊重 dirty、R3 `applyUserEdit` 立即写 doc、R4 `applyPatch` 默认 reject |
| AC-17 | 状态层与 reducer 层双覆盖：dirty 字段的 delta 只进 pending，value 不变；提交后新值进 suggestion 而非 value |

关键实现判断（我认可）：`applyStreamDelta` 即使字段已 dirty 也不改状态，避免界面把用户的编辑误导成"仍在生成"。

### 与 ARCHITECTURE 6.6 的偏差

`PromptDoc.schema` 目前是 `null`：本工单的文档以**字段文本**为值，SSE 也只返回文本，尚未把结构化 `PromptSchema` 同步进文档。后果是 `applyPatch` 只能按整字段路径工作，无法命中 `constraints.must` 这类叶子路径，未知路径返回 `unknown-field`。

这直接影响工单 04 与 06（它们要按叶子路径打补丁）。**决定**：工单 04 开工前先补一层路径映射（字段文本 ↔ 结构化路径），否则补丁会打空。已写进工单 04。

### 遗留

- 补丁能力只在纯函数层，未接 React action 与 UI（等 04/06 产出补丁）
- 建议差异是行级 LCS，非设计稿的词级双层 diff；超长单行文本会偏粗
- 撤销粒度为字段值，不是子句；与 6.6 的字段级 dirty 粒度一致
- 流式过程中允许撤销，后续 field-done 仍可能产生新的 AI 命令，未做冻结
