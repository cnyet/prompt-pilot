# PromptPilot v3 开发计划

> 取代 `docs/ROADMAP.md`（v2 八字段范式）。产品范围以 `PRODUCT.md` 为准，本文回答先做什么、怎么做、怎么验收。
>
> 基线：2026-11-13，分支 `feat/v3-result-first`。遗留改动（网关端点规范化与测试库隔离）已收口为独立提交 `fc00f4c`；开发库已备份 `data/app.db.bak-20261113-1047`。

## 1. 范围与结论

### 1.1 保留

- 外壳与主题：`components/shell/AppShell.tsx`、左轨/顶栏、双主题令牌、对比度脚本、UI 基础组件。
- 模型层：`lib/llm/*` 适配器、`registry`、`ledger`、`mock` 故障注入。
- 设置与成本：设置存储、密钥末四位、连通性测试、`/api/stats` 的账本聚合。
- 页面骨架：提示词库、模板、设置三页的外壳与布局。
- 测试与 CI：vitest、集成测试模式、CI 顺序。

### 1.2 重写

- 工作台：从八字段编辑器改为双模式 Markdown 结果页。
- 生成 API：从结构化 JSON 流改为 Markdown 文本流加末尾元数据。
- 提示词库：从 `Prompt` / `PromptVersion` 改为 `PromptRecord` / `PromptIteration`。
- 模板：从场景模板改为文本、图片、视频三类内容模板。
- 设置：模型角色从 generate / evaluate 改为 generate / optimize；成本页增加预算。

### 1.3 移除

- `/eval` 页面、`/api/eval`、评估组件与判定逻辑。
- 字段编辑器、假设 chip、结构化 JSON 视图、变量区、试运行、版本时间线。
- `lib/engine/schema.ts` 的界面依赖、`doc.ts`、`paths.ts`、`assumptions.ts`、结构化 `render.ts`、多格式 `export.ts`。
- 导航中的「评估」。

### 1.4 新增

- `PromptRecord` / `PromptIteration` / `Template` 数据模型。
- Markdown 渲染与源码切换、复制、下载。
- 优化前后 diff、最多 3 条改动说明、继续优化、按需检查。
- 收藏、1 到 5 星评分、搜索筛选。
- 自定义模板、程序化封面。
- 月度预算与 80% / 100% 阈值提示。

### 1.5 工作量

| 阶段 | 内容 | 人日 | 依赖 |
|---|---|---|---|
| Phase 0 | 文档与基线 | 1 | 无 |
| Phase 1 | 数据层与 API | 3 | Phase 0 |
| Phase 2 | 工作台重写 | 4 | Phase 1 |
| Phase 3 | 提示词库 | 2 | Phase 2 |
| Phase 4 | 模板 | 2 | Phase 2 |
| Phase 5 | 设置与成本 | 2 | Phase 1 |
| Phase 6 | 移除旧模块与收口 | 2 | Phase 2 到 5 |
| 合计 | | 16 | |

## 2. 技术方案

### 2.1 数据模型

新增三个模型。旧模型在 Phase 6 前保留，避免不可逆迁移。

```prisma
model PromptRecord {
  id             String   @id @default(cuid())
  title          String
  mode           String   // generate | optimize
  targetType     String   @default("text") // text | image | video
  sourceInput    String   // 生成需求或原始提示词
  latestOutput   String   @default("")
  status         String   @default("running") // running | completed | canceled | failed
  favorite       Boolean  @default(false)
  rating         Int?     // 1..5，未评分为 null
  modelId        String?
  iterationCount Int      @default(0)
  tokensIn       Int?
  tokensOut      Int?
  costCny        Float?
  copiedAt       DateTime? // 最近一次复制时间；一次通过率埋点
  originTemplateId String? // 从模板「用它开始」进入时写入；模板使用率埋点
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  iterations     PromptIteration[]

  @@index([status, updatedAt])
  @@index([favorite, updatedAt])
  @@index([mode, updatedAt])
}

model PromptIteration {
  id          String   @id @default(cuid())
  recordId    String
  seq         Int
  kind        String   // generate | optimize | repair
  instruction String?
  output      String   @default("")
  notesJson   String   @default("[]")
  modelId     String?
  tokensIn    Int?
  tokensOut   Int?
  costCny     Float?
  latencyMs   Int?
  status      String   @default("running")
  requestId   String?  @unique
  createdAt   DateTime @default(now())
  record      PromptRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  @@unique([recordId, seq])
  @@index([recordId, createdAt])
}

model Template {
  id           String   @id @default(cuid())
  slug         String?  @unique
  category     String   // text | image | video
  style        String
  title        String
  description  String
  body         String
  mode         String   @default("optimize") // generate | optimize
  exampleInput String?
  coverKind    String   @default("programmatic")
  featured     Boolean  @default(false)
  builtin      Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([category, style])
}
```

配套改动：

- `ModelConfig.role` 取值改为 `generate | optimize`；旧的 evaluate / judge 行保留但停用。
- `AppSetting` 增加 `budget.monthlyCny`，未设置为空字符串。
- `LlmCall.stage` 增加 `optimize`，继续保留 `compose` 等历史值；补 `cachedHit`（Boolean?，未知为 null），对应 FR-9.1「是否命中缓存」。
- 删除记录时置空该记录迭代关联的 `LlmCall` 外键（账本保留匿名用量，不级联删除）。
- 用量与费用继续遵守「未知为 null，不写 0」。

### 2.2 API 与 SSE 协议

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/generate` | POST | 生成或优化首轮，SSE，完成后落库 |
| `/api/records/[id]/optimize` | POST | 继续优化，追加迭代，SSE |
| `/api/records/[id]/repair` | POST | 按检查结果修复，追加迭代，SSE |
| `/api/records` | GET | 列表、搜索、筛选、分页 |
| `/api/records/[id]` | GET / PATCH / DELETE | 详情、改标题/收藏/评分、删除 |
| `/api/templates` | GET / POST | 列表、创建自定义模板 |
| `/api/templates/[id]` | DELETE | 删除自定义模板，内置模板返回 409 |
| `/api/settings` | GET / PUT | 模型与预算配置 |
| `/api/settings/test` | POST | 连通性测试，15 秒超时 |
| `/api/stats` | GET | 成本、用量、预算聚合 |

SSE 事件：

```
start  { recordId, iterationId }
delta  { text }
meta   { title, notes: string[] }
usage  { tokensIn, tokensOut, costCny, latencyMs }
error  { code, message, retryable }
done   { recordId, iterationId, status: completed | canceled | failed }
```

元数据协议：系统提示词要求模型先输出完整 Markdown 正文，正文结束后另起一行输出 `<<<PROMPTPILOT_META>>>`，再输出 `{"title":"...","notes":["...","..."]}`。服务端边流边切分，分隔符前的内容实时下发，分隔符后的内容缓冲并在结束时解析。解析失败时标题取输入前 24 字，说明为空，正文不受影响。

幂等分两层：记录层——`/api/generate` 首轮用客户端 `requestId` 做内存 LRU 去重，in-flight 与 5 分钟内结果命中即复用，双击只产生一条记录（AC-19）；迭代层——`PromptIteration.requestId` 唯一约束兜底，继续优化与修复同样适用。

### 2.3 Markdown 渲染

- 新增依赖 `react-markdown` 与 `remark-gfm`，仅用于结果渲染；不引入图标库、动效库、状态库。
- 默认渲染视图，可切换源码视图；复制始终取源码。
- 不渲染原始 HTML，链接补 `rel="noreferrer noopener"`，图片限制最大宽度。
- 代码块用 `--font-mono`，表格允许横向滚动。

### 2.4 diff

- 行级 LCS 比较原文与优化结果；新增、删除、修改逐行标记。
- 修改行再做字符级比较，中文按字符切分，避免分词依赖。
- 两种视图：并排与行内；默认行内。
- 性能上限：超过 20k 字符时退化为行级，不阻塞界面。

### 2.5 本地检查

- 复用 `lib/engine/lint` 的规则框架，规则改为面向自由文本，返回 Markdown 文本偏移。
- 8 条规则：R101 模糊词、R102 矛盾约束、R103 缺输出格式、R104 缺角色或上下文、R105 缺边界与信息不足行为、R106 提示词注入风险、R107 重复要求、R108 长度异常。
- 按需触发，不实时刷新，不写入正文，不进入导出。
- 一键修复复用优化模型，生成新迭代；修复不覆盖历史。

### 2.6 模板与封面

- 内置 12 条模板，三类各 4 条，`slug` 幂等 upsert：
  - 文本（四条各占一风格）：周报助手（公文）、小红书种草（营销）、数据分析结论（分析）、代码评审助手（代码）。
  - 图片：电影感人像、电商产品主图、3D 等距插画、极简海报。
  - 视频：15 秒产品广告、分镜脚本、运镜描述、叙事短片。
- 封面为程序化 SVG 或 CSS 构图，三种视觉语言分别对应文本、图片、视频，不依赖外部图片服务，不使用渐变。
- 生成型模板预填示例需求；优化型模板预填模板正文。进入工作台时按 `mode` 选中对应模式。

### 2.7 安全与隐私

- 密钥只存服务端 SQLite，接口只回末四位。
- 系统提示词与用户输入严格分隔；用户输入作为数据包裹，不拼接为指令。
- 导出排除系统提示词、密钥、内部元数据与检查结果。
- 日志不打印提示词正文与密钥。

### 2.8 迁移策略

- Phase 0 备份数据库：`cp data/app.db data/app.db.bak-$(date +%Y%m%d-%H%M)`。
- Phase 1 只增不删：新增三张表与设置键，旧表保持可读。
- Phase 6 验证新链路稳定后再删除旧表；删除前再备份一次。
- 无 `prisma/migrations/`，继续用 `pnpm exec prisma db push` 与 `pnpm exec prisma generate`。

## 3. 阶段计划

### Phase 0 文档与基线（1 人日）

- V3-01 收口当前未提交改动（已完成：`fc00f4c`，typecheck 与 512 条测试通过；开发库已备份）。
- V3-02 文档：PRODUCT.md v3（已完成）、DESIGN.md v3 增量（已完成）、CONTEXT.md 词表、ARCHITECTURE.md 契约、HANDOVER.md、README 索引、ADR-0007（结果优先重置）。
- V3-03 建立分支 `feat/v3-result-first`（已完成），每阶段独立提交。

验收：文档之间不矛盾；`node ~/.claude/scripts/claude-project-harness-check.mjs .` 通过。

### Phase 1 数据层与 API（3 人日）

- V3-10 Prisma 模型与设置键。
- V3-11 `db push`、`generate`、12 条模板 seed。
- V3-12 `lib/engine/prompts/`：生成、优化、修复提示词与元数据解析。
- V3-13 SSE 路由：`/api/generate`、`/api/records/[id]/optimize`、`/api/records/[id]/repair`。
- V3-14 记录 API：列表、详情、收藏、评分（仅完成或已中断记录）、重命名、删除（置空 LlmCall 关联）。
- V3-15 模板 API：列表、创建、删除。
- V3-16 统计 API：本月聚合、14 天趋势、预算使用率。
- V3-17 测试：元数据解析、SSE 集成、记录、模板、预算、幂等（记录层与迭代层）、输入长度与格式的 Zod 校验（FR-1.2 边界）。

验收：`pnpm run typecheck`、定向测试通过；用 mock 跑通一次生成与一次继续优化；数据库落库正确。

### Phase 2 工作台重写（4 人日）

- V3-20 工作台外壳：模式切换、目标类型、输入区、快捷键；界面文案集中 `lib/i18n/zh.ts` 单一字典模块（NFR-9 决策，键名稳定，后续可加同构英文字典）。
- V3-21 结果面板：流式、渲染/源码、复制、下载、停止、用量信息。
- V3-22 对比原文：diff 引擎与并排/行内视图。
- V3-23 改动说明与继续优化输入框、快捷 chip。
- V3-24 按需检查面板与一键修复。
- V3-25 动作：重新生成、收藏、评分、存为模板。
- V3-26 错误态、无密钥态、幂等与取消。

验收：AC-1 到 AC-7、AC-19 到 AC-24、AC-27。

### Phase 3 提示词库（2 人日）

- V3-30 列表、搜索、筛选、分页。
- V3-31 行内收藏与评分。
- V3-32 详情：结果、迭代时间线、任意两轮对比、继续优化、复制导出、存为模板、删除。
- V3-33 空态与加载态。

验收：AC-8、AC-9、AC-25、AC-28。

### Phase 4 模板（2 人日）

- V3-40 模板页：三类标签、风格分组、模板卡。
- V3-41 程序化封面组件。
- V3-42 「用它开始」路由与预填。
- V3-43 自定义模板创建与删除。
- V3-44 12 条内置模板内容审校。

验收：AC-10、AC-11；每条模板都能独立使用。

### Phase 5 设置与成本（2 人日）

- V3-50 模型槽位：生成模型、优化模型。
- V3-51 连通性测试适配新角色。
- V3-52 月度预算设置。
- V3-53 成本页：KPI、14 天趋势、两张表、未知值处理。
- V3-54 80% 与 100% 提示。

验收：AC-12 到 AC-14、AC-17、AC-26。

### Phase 6 移除旧模块与收口（2 人日）

- V3-60 删除 `/eval`、试运行、字段编辑、旧导航与相关组件。
- V3-61 退役旧引擎模块与对应测试，重建测试基线。
- V3-62 可访问性、响应式、减少动效。
- V3-63 E2E 脚本更新，覆盖完整主路径。
- V3-64 截图与文档最终同步。
- V3-65 备份后删除旧表。

验收：AC-15、AC-16、AC-18；AC-1 到 AC-28 全量回归；全量命令通过。

## 4. 测试计划

| 类别 | 处理 |
|---|---|
| 保留 | LLM 适配器、registry、ledger、设置、成本聚合、UI 基础组件、外壳 |
| 适配 | 生成路由测试、设置路由测试、统计路由测试 |
| 删除 | 八字段 schema、doc、paths、assumptions、字段级 lint、评估、试运行、多格式导出测试 |
| 新增 | 元数据解析、Markdown 复制、diff、自由文本检查、记录 API、模板 API、预算、SSE 集成、幂等 |

E2E 场景：

1. 生成，自动入库，复制与下载。
2. 优化，对比原文，查看说明，继续优化，对比两轮。
3. 收藏，评分，搜索，删除。
4. 模板「用它开始」，存为自定义模板，再使用。
5. 设置模型，测试连接（mock），设置预算触发提示。
6. 无密钥与断网状态下的禁用与提示。

测试基线以实测为准（2026-11-13 实测 512 条，41 个文件），不要求保留数量。旧引擎测试随模块退役，新基线以 Phase 6 的结果为准。

## 5. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 模型不按分隔符输出元数据 | 标题与说明缺失 | 解析失败降级为输入摘要与空说明；单测覆盖缺分隔符、坏 JSON、分隔符提前出现 |
| 中文 diff 噪声大 | 可读性差 | 行级 LCS 加修改行字符级比较；20k 字符上限 |
| 模板内容空洞 | 模板页不可信 | 12 条人工审校；每条附示例输入；验收时逐条打开 |
| 旧数据丢失 | 不可恢复 | Phase 0 备份；只增不删；Phase 6 才删表并再次备份 |
| 未知成本被当 0 | 报表失真 | 保留 null 语义；聚合与展示单测 |
| 缺真实密钥 | 真模型路径未验证 | mock 与故障注入覆盖；上线前验证用量落库、推理内容过滤、错误码映射 |
| 删评估导致测试大面积失效 | 红测噪音 | Phase 1 先建新测试，Phase 6 统一删旧测试；不追求旧数量 |
| Markdown 注入 | 安全风险 | 不渲染原始 HTML；链接补 rel；导出只含正文 |

## 6. 回滚

- 每阶段独立分支或独立提交，可用 `git revert` 单阶段回退。
- 数据库改动只增不删，Phase 6 前旧表可继续读。
- 删除旧表前执行：`cp data/app.db data/app.db.bak-$(date +%Y%m%d-%H%M)`。
- 不改 `.env` 与密钥；回滚不涉及配置。
- Phase 6 之前不发布，避免半成品状态暴露给用户。

## 7. 文档更新清单

| 文档 | 变更 |
|---|---|
| `PRODUCT.md` | v3 结果优先定义，已完成 |
| `docs/ROADMAP-V3.md` | 本文，已完成 |
| `DESIGN.md` | 导航 4 项、工作台、库、模板、设置、组件规格 |
| `CONTEXT.md` | 新词表：记录、迭代、检查、评分、收藏；移除评估、版本、字段 |
| `docs/ARCHITECTURE.md` | 新 API、SSE、元数据协议、diff、检查规则 |
| `docs/HANDOVER.md` | 新代码地图、运行方式、未完成项 |
| `README.md` | 一句话定义与文档索引 |
| `docs/adr/0007-result-first-reset.md` | 产品方向重置决策 |

## 8. 验收命令

```bash
node ~/.claude/scripts/claude-project-harness-check.mjs .
pnpm run typecheck
pnpm test
pnpm build
pnpm check:contrast
```

测试已与开发库隔离（`tests/global-setup.ts` 建独立 `data/test.db`，`tests/setup-env.ts` 设 `DATABASE_URL` 并清真实密钥），跑测试不再需要停 3100，但测试绝不读写 `data/app.db`。CI 顺序保持 contrast、`next typegen`、typecheck、test、build。
