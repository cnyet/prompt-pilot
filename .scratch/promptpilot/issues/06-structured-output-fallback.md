# 06 — 结构化失败的兜底链

**What to build:** 模型返回不合法内容时用户仍能拿到结果。系统依次尝试严格模式、宽松 JSON、修复重试，最后降级为纯文本，并明确说明发生了什么、为什么、怎么办。六种故障画像都能被注入并验证。

**Blocked by:** 05 — 接上火山方舟

**Status:** done

- [x] 六种故障画像（坏 JSON、围栏、截断、限流、额度用尽、慢流）各自走到预期分支
- [x] 修复重试最多两次，每次失败原因都记录在案
- [x] 彻底失败时降级为纯文本，界面明确提示且可手动重试
- [x] 输出被截断时能区分是长度上限还是上下文窗口耗尽
- [x] 以上每条都有自动化测试

## Comments

### 2026-11-09 交付与验收（Lead 复核）

提交 `f70d659`。禁改文件经 `git diff` 确认未动：`lib/llm/types.ts`、`lib/llm/ark.ts`、`lib/llm/errors.ts`、`lib/engine/**`、`components/**`、`package.json`。

Lead 独立复核：

| 检查 | 结果 |
|---|---|
| 全量测试 | 257 passed / 19 files（其中 llm 156 条） |
| 类型 | `tsc --noEmit --incremental false` exit 0 |
| 降级链 | 五个级别有显式类型与 `attempts` 记录，非"一路到底也算过" |
| 修复封顶 | `Math.min(2, ...)` 硬封顶；传 9 也只修 2 次，有测试 |
| 内容保留 | `pickPreservedOutput` 按码点取最长原始文本，且把 `finishReason` 与 `lengthCause` 绑定到被保留的那次输出 |
| 代码卫生 | 无 `any`、无新增 `console.log` |
| 环境残留 | 清理了 62M 的临时构建副本，并把 `.tmp-*/` 加入 `.gitignore` |

前端提示文案三段式，实测样例：

> 发生了什么：结构化生成失败，已降级为纯文本，保留的 21 个字符已写入「角色」字段。
> 为什么：依次尝试了严格 JSON 模式、JSON 模式、宽容解析、2 次修复，均未通过。最后一次校验错误是……
> 怎么办：点击"重试未生成字段"重新生成，或先用已保留的内容手动整理。

### 已知遗留

1. 中间层级（strict → object → loose → repair）只体现在 `attempts` 与日志里，UI 不展示；成功降级时用户无感，失败时才给三段式提示。这是有意为之，避免噪音。
2. `provider.structured` 仍按接口抛 `invalid_output`；只有 generate 路由走 `runStructuredOutcome` 渲染纯文本。其他调用方需从 `LlmError.cause.fallbackText` 取保留内容。
3. 上下文窗口成因依赖 `getModelConfig().contextWindow`，自定义模型无该值时归 `unknown`，不猜。
4. Mock 的 10 秒慢流只在 provider 级用注入延迟验证，路由测试没有真等 10 秒（有意避免拖慢测试）。

### 集成验证方式说明

06 交付时 03 正占用 3150 端口，Next 16 拒绝同目录起第二个 dev server。agent 用 rsync 复制最终源码到临时目录、symlink `node_modules` 后起 3160 完成实测，验证后已删除。这属于环境绕行，不是代码问题；Lead 已清理残留并补了 `.gitignore`。
