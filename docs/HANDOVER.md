# 交接说明

写给接手这个项目的人。读完应该能：把服务跑起来、知道代码在哪、知道哪些约定不能碰、知道哪里还没做完。

---

## 1. 一句话

把用户随口一句需求，扩写成结构完整、边界清晰的提示词，并用真实模型试跑一次，让用户当场看到效果。

界面参考火山 PromptPilot，但不是复刻：它更强调"先看到输出，再看结构"。

---

## 2. 现在能做什么

### 已验证可用

- 输入一句话，流式生成八字段结构化提示词（离线启发式或方舟真模型）
- 字段级编辑、AI 单字段重算、撤销重做
- 假设 chip：模型替用户做的小决定，可改可回退
- 16 条本地诊断规则 + 一键修复（修复不覆盖手改字段）
- 试运行：变量表单、真实输出、可取消、用量与耗时
- 两种导出：Markdown、OpenAI messages
- 版本库：首次生成自动存 v0，可另存新版本，v0 服务端不可改删
- 成本账本：按调用记录 token 与金额，区分"未知"与"0"
- 无密钥时降级为离线模板并持续提示

### 未验证

**真实 ARK 密钥下的端到端行为一次都没跑过。** 没有密钥，所有真模型路径只经过 Mock 与故障注入。接上密钥后请优先验证三件事：

1. 流式 usage 是否正确落库（否则账本全是"未知"）
2. `reasoning_content` 是否被单独识别（否则思考内容可能混进正文）
3. 限流与额度用尽的真实错误码是否被正确映射

### 明确没做

版本回滚与 diff 界面、标签/收藏/删除/分页、模型选择器与参数面板、流式进行中的文本诊断、Playwright 级 UI 断言。这些不在本次范围，不是遗漏。

---

## 3. 快速上手

### 环境

Node 24（E2E 脚本用内置 type stripping，低版本跑不了）、pnpm、SQLite（无需单独安装）。

### 第一次运行

```bash
cd prompt-pilot
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm dev            # http://localhost:3100
```

不填 `ARK_API_KEY` 也能跑通全流程，此时是离线模板模式，界面会有明确标识。

### 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务，3100 |
| `pnpm build` / `pnpm start` | 生产构建与启动，3100 |
| `pnpm test` | 全量单测（466 条） |
| `pnpm typecheck` | 类型检查 |
| `pnpm db:push` | 同步 schema 到 SQLite |
| `pnpm db:studio` | 图形化看数据 |
| `node scripts/e2e-http.mjs` | HTTP 层端到端，自带服务与清理 |

### 环境变量

界面上「设置」页可以覆盖下面四项，优先级为 **设置页 > 环境变量 > 代码默认值**。
密钥写入后只存在本机 SQLite，接口只回报末四位，不回传明文；「清除全部覆盖」即回落到环境变量。

| 变量 | 说明 |
|---|---|
| `ARK_API_KEY` | 留空进入 L1 离线模板模式 |
| `ARK_BASE_URL` | 默认 `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_MODEL_GENERATE` | 生成用 pro |
| `ARK_MODEL_EVALUATE` | 评估用 lite，刻意不同族以免自评 |
| `DATABASE_URL` | `file:../data/app.db`，路径相对 schema 目录解析 |

### 故障注入

`MOCK_LLM_FAULT=valid|network|rate_limited|quota_exceeded|truncated|bad_json|fenced_json|slow_stream` 可在无密钥时模拟各种上游行为，用于验证错误态与兜底链。

---

## 4. 代码地图

```
app/
  (workspace)/          工作台、库、评估、模板、设置（共享 AppShell 布局）
  api/engine/generate/  流式生成（SSE）
  api/engine/field/     单字段重算
  api/run/              试运行（SSE）
  api/prompts/          提示词与版本 CRUD
  api/stats/            成本与调用统计
components/
  shell/AppShell.tsx    侧栏、顶栏、主题、模型状态徽标
  studio/               工作台全部交互（约 20 个文件）
  library/              提示词库
lib/
  engine/
    schema.ts           八字段契约（冻结，不要改）
    compose.ts          离线启发式生成
    doc.ts              文档状态机、撤销栈、写入路径
    paths.ts            字段文本 ↔ 结构化叶子
    assumptions.ts      chip 派生与基线比较
    lint/               16 条规则、修复、诊断引擎
    render.ts           结构化文档 → 可读文本
    export.ts           Markdown 与 OpenAI messages 导出
    variables.ts        变量派生与校验
    sse.ts              SSE 事件协议
  llm/
    types.ts            Provider 接口（冻结）
    registry.ts         选择 provider
    ark.ts / openai-compat.ts   方舟适配与兼容层
    structured.ts       五级兜底解析
    mock.ts             故障注入
    ledger.ts           成本记录
  db/                   Prisma 客户端、提示词、运行记录
scripts/e2e-http.mjs    HTTP 端到端
```

### 几个名字上的约定

- **字段**不是"模块"，**版本**不是"快照"，**试运行**不是"测试"，**评估**不是"评分"，**诊断**专指 16 条本地规则
- 界面文案中文，禁止感叹号、禁止 em dash（——）、禁止 emoji

---

## 5. 一次生成的数据流

```
用户输入
  → POST /api/engine/generate（SSE）
  → compose：模型或离线启发式产出八字段 JSON（流式）
  → 客户端 applyStreamDelta：只写 pending，不碰已确认内容
  → field 完成时 commitField：字段级原子提交，脏字段得到 suggestion
  → harden：确定性补边界，不调模型
  → 自动试运行（变量有默认值时）
  → 落库：Run 与 LlmCall
```

SSE 事件顺序：`stage` 包裹 `field` 包裹 `delta`，`reasoning` 与 `usage` 不改变字段状态，`error` 终止，`done` 收尾。

---

## 6. API 清单

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/engine/generate` | POST | 流式生成，`text/event-stream` |
| `/api/engine/field` | POST | 单字段重算，接受操作与上下文 |
| `/api/run` | GET/POST | GET 返回可用性与历史，POST 流式试运行 |
| `/api/prompts` | GET/POST | 列表与创建 v0 |
| `/api/prompts/[id]` | GET/PATCH/DELETE | 详情、追加版本、删除（有 v0 时 409） |
| `/api/stats` | GET | 成本与用量统计 |

全部为动态路由（`force-dynamic`），依赖请求时环境与数据库。

---

## 7. 数据模型

Prisma + SQLite，12 个模型。会直接碰到的四个：

- `Prompt`：一条提示词
- `PromptVersion`：版本，`versionNo = 0` 是基线 v0，`@@unique([promptId, versionNo])`
- `Run`：一次试运行，`versionId` 可空（保存版本前也能试运行），`sessionKey` 标识草稿
- `LlmCall`：一次模型调用，用量字段全部可空

其余：`Variable`、`VariableSet`、`EvalTask`、`CriterionCheck`、`ModelConfig`、`PromptTemplate`、`Draft`、`AppSetting`。

---

## 8. 不能破坏的约定

这七条是踩过坑之后定下来的，改之前先想清楚代价。

**1. 未知不是 0。**
用量字段一律可空。`null` 表示不知道，`0` 表示确实是 0。混用会让成本报表撒谎。历史上有过一次 `@default(0)` 的写法，已全部改掉。

**2. 解析层只拒绝结构，不拒绝不完整。**
缺字段用 `.default()` 兜住，schema 不因为模型少给两段就整体失败。完整性交给诊断规则判断。

**3. 流式只写 pending。**
R1 阶段用户正在看的内容不能被覆盖；R2 字段级原子提交；R3 用户编辑立即落文档；R4 补丁必须显式接受。

**4. 修复写入不是用户编辑。**
`applyRepair` 走 `origin: 'patch'`、`dirty: false`。如果修复也置脏，下一次一键修复会把自己刚修过的字段当成手改字段跳过。

**5. 例外：覆盖式补丁保留 dirty。**
`applyPatch('overwrite')` 刻意保留脏标记。这条保护回答的是"用户要不要复核"，与程序修复不是一回事，不要为了整齐抹掉。

**6. v0 不可改删，且服务端强制。**
UI 禁用只是建议。`assertVersionWritable(0)` 在服务端返回 409。

**7. 契约文件不要动。**
`lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结接口。`package.json`、`prisma/schema.prisma` 的改动需要负责人确认。

---

## 9. 测试与验收

### 规模

37 个测试文件，466 条用例。单测为主，集成测试覆盖路由。

### 分层

| 层 | 覆盖 |
|---|---|
| 纯函数单测 | 路径映射、诊断规则、导出转义、变量校验、文档状态机 |
| reducer 级 | 撤销重做、chip 基线派生、修复写入语义 |
| 集成 | 生成路由、运行路由、提示词路由（含并发版本号） |
| 端到端 | `scripts/e2e-http.mjs`，生成 → 导出 → 试运行 → v0 → 库列表 → 评估 |

### 视觉回归

界面在 B1 到 B4 四批里重做过，验收基准是 `docs/BEAUTY-PLAN.md` 第九节：

- 对比度用 OKLCH 转 sRGB 后按 WCAG 公式算，浅色最低 4.53:1、深色最低 5.13:1
- 单屏 `border` 容器不超过 3 个，实测工作台 2 个
- 每屏只有一个 primary 按钮
- 改动样式时先看 `components/ui/`，不要再手写一套按钮与空态
- 动效只有 `rise` / `reveal` 两个类，规则见 `docs/adr/0002-css-only-motion.md`
- 跑测试前先停掉 3100 上的应用服务：两边共用同一个 SQLite 文件，会互相干扰

### 验收原则

- 一律以 **clean build** 为准：`rm -rf .next && pnpm build`
- 本地 dev 的增量缓存会少编译媒体查询变体（例如 `xl`），看起来像布局 bug，删掉 `.next` 即可
- 四件事同时绿才算通过：`pnpm test`、`pnpm typecheck`、`pnpm build`、`node scripts/e2e-http.mjs`

---

## 10. 已知缺口与建议

### 优先做

1. **接真密钥验一轮**，重点看 usage 落库、`reasoning_content`、错误码映射
2. ~~成本字段收口~~：已改成可空（与 Run / LlmCall 一致）
3. **来源文案**：修复后显示「已生成 · 补丁写入」，「补丁写入」是内部术语，需要一次文案统一

### 可以排期

- 版本回滚与 diff 界面（API 已接受 `rollback` 来源）
- 库的标签、收藏、删除、分页
- 模型选择器与参数面板（现在固定默认模型）
- 流式进行中的文本参与诊断
- 导入已有提示词（API 已接受 `imported` 来源）

### 结构性建议

- 如果要做多人协作，`sessionKey` 这套草稿标识需要换成真正的会话
- 如果需要审计，`LlmCall` 已经有 traceId，但 `Prompt/Template` 的变更还没有留痕

---

## 11. 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| `pnpm install` 报 EPERM | 沙箱把 `~/.npm` 设为不可写 | `.npmrc` 已把 store 与 cache 放工程内，不要改回全局 |
| Prisma 找不到数据库 | SQLite 相对路径按 schema 目录解析 | `DATABASE_URL="file:../data/app.db"`，且 Prisma CLI 只读 `.env` 不读 `.env.local` |
| 1440 布局塌成单栏 | dev 增量缓存缺 `xl` 变体 | `rm -rf .next` 重新构建 |
| 端口被占 | 同一目录起了两个 dev server | `lsof -ti tcp:3100 \| xargs kill -9` |
| 试运行一直显示不可用 | 没有密钥也没注入 Mock | 配 `ARK_API_KEY`，或 `MOCK_LLM_FAULT=valid` |
| 构建时 Prisma 报 relation 缺失 | schema 改了但没 generate | `pnpm db:generate` |

---

## 12. 第一天 checklist

- [ ] 跑通 `pnpm dev`，打开 3100，确认首页空态与模型状态条
- [ ] 输入一句话，看八字段流式生成
- [ ] 改一个 chip，撤销，确认字段与标记一起回退
- [ ] 点一键修复，确认有错误的字段被修、手改字段被跳过
- [ ] 点试运行，看输出与用量
- [ ] 导出 Markdown，粘贴到任意 Markdown 编辑器
- [ ] 保存版本，去库里打开，另存一个新版本
- [ ] 跑 `pnpm test` 与 `node scripts/e2e-http.mjs`，确认全绿
- [ ] 读完 `PRODUCT.md` 与 `docs/ARCHITECTURE.md` 的状态模型一节

---

## 附：文档索引

| 文件 | 内容 |
|---|---|
| `PRODUCT.md` | 需求、验收标准、指标、非目标 |
| `DESIGN.md` | 视觉规范、组件状态矩阵、交互约束 |
| `docs/ARCHITECTURE.md` | Provider 接口、SSE 协议、schema、状态模型、数据模型 |
| `docs/ROADMAP.md` | 里程碑与风险 |
| `docs/REVIEW.md` | 评审结论与问题闭环 |
| `docs/EXECUTION.md` | 技术方案与分工 |
| `.scratch/promptpilot/issues/` | 19 张工单，含验收记录与已知问题 |
