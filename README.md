# PromptPilot · 提示词工坊

[![CI](https://github.com/cnyet/prompt-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/cnyet/prompt-pilot/actions/workflows/ci.yml)

把一句话需求或一份已有提示词，变成可直接投产的 Markdown 提示词。只展示结果，不展示中间过程。

**当前状态：v3「结果优先」重置进行中。** 数据与 API 层已是 v3（Batch A 到 D），工作台 UI 仍运行 v2 流程，下一步 Batch E 重写工作台。进度见 [docs/ROADMAP-V3.md](docs/ROADMAP-V3.md)。639 条测试通过。

## 文档索引

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [PRODUCT.md](PRODUCT.md) | 产品定义：用户、四个缺口、生成与优化两条主路径、FR-1 到 FR-11、AC-1 到 AC-20、成功指标 | 想确认"做什么、不做什么"时 |
| [DESIGN.md](DESIGN.md) | 设计系统：烛光羊皮纸材质、双主题令牌、工作台结果面、评分、库行、模板卡等组件规格 | 想确认"长什么样、怎么用"时 |
| [docs/ROADMAP-V3.md](docs/ROADMAP-V3.md) | v3 实施计划：Phase 0 到 6 共 16 人日、数据模型、SSE 协议、每阶段验收 | 想确认"先做什么、做到哪了"时 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术方案：v3 数据模型、API、SSE 与元数据协议、diff、检查规则 | 想确认"怎么实现"时 |
| [docs/adr/](docs/adr/) | 架构决策记录；0007 是本次结果优先重置 | 想知道"为什么这么定"时 |
| [CONTEXT.md](CONTEXT.md) | 领域词表与废弃词 | 拿不准术语时 |
| [HANDOVER.md](docs/HANDOVER.md) | 交接说明：怎么跑、代码在哪、哪些约定不能碰、哪里还没做完 | **接手时先读这份** |

## 两条主路径

```
生成：一句话需求（可选目标类型：文本 / 图片 / 视频）
      → 流式输出 Markdown 提示词 → 按需检查 / 继续优化 → 自动入库 → 复制 / 下载

优化：粘贴已有提示词（可选优化要求）
      → 流式输出优化版 → 对比原文看 diff 与最多 3 条改动说明 → 继续迭代 → 自动入库
```

## 十秒决策摘要

| 项 | 决定 |
|---|---|
| 形态 | Next.js App Router + React 19 + TypeScript 全栈单体，单机可跑，SQLite 落盘 |
| 模型 | 火山方舟为默认，OpenAI 兼容适配层可切任意端点；无 key 时界面禁用模型操作并说明原因 |
| 范式 | v3 结果优先：输出 Markdown 正文 + diff + 最多 3 条改动说明，不做结构化字段与评估 |
| 数据 | PromptRecord / PromptIteration / Template；完成自动入库，收藏与评分为事后动作 |
| 导航 | 工作台、提示词库、模板、设置，共 4 项 |
| 隐私 | 数据与密钥只存本机 SQLite，界面不显示密钥明文 |

## 环境要求

Node.js >= 24 与 pnpm 10（本机已具备）。`prisma/seed.ts` 由 Node 原生类型擦除直接执行，seed 命令需要 Node >= 24。首版运行时零外部依赖，除模型 API。

沙箱环境下 `~/.npm` 不可写，所以 `.npmrc` 把 store 与缓存放在工程内的 `.pnpm-store`、`.npm-cache`，两者已进 `.gitignore`。

## 启动

```bash
pnpm install
cp .env.example .env         # 可选。不填 ARK_API_KEY 时模型操作禁用，浏览与导出仍可用
pnpm db:generate
pnpm db:push
pnpm db:seed                 # 写入 12 条内置模板，按 slug 幂等，可重复执行
pnpm dev                     # http://localhost:3100
```

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器，端口 3100 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm typecheck` | 类型检查（零错误是合并门槛） |
| `pnpm test` | 全量测试（独立测试库 `data/test.db`，不碰开发库） |
| `pnpm db:push` | 同步 schema 到本地 SQLite |
| `pnpm db:seed` | 写入或恢复 12 条内置模板（按 slug 幂等，可重复执行；需 Node >= 24） |
| `node scripts/e2e-http.mjs` | HTTP 端到端，自带服务与清理 |

## 接下来

按顺序推进，细节见 [docs/ROADMAP-V3.md](docs/ROADMAP-V3.md) 与 [docs/HANDOVER.md](docs/HANDOVER.md)：

1. Batch E：工作台 UI 重写（双模式、结果面、diff、继续优化，对应 Phase 2）
2. Phase 3 与 Phase 4：提示词库与模板 UI
3. Phase 5 与 Phase 6：设置与成本 UI，移除 v2 模块与收口
