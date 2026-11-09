# 09 — 诊断引擎：16 条规则

**What to build:** 给一份提示词结构，立刻返回问题清单：每条带位置、级别、为什么是问题、怎么修。纯本地计算，不调模型，四千字以内 50 毫秒完成。

**Blocked by:** None. Can start immediately.

**Status:** done

- [x] 16 条规则全部实现，每条都有正例与反例单测
- [x] 缺"明确不做"、缺"知识不足策略"、缺成功标准三类报 error
- [x] 矛盾约束能被四个轴（详略、长度、正式度、格式）识别
- [x] 四千字提示词全量诊断在 50ms 内，有性能断言
- [x] 每条问题带可执行的修复建议，能自动修的标出来

## Comments

### 2026-11-09 交付与验收（Lead 复核）

提交 `7ef8b58`。实现落在 `lib/engine/lint/`，未触碰 `schema.ts`、`types.ts`、`package.json`，`git diff` 确认无越界。

Lead 独立复跑，不采信 agent 自述：

| 检查 | 结果 |
|---|---|
| 作用域 | 7 个文件全在允许范围内，3 个禁改文件 `git diff` 为空 |
| 规则数 | 16，`RULE_LEVELS` 与 ARCHITECTURE 6.4 逐条一致 |
| 级别 | R002/R004/R005/R006/R008 = error；R014 按阈值动态 error/warn |
| R008 四轴 | detail / length / formality / format 均有实现，含跨轴 AC-4 用例 |
| 单测 | 72 passed（3 files），每条规则 ≥ 3 处断言，R008 有 5 条正例 |
| 性能 | 4389 字样本，median 0.25ms / max 0.29ms，断言 max < 50ms |
| 类型 | `tsc --noEmit --incremental false` exit 0 |
| 确定性 | 同一输入重复调用结果一致，无时间与随机依赖 |

### 待处理的契约观察（不阻塞本工单）

1. **R004 / R005 / R006 在 `parse()` 成功的 schema 上不可达**，因为契约里 `successCriteria`、`scopeOut` 用了 `.min(1)`，`knowledgePolicy`、`ambiguityPolicy` 用了 `.min(1)`。规则实际只在「用户在界面上把数组删空」这类内存态生效。这意味着保存路径若用 Zod 把关，用户看到的会是解析错误而不是可修复的诊断项。**待定**：schema 是否应允许不完整草稿，把完整性交给诊断，而不是在解析层整份拒绝。
2. `constraints.must` 是扁平 `string[]`，R016 的分组只能靠 `【主题】` 前缀。若要做一等分组需改契约为 `Array<{ group?: string; text: string }>`。
3. `linter.severityOverride` 是 `Record<string, string>`，引擎会静默忽略非法级别。后续可收紧为 `Record<LintRuleId, LintLevel>`。
4. R008 目前只有关键词轻量模式，`ctx` 没有深度语义模式（模型检测）的挂载点。

### 已知误报风险

- R013 仅在字段内前 200 字找先行词，不跨字段；「先写一段话。它……」会被报。默认 info 级即为降噪。
- R008 把「逐条」当详略高、「简洁」当详略低，同现即报，召回优先。
- R001 与 R009 是子串匹配，「适当性」「专业术语」会命中；R001 的删除修复会替换该字段所有同名命中。
- R014 按 CJK 1 字≈1 token 粗算，偏保守。
