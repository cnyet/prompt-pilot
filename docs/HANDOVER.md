# 交接说明

写给接手这个项目的人。读完应该能：把服务跑起来、知道代码在哪、知道哪些约定不能碰、知道现在做到哪、下一步做什么。

---

## 1. 一句话

PromptPilot 把一句话需求或一份已有提示词，变成可直接投产的 Markdown 提示词。只展示结果，不展示中间过程。

产品已重置为 v3「结果优先」范式（ADR-0007）。**文档已收口到 v3，代码仍运行 v2 范式**，v2 的八字段编辑器、假设 chip、试运行、评估页面仍然可用；v3 按 [docs/ROADMAP-V3.md](ROADMAP-V3.md) 七阶段重写，Phase 1 数据层与 API 已由 Batch A 到 D 收口，下一步是 Batch E 工作台 UI。

---

## 2. 当前状态

### v3 文档基线（Phase 0 已完成）

- `PRODUCT.md` v3、`DESIGN.md` v3、`docs/ROADMAP-V3.md`、`.impeccable/design.json` 四件套为事实源。
- `CONTEXT.md` 词表、`docs/ARCHITECTURE.md` v3 契约、本文件、`README.md`、ADR-0007 已收口；v2 的 `docs/ROADMAP.md` 已删除。
- 分支 `feat/v3-result-first`；开发库备份 `data/app.db.bak-20261113-1047`。
- 网关端点规范化与测试库隔离已收口（`fc00f4c`）：默认端点 `https://opencode.ai/inference/go/openai/v1`，测试用独立 `data/test.db`。

### v3 数据层与 API（Batch A 到 D 已完成）

- **Batch A**：`PromptRecord` / `PromptIteration` / `Template` 三个模型与 `LlmCall` 关联列；设置新增优化模型与月度预算键。
- **Batch B**：MetaSplitter 元数据切分、SSE v3 协议（start / delta / meta / usage / error / done）与 requestId 幂等 LRU。
- **Batch C**：`/api/generate`、`/api/records/[id]/optimize`、`/api/records/[id]/repair` 三条 SSE 路由，完成自动入库。
- **Batch D**：`/api/records`、`/api/records/[id]`、`/api/templates`、`/api/templates/[id]`、`/api/stats` 五组 JSON 接口与契约（见 `docs/ARCHITECTURE.md` 第四节）；`prisma/seed.ts` 按 slug 幂等写入 12 条内置模板；成本统计按上海时区切月并给出预算使用率；继续优化与修复补上空源守卫（409 `RECORD_HAS_NO_OUTPUT`）与重放元数据收敛。

### v2 代码仍在运行（已验证可用）

- 输入一句话，流式生成八字段结构化提示词（离线启发式或真模型）
- 字段级编辑、AI 单字段重算、假设 chip、16 条诊断 + 一键修复
- 试运行、版本库（v0 服务端不可改删）、成本账本、设置页模型配置与连通性测试
- 512 条测试通过（41 个文件），typecheck 零错误

### 未验证

真实 ARK 密钥下的端到端行为一次都没跑过。接上密钥后优先验证：流式 usage 落库、`reasoning_content` 不混正文、限流与额度错误码映射。

---

## 3. 快速上手

### 环境

Node >= 24、pnpm 10、SQLite（无需单独安装）。`prisma/seed.ts` 由 Node 原生类型擦除直接执行，`pnpm db:seed` 需要 Node >= 24。

### 第一次运行

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed        # 写入 12 条内置模板，按 slug 幂等，可重复执行
pnpm dev            # http://localhost:3100
```

不填 `ARK_API_KEY` 也能跑通流程（离线模板模式，界面有明确标识）；v3 交付后无密钥时模型操作禁用并说明原因（FR-8.7）。

### 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务，3100 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm test` | 全量测试。独立测试库 `data/test.db`（`tests/global-setup.ts` 建库、`tests/setup-env.ts` 隔离），不碰开发库，跑测试不用停 3100 |
| `pnpm typecheck` | 类型检查 |
| `pnpm db:push` / `pnpm db:studio` | 同步 schema / 图形化看数据 |
| `pnpm db:seed` | 写入或恢复 12 条内置模板（按 slug 幂等，可重复执行；需 Node >= 24） |
| `node scripts/e2e-http.mjs` | HTTP 端到端，自带服务与清理 |
| `pnpm check:contrast` | 双主题对比度校验 |

### 环境变量

设置页可覆盖以下项，优先级 **设置页 > 环境变量 > 代码默认值**。密钥只存本机 SQLite，接口只回末四位；「清除全部覆盖」回落到环境变量。`ARK_BASE_URL` 保存时自动规范化（旧版网关地址补 `/openai/v1`）。

| 变量 | 说明 |
|---|---|
| `ARK_API_KEY` | 留空进入离线模板模式（v2）/ 模型操作禁用（v3 交付后） |
| `ARK_BASE_URL` | 默认 `https://opencode.ai/inference/go/openai/v1` |
| `ARK_MODEL_GENERATE` | 生成模型 ID（不能用展示名） |
| `ARK_MODEL_EVALUATE` | v2 评估模型；v3 改名为优化模型（generate / optimize），Phase 5 落地 |
| `DATABASE_URL` | `file:../data/app.db`，路径相对 schema 目录解析 |

### 故障注入

`MOCK_LLM_FAULT=valid|network|rate_limited|quota_exceeded|truncated|bad_json|fenced_json|slow_stream` 可在无密钥时模拟上游行为，验证错误态与兜底链。

---

## 4. 代码地图（现状为 v2，Phase 1 起替换）

```
app/
  (workspace)/          工作台、库、评估、模板、设置（共享 AppShell 布局）
  api/engine/generate/  流式生成（SSE，v3 改为 /api/generate Markdown 文本流）
  api/engine/field/     单字段重算（v3 删）
  api/run/              试运行（v3 删）
  api/prompts/          提示词与版本 CRUD（v3 改为 /api/records）
  api/stats/            成本与调用统计（保留）
components/
  shell/AppShell.tsx    侧栏、顶栏、主题、模型状态徽标（保留）
  studio/               v2 工作台约 20 个文件（v3 全量重写）
  library/              v2 提示词库（v3 重写为记录行 + 详情抽屉）
lib/
  llm/                  types（冻结）/ registry / ark / openai-compat / mock / ledger
  engine/
    schema.ts           八字段契约（冻结至 Phase 1 新模型落地，Phase 6 删）
    compose.ts 等       v2 引擎五阶段（intent/interview/compose/harden/evaluate/refine）
    lint/               R001-R016（v3 迁移为 R101-R108 自由文本规则）
    doc.ts / paths.ts / assumptions.ts / render.ts / export.ts / variables.ts（v3 删）
    sse.ts              SSE 写出工具（保留改造）
  db/                   Prisma 客户端、提示词、运行记录
tests/                  global-setup.ts 建测试库；unit + integration
scripts/e2e-http.mjs    HTTP 端到端
```

v3 目标目录结构与新增模块见 [ARCHITECTURE.md](ARCHITECTURE.md) 第二节。

### 术语约定

v3 词表在 `CONTEXT.md`：**记录、迭代、生成、优化、继续优化、对比原文、检查（R101-R108）、收藏、评分、模板**。v2 的「字段、版本、试运行、评估、假设 chip」在界面与文档中禁用，代码残留至 Phase 6。

界面文案中文，禁止感叹号、禁止 em dash、禁止 emoji；未知值显示「—」不写 0；未评分显示「未评分」。

---

## 5. 数据模型

现状 Prisma + SQLite，12 个模型。v2 核心四个：

- `Prompt`：一条提示词；`PromptVersion`：版本，`versionNo = 0` 为基线 v0（服务端 409 保护）
- `Run`：一次试运行；`LlmCall`：一次模型调用，用量字段全部可空

v3 目标模型：**PromptRecord / PromptIteration / Template**（契约见 ARCHITECTURE.md 第三节），Phase 1 落地，只增不删；旧表保留可读到 Phase 6，删表前再备份。

---

## 6. 不能破坏的约定

**1. 未知不是 0。** 用量字段一律可空。`null` 是不知道，`0` 是确实是 0。未评分显示「未评分」，未设置预算显示「未设置」。v3 全程延续。

**2. 密钥安全。** 密钥只存本机 SQLite 或环境变量，接口只回末四位，客户端产物零密钥字符串（构建期扫描）。任何改动不得引入第三方分析脚本或远程日志。

**3. 迁移只增不删。** 无 `prisma/migrations/`，用 `db push`；Phase 6 删表前再备份。

**4. 冻结契约。** `lib/llm/types.ts` 冻结；`lib/engine/schema.ts` 冻结至 Phase 1 新模型落地。改 `package.json`、`prisma/schema.prisma` 需先确认。

**5. v2 运行期约定（Phase 6 前有效）。** 流式只写 pending、修复写入不置脏（`origin: 'patch'`）、覆盖式补丁保留 dirty、v0 服务端不可改删。这些服务于八字段编辑器，v3 重写后随之退役，但在 v2 代码存活期间不得破坏。

---

## 7. 测试与验收

- 基线以实测为准：2026-11-13 实测 512 条（41 文件），typecheck 零错误。
- 集成测试共用独立 `data/test.db`，文件串行执行（共享同一 SQLite）。
- 测试基线数在 v3 中会先增（Phase 1 新测试）后减（Phase 6 删旧测试），不追求数量，以 ROADMAP-V3 各阶段验收为准。
- 视觉：改样式先看 `components/ui/` 与 `DESIGN.md`；改令牌跑 `pnpm check:contrast`；改 DESIGN.md 跑 design-parser。
- 验收一律以 clean build 为准：`rm -rf .next && pnpm build`。

---

## 8. 下一步（按 docs/ROADMAP-V3.md）

1. **Batch E：studio-v3 工作台 UI（下一步，对应 Phase 2）**：i18n `lib/i18n/zh.ts`、diff、R101-R108、`components/studio-v3/*`、Rating、替换 `/studio`、主题切换移到顶栏。验收 AC-1 到 AC-7、AC-19、AC-20。
2. Phase 3 库 → Phase 4 模板 → Phase 5 设置与成本 → Phase 6 移除旧模块与收口。Phase 1 数据层与 API 已由 Batch A 到 D 完成。

约束：每个 Phase 独立提交；动 UI 先读 `DESIGN.md`；产品行为以 `PRODUCT.md` 为准。

---

## 9. 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| `pnpm install` 报 EPERM | 沙箱把 `~/.npm` 设为不可写 | `.npmrc` 已把 store 与 cache 放工程内，不要改回全局 |
| Prisma 找不到数据库 | SQLite 相对路径按 schema 目录解析 | `DATABASE_URL="file:../data/app.db"`；Prisma CLI 只读 `.env` 不读 `.env.local` |
| 测试失败提示密钥或网络 | 测试环境变量未隔离 | `tests/setup-env.ts` 会清 `ARK_API_KEY`，确认 vitest 配置未被绕过 |
| 测试动到了开发库 | 不应发生 | 测试必须走 `data/test.db`；如发生立即停手检查 global-setup 是否生效 |
| 1440 布局塌成单栏 | dev 增量缓存缺 `xl` 变体 | `rm -rf .next` 重新构建 |
| 端口被占 | 同一目录起了两个 dev server | `lsof -ti tcp:3100 \| xargs kill -9` |
| 构建时 Prisma 报 relation 缺失 | schema 改了但没 generate | `pnpm db:generate` |
| 网关 404 | `ARK_BASE_URL` 缺 `/openai/v1` | 保存设置会自动规范化；环境变量写错时用 `normalizeArkBaseUrl` 兜底 |

---

## 10. 文档索引

| 文件 | 内容 |
|---|---|
| `PRODUCT.md` | v3 产品定义、FR / NFR / AC、成功指标 |
| `DESIGN.md` | v3 设计系统、组件规格、禁令 |
| `CONTEXT.md` | v3 领域词表与废弃词 |
| `docs/ROADMAP-V3.md` | 七阶段计划、数据模型、SSE 协议、测试计划 |
| `docs/ARCHITECTURE.md` | v3 技术契约 |
| `docs/adr/` | 0001-0007；0007 是结果优先重置 |
| `.agent/memory/` | 会话状态（ACTIVE_CONTEXT / session-summary / todo-tracker） |
