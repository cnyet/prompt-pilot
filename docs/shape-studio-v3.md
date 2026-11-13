# Shape Brief: v3 工作台页（/studio）

> Status: 用户已确认（2026-11-13）。来源：/impeccable shape。
> 事实源以 PRODUCT.md / DESIGN.md / docs/ROADMAP-V3.md 为准；本文件是任务级设计简报，供 craft 实现与验收对照。

## 1. Feature Summary

工作台是 PromptPilot v3 的核心页面，只做两件事：从一句话需求生成提示词，或对已有提示词做优化。屏幕主角是「结果面」：一张最亮、最安静的纸，流式渲染产出的 Markdown 提示词。用户是每周几次赶着干活、不想学方法论的非技术业务人员；成功标准是从输入到拿到可复制的结果，默认路径不超过三步，完成即自动入库。

## 2. Primary User Action

把需求（或已有提示词 + 可选要求）交给系统，读结果，复制带走。唯一的金色主操作是「生成 / 优化」按钮；其余一切动作（检查、继续优化、收藏、评分、存模板）都是结果之后的事后动作。

## 3. Design Direction

- 色彩策略：Restrained（product 默认）。金色预算按 DESIGN「One Candle Rule」执行：单屏 ≤10%，只给主操作、当前模式标签、焦点；同屏发光 ≤2 个。
- 主题场景句：运营在深夜赶稿，台灯下打开深棕桌面上的一张会发光的羊皮纸；白天办公室则是日光下的羊皮纸变体。深色主场景，浅色可用，双主题一套材质。
- 锚点参考：Linear 的信息密度与状态精致度、Stripe 的表单清晰度、VS Code 的 diff 可读性。
- 登记：product。熟悉感是特性，工具隐入任务；系统字体、标准 tabs/chips/textarea、固定 rem 字阶。
- 本轮裁定的 DESIGN 对账项：主题切换从侧栏底部移到顶栏（craft 时同步改 AppShell.tsx 与 DESIGN.md）。

## 4. Scope

- 保真度：production-ready，直接进 `feat/v3-result-first`。
- 广度：整个工作台页（双模式 + 结果面 + 继续优化 + 检查面板 + 结果动作）。
- 交互：shipped-quality 组件，真实 SSE 流式、真实入库。
- 时间意图：Phase 2 一个批次内完成并验收 AC-1..7、19..24、27。

## 5. Layout Strategy

- 顶栏（72px，唯一 h1）之下，内容单列居中，结果正文 68ch 上限，上方是输入区。
- 输入区退后：`bg-sunken` 层的输入卡，模式 tabs（生成/优化，底部 2px 金色描边）+ 目标类型三 chip（仅生成模式）+ 大 textarea + 唯一金色主按钮 + 字数。
- 结果面是屏幕最亮的纸：`paper-surface`/`paper-raised`，默认渲染 Markdown（16px/1.75），可切源码（等宽）。顶部动作条：复制、下载、重新生成、停止。
- Meta 行贴结果下方：模型、耗时、token、费用，未知「—」。
- 继续优化条常驻结果下方：输入框 + 四个快捷 chip（更简洁、更具体、更严格、换一种风格；只填入不提交）。
- 检查是按需入口，不点击时页面上不存在诊断面板。
- <1024px 单列，底部标签栏导航，不隐藏评分收藏复制。

## 6. Key States

| 状态 | 用户要看到什么 |
|---|---|
| 空态（无结果） | 一句说明 + 一个动作（如「输入需求，开始生成」），不写「暂无数据」 |
| 无密钥 | 提交禁用 + 原因 + 去设置入口；不伪造输出；库/模板/复制仍可用 |
| 流式中 | 结果面实时增量渲染；停止按钮可见；中断保留已生成文本并标记「已中断」 |
| 完成 | Meta 行显示模型/耗时/token/费用（未知「—」）；自动入库提示性呈现 |
| 失败 | 可读中文错误；不写半成品迭代；可重试 |
| 对比原文 | 并排/行内 diff，增删改逐行高亮，最多 3 条改动说明；原文永久可切回 |
| 预算 80%/100% | 设置页与工作台提示（100% 强提示不阻断） |

## 7. Interaction Model

⌘Enter 提交 / Esc 中断；同一时刻一个进行中请求，双击不产生第二条记录。模式切换不丢另一侧输入。收藏即时切换、评分 1 到 5 星（未评分显示「未评分」）。检查按需展开，error/warn/info 分级。所有动作键盘可达，焦点环 2px 金色。

## 8. Content Requirements

全部界面文案进 `lib/i18n/zh.ts`（t(key) 形状）；中文优先，禁感叹号、em dash、emoji、「强大/智能」。空态、错误、无密钥说明都要成句。动态内容：流式正文、diff、字数计数、Meta 数值。

## 9. Recommended References

product.md（已读）、interaction-design.md（流式与中断）、spatial-design.md（输入区/结果面层级）。

## 10. Resolved Decisions

Brief 确认时未另行裁定，按建议值执行：

- diff 默认视图：行内（inline），可切换并排（side-by-side）。
- 重新生成：追加新迭代，不覆盖当前迭代（符合「迭代不覆盖」契约与 FR-4.3）。
- 主题切换位置：移到顶栏（AppShell.tsx 侧栏底部切换迁至顶栏，DESIGN.md §4.1 同步对账）。

## Craft 前置依赖

Phase 2 依赖 Phase 1 数据层与 API（PromptRecord/PromptIteration/Template、SSE start/delta/meta/usage/error/done、幂等两层、LlmCall cachedHit）先落地；若 craft 时 Phase 1 未完成，先做 Phase 1。
