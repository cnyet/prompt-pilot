# 03 — 字段编辑器与单字段重算

**What to build:** 八个字段以可折叠块呈现，每块都能直接编辑。对单个字段点"加长 / 缩短 / 更具体 / 重新生成"只影响该字段，其他字段逐字不变。AI 产出与用户改动有可辨认的来源标记。

**Blocked by:** 02 — 文档状态模型与手改保护

**Status:** done

- [x] 八个字段块可展开折叠，编辑后渲染结果实时更新
- [x] 对单字段执行四种操作，只有该字段变化，其余字段内容与字节数都不变
- [x] AI 生成的内容有来源标记，用户改动后标记消失
- [x] 结构化、渲染文本、JSON 三视图可切换且内容一致

## Comments

### 2026-11-09 交付与验收（Lead 复核）

提交 `50febf5`。禁改文件经 `git diff HEAD` 确认未动：`app/api/engine/generate/route.ts`、`lib/llm/**`、`lib/engine/{schema,compose,render,sse}.ts`、`package.json`。

Lead 独立复核：

| 检查 | 结果 |
|---|---|
| 全量测试 | 258 passed / 19 files |
| 类型 | `tsc` exit 0 |
| 构建 | `pnpm build` 通过，`/api/engine/field` 与 `/api/engine/generate` 均为动态路由 |
| 离线零漂移 | 用生产构建在 3170 起服务，generate 的 SSE 与基线 3225 行逐行一致 |
| 单字段路由 | 真实 POST `{field, action, text}`：stage 2 / delta 1 / done 1，只返回该字段 |
| 端口与残留 | 3150、3160、3170 均已释放；agent 的临时目录已自行清理 |

「只动该字段」的保证在协议层是结构性的：**服务端只收到目标字段的文本，拿不到其他字段，也就没有机会改它们**。这比在客户端做 diff 更可靠。

### 路径映射（04 的前置，已补齐）

覆盖八字段全部叶子路径，另导出 `SUPPORTED_ASSUMPTION_PATHS`：`output.language`、`output.length`、`output.format`、`context.audience`、`output.tone`。`paths.test.ts` 用 `composePrompt` 渲染八字段再解析，逐字段与原始 schema `toEqual`，`buildSchemaFromFields` 重建整份 schema 也相等。

### 发现的缺陷（已开 16）

**单字段重算会静默丢弃无法解析的行。**

Lead 用一段非规范格式的字段文本测试「缩短」：五行输入（格式 / 章节 / 长度 / 语言 / 语气）只回来一行「格式：Markdown」，其余四行无声消失。用规范格式的原文测试则正常（65 → 58 字符，只删一项）。

根因是重算走「解析成结构 → 变更 → 重新渲染」，无法映射的行在解析阶段就被丢掉，重渲染自然不带它们。工单 03 的验收标准（只动目标字段）成立，但**内容保全不成立**，且用户没有任何提示。

已开工单 16 专门修这一条，并把它列为 04 的并行风险：假设 chip 也用同一套路径写回，如果不修，用户手改过的字段在改 chip 时同样会被截断。
