# 交接说明

写给接手这个项目的人。读完应该能：把服务跑起来、知道代码在哪、知道哪些约定不能碰、知道现在做到哪、下一步做什么。

---

## 1. 一句话

PromptPilot 把一句话需求或一份已有提示词，变成可直接投产的 Markdown 提示词。只展示结果，不展示中间过程。

产品已重置为 v3「结果优先」范式（ADR-0007）。v3 数据层、API、工作台、提示词库、模板、设置与成本已全部上线（Batch A 到 H，Phase 1 到 5 完成）；Phase 6 已收口，v2 页面、API、引擎与测试已从仓库移除，十张 v2 旧表备份后删除。备份：`data/app.db.bak-20261114-2027`。

---

## 2. 当前状态

### v3 文档基线（Phase 0 已完成）

- `PRODUCT.md` v3、`DESIGN.md` v3、`docs/ROADMAP-V3.md`、`.impeccable/design.json` 四件套为事实源。
- `CONTEXT.md` 词表、`docs/ARCHITECTURE.md` v3 契约、本文件、`README.md`、ADR-0007 已收口；v2 的 `docs/ROADMAP.md` 已删除。
- 分支 `main`；开发库备份 `data/app.db.bak-20261113-1047`，Phase 6 删表前备份 `data/app.db.bak-20261114-2027`。
- 网关端点规范化与测试库隔离已收口（`fc00f4c`）：默认端点 `https://opencode.ai/inference/go/openai/v1`，测试用独立 `data/test.db`。

### v3 数据层与 API（Batch A 到 D 已完成）

- **Batch A**：`PromptRecord` / `PromptIteration` / `Template` 三个模型与 `LlmCall` 关联列；设置新增优化模型与月度预算键。
- **Batch B**：MetaSplitter 元数据切分、SSE v3 协议（start / delta / meta / usage / error / done）与 requestId 幂等 LRU。
- **Batch C**：`/api/generate`、`/api/records/[id]/optimize`、`/api/records/[id]/repair` 三条 SSE 路由，完成自动入库。
- **Batch D**：`/api/records`、`/api/records/[id]`、`/api/templates`、`/api/templates/[id]`、`/api/stats` 五组 JSON 接口与契约（见 `docs/ARCHITECTURE.md` 第四节）；`prisma/seed.ts` 按 slug 幂等写入 12 条内置模板；成本统计按上海时区切月并给出预算使用率；继续优化与修复补上空源守卫（409 `RECORD_HAS_NO_OUTPUT`）与重放元数据收敛。

### v3 UI 与设置（Batch E 到 H 已完成）

- **Batch E**：studio-v3 工作台替换 `/studio`。i18n `lib/i18n/zh.ts`、Markdown 渲染与源码视图、diff、R101-R108 本地检查、流式 reducer、继续优化 / 修复、收藏与 1 到 5 星评分、四项导航与移动底栏。
- **Batch F**：提示词库 v3 UI。搜索防抖、筛选、分页、行内收藏 / 评分 / 重命名、详情抽屉、迭代时间线、任意两轮对比。
- **Batch G**：模板页 v3。三分类与风格筛选、12 个内置模板、三套程序化 SVG 封面、「用它开始」预填、自定义模板创建与删除。
- **Batch H**：设置与成本。生成 / 优化双模型槽与每角色 temperature / maxTokens（默认 0.7 / 8192，优化未设置时继承生成）；`/api/settings` 同时读写模型、参数与月度预算；连通性测试覆盖 generate / optimize；成本页改用 `getV3Stats`，四个 KPI、14 天趋势、按阶段与按模型两张表；预算 80% 提示、100% 强提示但不阻断。
- 2026-11-14 Phase 6 实测：typecheck 零错误；59 个文件 / 537 条测试通过；clean build 成功；`pnpm e2e` 通过；harness 25 项全过。

### Phase 6 代码清理（已完成）

- v2 八字段编辑器、单字段重算、假设 chip、试运行、版本库与 `/eval` 页面已删除。
- 旧引擎 API（`/api/engine/*`、`/api/prompts/*`、`/api/run/*`、`/api/eval/*`）与 `lib/eval`、v2 引擎模块、`lib/llm/streaming-json.ts` 已删除。
- 设置契约不再包含 `modelEvaluate`；模型角色只有 `generate` 与 `optimize`。
- 十张 v2 旧表已在备份 `data/app.db.bak-20261114-2027` 后删除；当前库只保留 `AppSetting`、`LlmCall`、`PromptRecord`、`PromptIteration`、`Template` 五张表，`LlmCall` 的历史关联列与索引保留。

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

不填 `ARK_API_KEY` 时 v3 的生成与优化禁用，界面就地说明原因并给出设置入口（FR-8.7）；库、模板、复制与导出仍可用。

### 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务，3100 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm test` | 全量测试。独立测试库 `data/test.db`（`tests/global-setup.ts` 建库、`tests/setup-env.ts` 隔离），不碰开发库，跑测试不用停 3100 |
| `pnpm typecheck` | 类型检查 |
| `pnpm db:push` / `pnpm db:studio` | 同步 schema / 图形化看数据 |
| `pnpm db:seed` | 写入或恢复 12 条内置模板（按 slug 幂等，可重复执行；需 Node >= 24） |
| `pnpm e2e` | HTTP 端到端，自带服务与清理，使用隔离的 `data/e2e.db` |
| `pnpm check:contrast` | 双主题对比度校验 |

### 环境变量

设置页可覆盖以下项，优先级 **设置页 > 环境变量 > 代码默认值**。密钥只存本机 SQLite，接口只回末四位；「清除全部覆盖」回落到环境变量。`ARK_BASE_URL` 保存时自动规范化（旧版网关地址补 `/openai/v1`）。

| 变量 | 说明 |
|---|---|
| `ARK_API_KEY` | 留空时 v3 模型操作禁用并说明原因；也可在设置页保存，优先级高于环境变量 |
| `ARK_BASE_URL` | 默认 `https://opencode.ai/inference/go/openai/v1` |
| `ARK_MODEL_GENERATE` | 生成模型 ID（不能用展示名）；也用于优化模型未单独配置时的继承 |
| `ARK_MODEL_OPTIMIZE` | 优化模型 ID（v3 generate / optimize 双角色）；留空时复用生成模型 |
| `DATABASE_URL` | `file:../data/app.db`，路径相对 schema 目录解析 |

### 故障注入

`MOCK_LLM_FAULT=valid|network|rate_limited|quota_exceeded|truncated|bad_json|fenced_json|slow_stream` 可在无密钥时模拟上游行为，验证错误态与兜底链。

---

## 4. 代码地图（v3）

```
app/
  (workspace)/studio/      v3 工作台（生成 / 优化 / 继续优化 / 修复）
  (workspace)/library/     v3 提示词库（列表 + 详情抽屉）
  (workspace)/templates/   v3 模板页
  (workspace)/settings/    v3 设置（模型 / 成本 / 预算）
  api/generate/            v3 生成与优化首轮（SSE）
  api/records/             v3 记录 CRUD、继续优化、修复
  api/templates/           v3 模板 CRUD
  api/settings/            模型、参数与预算；settings/test 连通性
  api/stats/               v3 成本聚合（generate / optimize / repair）
components/
  shell/                   侧栏、顶栏、主题、模型状态徽标
  studio-v3/               v3 工作台、流式状态、结果面、检查面板
  library-v3/              v3 记录行与详情抽屉
  templates-v3/            v3 模板卡与程序化封面
  settings/                设置表单、成本趋势与分桶表、预算编辑
lib/
  llm/                     types（冻结）/ registry / openai-compat / mock / ledger / stats-v3 / structured
  settings/                设置读取、参数继承与保存
  engine/
    check.ts               v3 本地检查 R101-R108
    diff.ts / sse-v3.ts / stream-v3.ts   v3 diff 与流式协议
    prompts/               生成、优化、修复的系统提示词与元数据解析
    idempotency.ts         requestId 幂等
  db/                      Prisma 客户端、记录与模板写路径
  budget.ts                预算阈值与百分比展示（客户端安全）
tests/                     global-setup.ts 建测试库；unit + integration
scripts/e2e-http.mjs       HTTP 端到端（v3，隔离 data/e2e.db）
```

v3 目标目录结构与新增模块见 [ARCHITECTURE.md](ARCHITECTURE.md) 第二节。

### 术语约定

v3 词表在 `CONTEXT.md`：**记录、迭代、生成、优化、继续优化、对比原文、检查（R101-R108）、收藏、评分、模板**。v2 的「字段、版本、试运行、评估、假设 chip」在界面与文档中禁用，代码已在 Phase 6 清理。

界面文案中文，禁止感叹号、禁止 em dash、禁止 emoji；未知值显示「—」不写 0；未评分显示「未评分」。

---

## 5. 数据模型

现状 Prisma + SQLite。v3 业务模型：**PromptRecord / PromptIteration / Template**（契约见 ARCHITECTURE.md 第三节），加上 `LlmCall` 调用账本与 `AppSetting` 设置键。十张 v2 旧表（`Prompt` / `PromptVersion` / `Run` / `EvalTask` 等）已无代码引用，已在备份 `data/app.db.bak-20261114-2027` 后删除；当前库只有上述五张表。

---

## 6. 不能破坏的约定

**1. 未知不是 0。** 用量字段一律可空。`null` 是不知道，`0` 是确实是 0。未评分显示「未评分」，未设置预算显示「未设置」。v3 全程延续。

**2. 密钥安全。** 密钥只存本机 SQLite 或环境变量，接口只回末四位，客户端产物零密钥字符串（构建期扫描）。任何改动不得引入第三方分析脚本或远程日志。

**3. 迁移只增不删。** 无 `prisma/migrations/`，用 `db push`；Phase 6 删表前已备份。今后破坏性 schema 变更仍需先备份并确认。

**4. 冻结契约。** `lib/llm/types.ts` 冻结；`lib/engine/schema.ts` 已在 Phase 6 删除。改 `package.json`、`prisma/schema.prisma` 需先确认。

**5. v3 流式约定。** 中断保留已生成内容并标记「已中断」；失败轮不写入含半成品正文的迭代；修复追加新迭代，不覆盖历史。

---

## 7. 测试与验收

- 基线以实测为准：2026-11-14 Phase 6 实测 537 条（59 文件），typecheck 零错误。
- 集成测试共用独立 `data/test.db`，文件串行执行（共享同一 SQLite）。
- 测试基线数在 v3 中会先增（Phase 1 新测试）后减（Phase 6 删旧测试），不追求数量，以 ROADMAP-V3 各阶段验收为准。
- 视觉：改样式先看 `components/ui/` 与 `DESIGN.md`；改令牌跑 `pnpm check:contrast`；改 DESIGN.md 跑 design-parser。
- 验收一律以 clean build 为准：`rm -rf .next && pnpm build`。

---

## 8. 下一步（按 docs/ROADMAP-V3.md）

1. **接真实 ARK 密钥验证（下一步）**：流式 usage 落库、`reasoning_content` 不混正文、限流与额度错误码映射。
2. Phase 1 到 6 已完成（数据层、API、工作台、库、模板、设置与成本、旧模块与旧表清理）；本地 AC 回归与 `pnpm e2e` 通过。

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
