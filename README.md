# PromptPilot · 提示词工坊

[![CI](https://github.com/cnyet/prompt-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/cnyet/prompt-pilot/actions/workflows/ci.yml)

把一句话需求，变成结构完整、边界清晰、可直接投产的标准提示词，并且让用户看得见它为什么更好。

**当前状态：演示版已完成。** 19 张工单全部收口，493 条测试通过，端到端主流程在真实浏览器里跑通。真实 ARK 密钥下的行为尚未验证，其余缺口见 [HANDOVER.md](docs/HANDOVER.md)。

## 文档索引

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [PRODUCT.md](PRODUCT.md) | 产品定义：用户、四个真实缺口、主路径、12 组功能需求、12 项非功能指标、17 条验收标准、非目标、6 个可自动采集的指标 | 想确认"做什么、不做什么"时 |
| [DESIGN.md](DESIGN.md) | 设计系统与界面方案：烛光羊皮纸方向、双主题色彩令牌、中文排版、信息架构、五个页面规格、组件状态矩阵、12 条禁令 | 想确认"长什么样、怎么用"时 |
| [工作台样张](docs/design-preview/questui-workbench.html) | 可切换深浅主题的静态样张，截图在 `docs/assets/design-v2/` | 想直接看新方向时 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术方案：选型、目录结构、LLM 适配层、SSE 协议、Prompt 引擎五阶段、八字段 Schema、16 条诊断规则、文档状态模型、数据模型、API 契约 | 想确认"怎么实现"时 |
| [ROADMAP.md](docs/ROADMAP.md) | 实施计划：6 人日演示版加 M0 到 M7 共 24.5 人日、每步验收、环境前置条件、13 项风险与对策 | 想确认"先做什么、要多久"时 |
| [REVIEW.md](docs/REVIEW.md) | 双视角评审：7 个 P0 问题、10 个架构风险、优化策略优先级、排期修正依据 | 想知道"为什么这么改"时 |
| [EXECUTION.md](docs/EXECUTION.md) | 执行方案：四层技术结构、任务编排机制、多角色并行规则、本地插件与子 agent 的选择标准 | 想知道"怎么把它做出来"时 |
| [HANDOVER.md](docs/HANDOVER.md) | 交接说明：怎么跑、代码在哪、哪些约定不能碰、哪里还没做完、怎么排障 | **接手时先读这份** |

## 一句话看懂产品

```
一句话需求或已有提示词 → 自动判别模式 → 八字段结构化生成（不打断）
  → 自动试运行，真实输出优先展示
  → 假设 chip：点哪个改哪个，只重算受影响字段
  → 16 条本地诊断（模糊词/矛盾约束/缺边界，<50ms）→ 一键修复
  → 按需评估：对照成功标准逐条判定，与基线 v0 盲评胜率
  → 补丁式定向优化（diff 逐字段接受，不覆盖手改）
  → 版本化保存 → 导出成能直接用的代码格式
```

## 四个差异点（相对火山 PromptPilot）

1. **不打断的边界补齐**：不做阻塞式追问。先生成，再把模型替用户做的决定以假设 chip 暴露出来，事后点选纠正。边界仍然清晰，但用户不用先回答三个问题。
2. **补丁式优化加 diff 审阅**：优化不重写全文，产出最小改动补丁，逐字段接受或拒绝，且绝不覆盖用户手改过的字段。
3. **确定性诊断**：16 条规则纯本地执行，毫秒级反馈，零 token 成本。把"提示词质量"从玄学变成可核对清单。
4. **基线可证明**：用户的原始输入永久保存为 v0，任何评估都拿它当对照，给出胜率与改善项。不用做用研就能证明"变好了"。

## 十秒决策摘要

| 项 | 决定 |
|---|---|
| 形态 | Next.js 16 全栈单体，单机可跑，SQLite 落盘 |
| 模型 | 火山方舟（豆包）为默认，适配层可切任意 OpenAI 兼容端点；无 key 时走 L1 离线模板模式 |
| 主题 | 深色为主（烛光地下室），浅色羊皮纸日光同等可用 |
| 视觉 | 烛光羊皮纸。深棕分层、金色主操作、衬线标题、2-8px 圆角、克制的 active glow；无渐变、无玻璃拟态 |
| 核心资产 | 八字段 PromptPilot Schema v1，其中边界被拆成六个必须显式回答的问题 |
| 主路径耗时 | 一次模型调用，8 到 15 秒 |
| 单次成本 | 约 0.05 元；一个提示词迭代到满意约 0.2 元以内 |
| 工作量 | 6 人日出可演示版；完整版 24 到 30 人日 |
| 阻塞项 | 缺 `ARK_API_KEY`。不阻塞 M0 到 M3，L1 离线模式与 Mock 故障注入可以覆盖 |

## 环境要求

Node.js 24 与 pnpm 10（本机已具备）。首版运行时零外部依赖，除模型 API。

沙箱环境下 `~/.npm` 不可写，所以 `.npmrc` 把 store 与缓存放在工程内的 `.pnpm-store`、`.npm-cache`，两者已进 `.gitignore`。

## 启动

```bash
pnpm install
cp .env.example .env         # 可选。不填 ARK_API_KEY 即进入 L1 离线模板模式
pnpm db:generate
pnpm db:push
pnpm dev                     # http://localhost:3100
```

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器，端口 3100 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm typecheck` | 类型检查（零错误是合并门槛） |
| `pnpm test` | 全量测试（466 条） |
| `pnpm db:push` | 同步 schema 到本地 SQLite |
| `node scripts/e2e-http.mjs` | HTTP 端到端，自带服务与清理 |

## 接下来

优先级最高的三件事，细节见 [HANDOVER.md](docs/HANDOVER.md) 第 10 节：

1. 接真实 `ARK_API_KEY` 验一轮，重点看用量落库、`reasoning_content`、错误码映射
2. `PromptVersion` 的 token 与金额仍是 `@default(0)`，需要与其他模型统一为可空
3. 来源文案「补丁写入」是内部术语，需要一次文案统一

可以排期的功能：版本回滚与 diff 界面、库的标签与收藏、模型选择器与参数面板、导入已有提示词。
