# Session Summary

## 2026-11-13 Batch C（SSE 路由与账本关联）

- 提交链：`03a26ea` ledger 加法（LedgerStage、recordId/iterationId）→ `59eb9b6` lib/db/records.ts 写路径 → `66df02f` /api/generate 首轮 SSE → `03e96da` 共享流收敛到 lib/engine/stream-v3.ts（refactor）→ `2e67025` optimize/repair 路由 → `4d9af1f` 修复（completeIteration 失败收敛为 failed；META 泄漏测试改注入 provider；P2002 重放测试）。
- 验证：typecheck 0；全量 53 文件 / 579 用例通过；harness 唯一 fail 为 ACTIVE_CONTEXT 超 4KB 预算。
- 关键裁定（ledger 有全文）：
  - 记录 status 跟随迭代 status（canceled 时记录 canceled，用量排除在 completed 聚合外）。
  - finishReason `length` 视为 invalid_output 失败、不保留正文（代价：撞 8192 上限丢正文）。
  - record.title 仅 /api/generate 按 meta.title 更新，optimize/repair 不改标题（FR-6.3）。
- 踩坑：valid mock（lib/llm/mock.ts）不输出 META 分隔符，早期 META 泄漏断言空转；已改为测试内注入带 marker 的 provider。
- 踩坑：首个 Task 3 实现者 API 超时后无产出；改派全新实现者成功。
- 待办：Batch C 整分支 final review（6087412..HEAD）；minor/parked 项 triage；finishing-a-development-branch。
- 已记录的 minor：generate-v3-route 的 marker 断言仍空转（由 stream-v3-meta 覆盖）；optimize 对首轮失败记录无空源守卫；409 字面量重复。

## 2026-11-13（续：Batch C 整分支 final review）

### Completed
- [x] Batch C 整分支 final review（`6087412..HEAD`，opus verifier，只读）：APPROVE_WITH_FIXES；typecheck 0；53 文件 / 579 用例通过；冻结契约 FROZEN_OK；测试前后 data/app.db mtime 不变。
- [x] 修复 F1/F2（`e61796d`）：见 Key Decisions。新增并发追加、续写失败保留记录、running 迭代 409 三组测试；修正 2 处被旧行为固化的断言。收口 typecheck 0、53 文件 / 582 用例全过、harness 无 fail。
- [x] ledger minor triage 落 `.superpowers/sdd/2026-11-13-v3-batch-c/progress.md`：FIX-NOW 2（已完成）/ DEFER 9 / DROP 7。

### Key Decisions
- 并发互斥从记录 status 移到迭代层：同记录存在 running 迭代即视为在飞；同 requestId 重放跳过该检查，仍走 P2002 幂等重放。
- 续写失败不回滚记录状态：`failIteration` 仅在 `iterationCount===0`（首轮失败）时把记录置 failed；后续轮只标迭代，latestOutput 与 completed/canceled 状态不变，保留评分与收藏资格（FR-6.6）。
- SSE 外层 catch 将 `RecordInFlightError` 映射为 `ITERATION_IN_FLIGHT`（retryable false），其余仍 LLM_UNKNOWN。

### Pitfalls
- 记录级 running 在续写路径从未被写入，原 409 守卫形同虚设；只查 record.status 无法防并发。
- `appendIteration` 加在飞检查后，“连续追加两轮且都不完成”的旧测试会改抛 RecordInFlightError；测试需先 complete 或带同 requestId。

### Carry-over（Batch D/E）
- generate 路径的 P2002 清理空记录无测试；abort 重放不应多发 meta（仅 completed 发）；失败重放 errorCode 需迭代表加列。
- 首轮失败记录的空源守卫；空 canceled 记录列表过滤；客户端把无 done 的流按 failed；日志收敛为 error.name+code；409 字面量并入 jsonError。
- 残余风险：failIteration 自身失败时首轮记录可能停在 running，Batch D 加超时恢复。

### Integration
- [x] finishing-a-development-branch：按用户指示合入 `main`（快进 fc00f4c → 5d607b1），删除 feat/v3-result-first；合并结果复跑 typecheck 0 / 582 用例 / harness 无 fail。先误建 develop 分支，用户纠正后已删除，未 push。

## 2026-11-13 Batch D（records API Task 1）

### Completed
- [x] Batch D 计划落盘 `docs/superpowers/plans/2026-11-13-v3-batch-d.md`（5 任务：records API、templates API + 12 seed、stats-v3、Batch C DEFER、docs 同步），预检 clean，实现者串行因 `data/test.db` 单文件。
- [x] Task 1 实现 `aa6878d`：`lib/db/records.ts` 加法（RecordSummary/ListRecordsQuery/RecordNotFoundError/RecordNotReadyError/listRecords/updateRecordMeta/deleteRecord）+ `GET /api/records` + `GET/PATCH/DELETE /api/records/[id]` + 16 条集成测试。
- [x] Task 1 审查（sonnet）：Spec ✅、质量 Approved、0 Critical / 0 Important / 6 Minor；唯一确认缺陷为日期 `to` 边界。
- [x] 修复 `f616ee4`：日期筛选改上海日历日闭区间；scoped re-review 判定 ADDRESSED、无新破坏；定向 16/16、全量 598/598、typecheck 0。

### Key Decisions
- 日期筛选契约：`from` = 上海当日零点（含），`to` = 上海当日整天（实现为次日零点不含）；查询层字段改名 `fromInclusive`/`toExclusive` 并 `gte`/`lt`。理由：`lib/llm/ledger.ts` 已按 Asia/Shanghai 切日，UTC 零点会与用户看到的日期差一天。
- 6 条 minor 全部 deferred 至 Batch D final review：测试清理未覆盖 template/预算键；PATCH 400 含 zod 英文；500 未记错误类型；noStoreJson/notes 解析重复；DELETE 预检 TOCTOU；updatedAt 读后写窄竞态。

### Pitfalls
- harness-verify 的 typecheck 报错可能来自实现者编辑中间态（`parseUtcDay` 已改名仍报旧名）；控制器在 HEAD 复跑 typecheck 再判断。
- 任务审查的 Minor 不进入 fix loop；只有 spec ❌、Critical/Important 或确认的 ⚠️ 才触发修复轮。

### Carry-over
- [ ] Task 2 templates API + 12 seed（BASE `f616ee4`）；随后 Task 3 stats-v3、Task 4 Batch C DEFER、Task 5 docs。
- [ ] Batch D 整分支 final review + 6 条 deferred minor triage。
- [ ] 计划文件与记忆文件在会话末合并提交。

## 2026-11-13 Batch D（Tasks 2-5 与整批收口）

### Completed
- [x] Task 2 templates API + 12 条内置模板 seed（`121ebd3`）：`lib/db/templates.ts`、`app/api/templates` GET/POST、`[id]` DELETE、`prisma/seed.ts`（slug upsert）、`pnpm db:seed`。审查 Spec ✅ / Approved / 0 Important / 5 Minor。
- [x] Task 3 v3 成本统计（`32ceb80`）：`lib/llm/stats-v3.ts`（`V3_STAGES`、上海月 KPI、null-vs-zero、budgetUsage）、`/api/stats` 切换 `getV3Stats` 保留 503/no-store。审查 0 Important / 5 Minor。
- [x] Task 4 Batch C DEFER 收口（`e70db9e`）：重放仅 completed 发 meta；optimize/repair 空源 409 `RECORD_HAS_NO_OUTPUT`；409 收敛 `jsonError`；日志 `describeError` 只记 name+code。审查 0 Important / 4 Minor。
- [x] Task 5 docs 同步（`f8b6559`）：ARCHITECTURE §4 契约、HANDOVER、README seed 命令。审查 0 Important / 6 Minor。
- [x] 整分支 final review（`369857c..e70db9e`，fable）：With fixes，0 Critical / 1 Important（docs 真源陈旧）/ 多项 minor。
- [x] Fix wave `274df1f`（15 文件）：docs 真源同步（v3 数据/API vs v2 UI、639/59 基线、Batch E next）；search LIKE 通配符字面过滤；PATCH running 守卫；DELETE 事务内复查；月费 round6；completed 重放 meta 与 `describeError` 测试；注释/契约补全。
- [x] Scoped re-review（`e70db9e..274df1f`）：7/7 ADDRESSED，无新 Critical/Important。
- [x] 控制器终验：typecheck 0；59 文件 / 639 用例通过；harness 25 pass / 0 fail；`pnpm db:seed` 两次后内置模板 4/4/4。

### Key Decisions
- `DELETE /api/templates/[id]` 二次删除返回 404 `TEMPLATE_NOT_FOUND`，覆盖 brief Step 4 的 204 幂等注释；接口契约（`DeleteTemplateResult`）为准。代价：一条路由映射与一行测试。
- PATCH 元数据遇 running 迭代按 FR-6.6 拒绝（409），不沿用 final review 的 Minor 定级；代价是数据层与一组测试。
- 搜索词含 `%`/`_` 时改为候选行内存字面过滤，保留 substring 语义与原有 SQL 前缀过滤；本机单用户量级可接受。

### Pitfalls
- `pnpm test -- <path>` 在 pnpm 10 不过滤，会跑全量；定向用 `pnpm exec vitest run <path>`。
- harness-verify 的 typecheck 报错多为子代理编辑中间态；控制器在 HEAD 复跑再判断。
- T4/T5 并行时须核对 `git show --stat`，防索引污染；本批两提交文件集互不重叠。
- Prisma 6 的 `package.json#prisma` 与 Node MODULE_TYPELESS 警告为已知良性。

### Deferred
- 20 条任务审查 minor（6+5+5+4）已 triage：final review 采纳其中 docs/搜索/PATCH/DELETE/round6/测试缺口为 fix wave；其余为测试清理、zod 英文文案、重复 helper、常数边界、503 路径未测等，均不阻塞。
- ARCHITECTURE:229 记录未来 UI 趋势图行为（FR-9.3）为 out-of-scope，留 Batch E。

### Carry-over
- [x] 用户授权后 `feat/v3-batch-d` 合入 `main`：快进 `369857c` → `1563ada`，特性分支与 `.superpowers/sdd/2026-11-13-v3-batch-d/` 已删；merged main typecheck 0 / 59 文件 639 用例 / harness 24 pass 0 fail；未 push。
- [ ] Batch E：studio-v3 UI（i18n zh.ts、diff、R101-R108、components/studio-v3/*、Rating、替换 /studio、主题切换移顶栏）。
- [ ] 真实网关密钥端到端验证；补 DeepSeek V4.1 Flash / GPT 5.6 Luna 价格表或在设置覆盖。

## 2026-11-13 Batch E（studio-v3 工作台整批）

### Completed
- [x] 分支 `feat/v3-batch-e`（base `cdc8ebc`，plan `f688f0c`）7 个计划任务全部完成：i18n zh.ts、Markdown/diff、R101-R108 本地检查、流式 reducer/usePromptStream/API、StudioWorkspace 替换 /studio、继续优化/修复/存模板、四项导航与移动底栏。
- [x] 任务提交：`0cb096c`（T1）、`ce03a04`..`6119272`（T2）、`004423a`（T3）、`585c58a`..`6de3c2a`（T4）、`cbb463f`（T5）、`cbb463f`..`ee8a370`（T6）、`ee8a370`..`7828b16`（T7）。
- [x] Final review（fable）：1 Critical C1（canceled 空输出覆盖 `latestOutput` 导致记录从库隐藏）+ Important I1 评分焦点丢失、I2 结算失败卡死、I3 优化记录可重新生成；另有 M1/M2/M7/M8/M9/M10/M11。
- [x] Fix wave `f48833d`（20 文件，+715/-96）：C1 窄修在 `lib/db/records.ts`（canceled + 空正文才不写 latestOutput）；I1 `lib/ui/meta-coalesce.ts` 单飞合并、不原生 disable；I2 结算重试 3 次后 `settle-failed` 清 settling 并显示「用量信息不可用」；I3 `lib/ui/regenerate-guard.ts` 仅生成模式；M2 Esc 提升到 window；M7 `sawDone` 守卫；M9 文案、M10 代理对安全截断。
- [x] Scoped re-review（`7828b16..f48833d`）：11/11 ADDRESSED，无新 Critical/Important。
- [x] 控制器终验（`f48833d`）：`pnpm run typecheck` 0；78 文件 / 832 用例通过；harness 24 pass / 0 warn / 0 fail。fix 报告记录 build 与 contrast 通过。

### Key Decisions / Rulings
- 只新增 `react-markdown` + `remark-gfm` 两个依赖；jsdom/Playwright 未引入（Ruling 1）。
- I1 键盘评分用真实 Chromium 冒烟验证（4×ArrowRight 焦点保持），不新增 DOM 测试依赖。
- I2 采用「重试 3 次 + 终止态」而非加超时；无超时的悬空 fetch 仍是既有 Minor（Task 4 deferred）。
- I3 只限制 UI；`/api/records/[id]/regenerate` 仍不校验模式，属 out-of-scope 观察，未扩大 write set。
- AC-6 对比：单轮优化为「原文 vs 输出」，≥2 轮可选任意两轮；`lib/ui/compare.ts` 门控。
- cancel=canceled 保留正文；failed 丢弃草稿保留已提交输出；`sawDone` 后传输错误不再改写完成态。
- `/eval` 仅保留 URL 可达，导航与命令面板条目移除（Ruling 4）。
- `prefers-reduced-motion` 全局把 animation/transition 归零（write set 扩展 `app/globals.css`）。

### Deferred Minors
- 复核新增 3 条 Minor：命令面板与流式 Esc 同在 window 层，面板打开时一次 Esc 同时关面板并取消流；I3 说明只挂在原生 disabled 按钮 title 上，鼠标与键盘都无法触达；继续优化后结算失败会沿用上一轮 detail meta，与「用量信息不可用」同屏矛盾。
- 任务阶段遗留：diff LCS 性能、R108 12000 边界、结算 fetch 无超时、optimistic meta 被陈旧 detail 覆盖、1024px 展开轨、命令面板 backdrop-blur、无密钥路径未测等，均不阻塞。
- 提示词库与模板页仍是 v2 UI（Phase 3/4）；AC-3 仅 DB/API 层验证。
- `originTemplateId` 埋点未接线；P95 首字延迟仅 Mock 单样本 163.7ms。

### Pitfalls
- harness-verify 的 typecheck 失败多为子代理编辑中间态；以提交后 HEAD 复跑为准。
- Mock valid 画像不产出改动说明/未知值，相关分支依赖单元测试。
- 浏览器自动化无法可靠在 75ms Mock 流结束前发送 Esc；用 `slow_stream` 验证中断。
- `pnpm test -- <path>` 不过滤；定向用 `pnpm exec vitest run <path>`。

### Carry-over
- [x] 用户选择本地合并：fast-forward `cdc8ebc` → `f48833d`；merged main typecheck 0 / 78 文件 832 用例 / harness 24 pass；特性分支与 `.superpowers/sdd/2026-11-13-v3-batch-e/` 已删；未 push。
- [ ] Phase 3 提示词库 v3 UI、Phase 4 模板页 v3 UI、Phase 5 设置/成本 UI、Phase 6 v2 清理。

## 2026-11-14 Batch F（提示词库 v3 UI）

### Completed
- 分支 `feat/v3-batch-f`（base `fc7ac2f`，plan `e9206d0`）4 个任务：库查询/格式化/API 客户端；v3 列表（搜索 300ms 防抖、筛选、offset 分页、行内收藏/评分/重命名）；详情抽屉（native dialog、结果渲染/源码、时间线、任意两轮对比、检查、存模板、删除）；抽屉内继续优化/修复流 + v2 库删除 + 跨路由集成测试。
- 任务提交：`e9206d0`（plan）、`dcaaccb`、`199fbe6`、`d4b5d83`、`613072f`；final fix `618f0b2`。
- 集成测试 `tests/integration/library-v3-flow.test.ts`：搜索标题/输入/正文、收藏/已评分/模式/目标类型/上海日历日筛选、PATCH 即时反映、删除后 404 且账本匿名保留、limit/offset 分页无重复。
- Final review（fable）：0 Critical；Important I1 CheckPanel 陈旧结果/修复载荷、I2 收藏/已评分筛选归属；修复 `618f0b2`（I2 新增 `applyMetaUpdate`，RED 6 失败 → GREEN；I1 加 `key={output}`）。9 条 Minor + 9 条 declined 均裁决。
- 终验（`618f0b2`）：typecheck 0；83 文件 / 857 用例；build ✓；check:contrast ✓；生产 HTTP 冒烟（/library 200、CSS `.library-drawer`×4 与 `::backdrop`×3、/api/records 200）。

### Key Decisions / Rulings
- 集成测试首次即绿（记录 API 已在 Batch D 落地），保留为 AC-8/9/25/28 跨路由回归钉；RED 缺失已记账。
- 无 Chromium / `data/app.db` 为空：手动交互冒烟以全量验证 + 生产 HTTP 冒烟替代，交互留待人工验收。
- 抽屉卸载调用 `cancelStream()+resetStream()`：关闭即取消，服务端标记已中断并保留正文。
- `applyMetaUpdate`：筛选归属在更新时维护，避免取消收藏后行残留与总数矛盾。
- CheckPanel 以 `key={output}` 重置，防止对旧正文发起修复。

### Deferred Minors
- M1 useRecordMeta confirmed 陈旧/无差异仍发 PATCH；M2 failed 流无状态文案；M3 生成单轮仍展示对比区；M4 MetaRow 混用迭代与累计值；M5 deleting 未纳入 busy；M6 无显式停止按钮；M7 未按 updatedAt 重排；M8 行点击仅标题/死代码；M9 客户端交互无 DOM 测试。

### Pitfalls
- `task-done` 脚本会把 vitest 的 learn-more 行写进账本，需按日志修正。
- 本 harness 无 Chromium，交互与焦点只能人工验收。

### Carry-over
- [x] 用户选择本地合并：快进 `fc7ac2f` → `79a101d`，特性分支已删；merged main typecheck 0 / 83 文件 857 用例 / build ✓ / contrast ✓；未 push。
- [ ] Phase 4 模板页、Phase 5 设置/成本、Phase 6 v2 清理。

## 2026-11-14 Batch G（模板页 v3 UI）

### Completed
- v3 Phase 4（V3-40..44，AC-10/11）在 `main` 本地完成：三分类 Tabs 与计数、风格筛选、12 个内置模板卡、三套程序化 SVG 封面、「用它开始」预填、自定义模板创建/删除。
- 提交：`8b7bb6d`（studio 预填与 origin）、`0610cfd`（模板库 UI）、`3e4baa9`（内置内容质量测试）、`ebde558`（卡片高度与封面可读性）、`a92c7da`（3D 标题单行）、`83b0743`（验收 Minor 修复）。
- 关键文件：`components/templates-v3/{TemplateLibrary,TemplateCard,TemplateCover}.tsx`、`app/(workspace)/templates/page.tsx`、`lib/templates-v3.ts`、`app/(workspace)/studio/page.tsx`、`lib/i18n/zh.ts`、`prisma/seed.ts`。
- 测试钉：`tests/unit/templates-v3.test.ts`、`tests/integration/templates-{store,seed,route}.test.ts`、`tests/unit/studio-v3/{composer,template-form}.test.ts`；seed 内容质量覆盖长度、禁用标点/emoji/空词、风格覆盖与预填解析。
- 终验（`83b0743`）：typecheck 0；85 文件 / 887 用例；build ✓；check:contrast 全部通过；harness 24/0/0；CDP 冒烟 26/26；焦点与长风格专项 11/11。
- 独立验收（fable max，`7f33a55..a92c7da`）：pass，0 Critical / 0 Important / 2 Minor（删除确认焦点与名称、长风格裁切）已在 `83b0743` 修复并用浏览器复验。

### Key Decisions / Rulings
- 模板页服务端解析 `?template=<id>`：`getTemplate` + `resolveTemplatePrefill`；`originTemplateId` 只挂到匹配模式的首条产出提交，模式切换或第二次提交不带。
- 模板列表载荷不含 `body`；客户端用归一化 `TemplateCard`。分类计数基于全量，风格经 `resolveStyleSelection` 在删除最后一张后回落「全部风格」。
- 数据加载失败不阻断页面骨架：客户端错误态 + 重试。无效 `?template` 回落到空生成态。
- 封面只接受内联 SVG（text 400×240 / image 400×500 / video 400×225），`aria-hidden`，无渐变、外链或占位空壳；封面文字用 `--text-muted` 保证 4.5:1。
- 内置图片模板标题由「3D 等距插画」改为「3D 插画」，避免封面单行断裂；slug 不变。
- 长风格标签通过 `max-w-full min-w-0` 的 Chip + 内层 `min-w-0 truncate` span + `title` 截断；未改全局 Chip。
- `Button` 显式声明 React 19 的 `ref` prop，供删除确认焦点管理使用。

### Unverified / Residual
- Turbopack 生产构建未在独立克隆复验（克隆的 `node_modules` 软链在 Turbopack root 外）；webpack 构建与开发服务器均通过。
- 无真实模型调用（模板页不涉及）；无像素级截图评审，布局与对比度用 DOM/计算样式与对比脚本验证。
- 本地 main 未 push。

### Pitfalls
- CDP 冒烟选择封面时用 `article > div[aria-hidden="true"] svg`；`article svg` 会混入 24px 图标。
- `--text-faint` 在 `surface-inset` / `bg-sunken` 上低于 4.5:1，封面标签禁用。
- 400×500 图片封面下，短标题（≤5 字）才稳定单行；内置标题按此约束。

### Carry-over
- [x] 本地提交完成；未 push；特性分支无（直接在 main）。
- [ ] Phase 5 设置/成本 UI、Phase 6 v2 清理。

## 2026-11-14 Batch H（设置与成本计划）

### Planned
- v3 Phase 5（V3-50..54，AC-12/13/14/17/26）计划：`docs/superpowers/plans/2026-11-14-v3-batch-h.md`，7 个任务，尚未执行。
- 任务：settings store 模型参数 → `/api/settings` 契约（模型/参数/预算）→ 测试连接角色 → 四个 v3 路由注入参数 → 设置页双模型槽与参数表单 → 成本页切 v3 stats + 预算编辑 → 文档/全量验证/独立验收。
- 基线（2026-11-14）：typecheck 0；85 文件 / 887 用例通过。

### Key Decisions / Rulings
- 设置模型角色为 generate/optimize；`modelEvaluate` 仍保留在 store/API 直至 Phase 6，v3 设置 UI 不展示。
- 参数默认 temperature 0.7、maxTokens 8192；`llm.optimize.*` 未显式设置时继承 `llm.generate.*`，视图 source 标记 `inherited`。
- 设置页成本区改用 `getV3Stats`（generate/optimize/repair），不再用 v2 `getCostSummary`。
- 预算 KPI 未设置显示「未设置」；未知费用「—」；本月 0 次调用是已知 0。
- 设置页移除「数据」分区；移除客户端可见 `ARK_API_KEY` 文案以满足 AC-17。
- 不新增设置来源；仍为 SQLite 覆盖 > 环境变量 > 代码默认。

### Pitfalls
- `PUT /api/settings` 当前静默丢弃 `modelOptimize`，且无预算字段；改动时必须先补契约测试。
- 四个 v3 路由硬编码 `maxTokens: 8192`，且不传 temperature；改参数后需 `grep -R "maxTokens: 8192" app/api` 验证清零。
- 成本页仍 import `lib/llm/ledger.ts` 的 `getCostSummary`；切换时注意 `STAGE_LABELS` 与 v2 `compose` 阶段残留。

### Completed（2026-11-14 执行）
- [x] 任务 1-6 实现并分别提交：`04bbb7b` store 参数与继承、`9cb5a28` settings API（模型/参数/预算）、`665b4ad` 连通性 generate/optimize、`b560114` 四个 v3 路由注入参数、`09ba9a8` 设置页双槽与参数表单、`c5da7ef` v3 成本 KPI + 预算编辑（`lib/budget.ts`、`BudgetSetting`、`SettingsNav` 去数据区、`BudgetNotice` 共用阈值）。
- [x] 任务 7 文档：`2793ee4` 更新 ARCHITECTURE 设置 API 契约与 HANDOVER（v3 状态、`ARK_MODEL_OPTIMIZE`、代码地图、Phase 6 next）。
- [x] 全量验证（HEAD `2793ee4`）：typecheck 0；88 文件 / 906 用例；build ✓；contrast ✓；harness 24/0/0。
- [x] AC-17 客户端扫描：`.next/static` 无 `ARK_API_KEY` / `Bearer`；`sk-` 仅 `mask-*`、`task-list-item` 误报。
- [x] CDP 冒烟 22/22（隔离空库 `data/smoke.db`，用后删除）：生成/优化槽与参数默认 0.7/8192；四 KPI；预算 100 → 0%，清除 → 未设置；1440/1024 无横向溢出。
- [ ] 独立 verifier 未跑（会话压缩抖动，按 hook 轮转；新会话第一动作）。
- 未冒烟：stats null 分支（同目录第二个 `next dev` 被单实例锁拒绝）。

### Execution Rulings
- 设置页成本 KPI 在零调用时显示 ¥0 / 0（已知 0），未知费用仍「—」；预算使用率按 `formatBudgetUsage` 优先判定未设置。
- 预算提示阈值与百分比统一在 `lib/budget.ts`；工作台 `BudgetNotice` 改用它，i18n 去掉重复 `%`。
- `docs/HANDOVER.md` 同步到 v3 现役状态，而不只改环境变量表：原文停留在 Batch D，会误导接手者。

### Execution Pitfalls
- 裸 `grep -E "ARK_API_KEY|sk-|Bearer" .next/static` 会因 CSS `mask-*`、`task-list-item` 产生 453KB 输出；AC-17 应分模式核验。
- 同目录不能并行两个 `next dev`（Next 16 单实例锁）；隔离库冒烟需先停旧 server，或换目录跑。
- `BudgetNotice` 中 `usage` 的 null 收窄必须显式 `if (usage === null)`，不能靠 `budgetLevel` 的返回值反推类型。

### Independent Verification（2026-11-14）
- verifier 独立验收 `9dbac52..2793ee4`（`2793ee4..f4d3749` 仅 memory），结论 Accept：AC-12/13/14/17/26 全 PASS，Review Focus 8/8 PASS，无 Critical/Important。
- verifier 自跑证据：harness 24 pass / 0 fail；typecheck 0；88 文件 / 906 用例；build ✓；contrast ✓（最低 4.70:1）；AC-17 `.next/static` 无 `ARK_API_KEY` / `Bearer` / key 形态 `sk-`（40+ 命中均为 Tailwind/CSS 误报）。
- 代码级确认：stats null 分支可读；长模型 ID / 「未设置」/「—」用 `min-w-0` / `break-words` / `flex-wrap` 防溢出；generate 与 optimize 可用同一模型。
- 未复验：浏览器冒烟（verifier 未起 dev server）；stats null 与溢出为代码级判断。
- Minor（不阻塞，Phase 6 或后续顺手）：v3 设置客户端仍有「离线模板模式」旧文案；KPI 标签「本月调用」vs FR-9.2「本月调用次数」；ARCHITECTURE 掩码示例 `••••9f3a` vs 实现 `…9f3a`；`maskKey` 对 <4 字符 key 返回全量。

### Carry-over（verifier 后）
- [x] Batch H 独立 verifier 验收通过（Accept），收口。
- [ ] Phase 6 v2 清理。
- [ ] 本地 main 未 push。
- [ ] 可选：Batch H 4 条 Minor 文案/文档漂移收口。

## 2026-11-14 Phase 6（v2 清理与收口）

### Completed
- Tasks 1-5 完成（未提交，按 ruling）：shell 脱离 `/api/run`；删除 v2 UI、`/eval`、v2 API/引擎/测试；移除 `modelEvaluate` 契约；重写 v3 HTTP E2E；归档 v2 文档；可访问性/响应式/减少动效检查；备份后删除十张 v2 旧表。
- 库表只剩 `AppSetting`、`LlmCall`、`PromptRecord`、`PromptIteration`、`Template`；备份 `data/app.db.bak-20261114-2027`（831,488 字节，`PRAGMA integrity_check=ok`）。
- 基线：harness 25 pass / 0 fail；typecheck 0；59 文件 / 537 用例；clean build ✓；`pnpm e2e` ✓；contrast 最低 4.70:1；浏览器冒烟 4 页 × 1440/1024、键盘顺序、抽屉、reduced motion 全过。
- 最终独立 verifier（fresh context，opus）结论 Accept with minors，无 Critical/Important；其自跑 typecheck、537 用例、build、e2e、contrast、harness 与库表/备份检查均通过。

### Key Decisions / Rulings
- 不在未获用户要求时提交或 push；Phase 6 全部改动留在 main 工作树。保留 `.superpowers/sdd/2026-11-14-v3-phase-6/` 直到用户提交后再删，因账本是未提交变更的唯一记录。
- 旧表删除前先备份并获用户明确确认；`LlmCall` 的历史关联列与索引保留，不重写账本。
- E2E 查询参数用路由实际的 `q`（计划写 `query`）；测试输入追加 run tag 以保证标题命中；均记入 ledger。
- 浏览器冒烟必须用 `localhost` 而非 `127.0.0.1`（Next dev 阻止跨源客户端资源，React 不 hydration）；库行打开控件是标题按钮，不是 `aria-label="查看记录"`。
- `.env.example` 受权限策略阻止，记录为未验证文档项，未绕过。
- 测试基线从 536 更新为 537（新增短密钥掩码用例）。

### Pitfalls
- `Page.navigate` 后仅等 `location.pathname` 会命中旧页面；必须等 `Page.loadEventFired` 并轮询 `document.body`。
- 浏览器冒烟在无 hydration 时输入只改 DOM，不改 React 受控状态，按钮仍 disabled。
- `next dev` 用 IP 源会阻止 `/_next/hmr` 等资源，导致客户端脚本不运行。
- 归档 v2 文档后要扫 README/HANDOVER/ARCHITECTURE/ROADMAP 的旧链接与 "旧表待删" 措辞。
- Prisma `db push --accept-data-loss` 只提示非空表；空表也会被静默删除，删除前仍以 `.tables` 与备份为准。

### Deferred minors（final review）
- HANDOVER 列了 `MOCK_LLM_FAULT=network`，但 mock 无该 profile，设置后静默无效。
- `lib/llm/mock.ts` 的 mock 输出仍用「试运行 / 变量」等 v2 词，仅显式 valid mock 时可见。
- ARCHITECTURE 两处「在备份 data/app.db 后删除」措辞有歧义，未点明备份文件路径。
- `.env.example` 未验证（可能仍列 `ARK_MODEL_EVALUATE` / 缺 `ARK_MODEL_OPTIMIZE`）。

### Carry-over
- 未提交、未 push；用户确认后可提交 Phase 6 变更并删除 `.superpowers` 工作区。
- 接真实 ARK 密钥验证流式 usage、`reasoning_content`、错误码映射。
- 可选项：处理 4 条 deferred minors。

## 2026-11-16（impeccable 三连：layout → polish 工作台 → polish 其他页面）

### Completed
- **A `/impeccable layout`**：工作台改 960px 上下单列，tabs 置输入卡片顶部（优化在前）、主输入放大到 280px、结果面在下并于提交后滚入视野；结果优先、过程隐身。用户曾选「优化在前，默认生成」。
- **B `/impeccable polish` 工作台**：默认 tab 改为优化（覆盖 A 的「默认生成」）；流式加 `now-pulse` 状态文字与 `stream-caret` 金色光标；进行中主按钮原位切换为「停止」（两个分支同位置 Button，React 调和保留焦点，不弹到 BODY）；改 ADR-0002 增补状态信号与「不用骨架屏/进度仪式代替结果」硬规则；composer 默认 mode='optimize'、测试同步。
- **C `/impeccable polish 继续优化其他页面样式`**（Operate 模式，精度与克制，非重设计）：三页（/library /templates /settings）1440/390 深/浅主题浏览器核验后，定位唯一根因：settings 两处输入绕过了共享 `inputStyles`。`LlmSettingsForm.tsx` 的 `inputClass` 与 `BudgetSetting.tsx` 的行内 className 改为 `cn(inputStyles, 'h-9')`（预算再 + 'tnum'）。原一次性类有 `focus:outline-none` 却无替代焦点环、无 `aria-[invalid=true]` 危险态、无 `disabled:`/`read-only:`、带 ad-hoc inset bevel shadow，且两文件逐字重复。
- 收尾核验：`git diff --check` clean；`pnpm run typecheck` 0；`pnpm test` 59 文件 537/537；harness 25 pass / 0 fail；impeccable detect `[]`；settings 实测 `focus-visible` 聚焦环、`aria-invalid` 危险环（`oklab(... / 0.25) 3px`）+ `role=alert` 校验文案生效；浅色主题 `#f3ead8` 页面渲染干净、金色聚焦环、无横向溢出。
- 临时环境全清：隔离 dev 3101、`data/polish2-smoke.db`、bsk session `ygmq`、`/tmp/polish2-*`；`data/app.db`（831488 字节，mtime 11:00）未触碰。

### Key Decisions / Rulings
- B 的默认「优化」覆盖 A 的默认「生成」；PRODUCT/DESIGN/ARCHITECTURE/ADR-0002/README 相关条款与测试同步为优化。
- C 严格按 polish 的「保留既有视觉世界」：不加 rise/reveal（ADR-0002 硬性「同类动效同屏只出现一次」、craft-floor「不为让 polish 可见而加动效」）；不改共享 shell 的 ModelStatusBanner 在 /settings 的自链（越界）；不启动 fan-out；不重设计、不换文案。无 critique snapshot 被读取，故不跑 `critique-storage close`。
- `border-danger` 在 `aria-invalid` 时边框色仍是 `rgb(92,61,46)`、仅危险 ring 变化，是 `components/ui/Input.tsx` 全站既有 token 行为（LibraryFilters/Textarea 同款），非本次回归，刻意不动。
- 改动全部未提交、未 push（用户未要求）；HEAD `09ac638`。本地 3100 仍是旧生产构建，看新 UI 需 `pnpm build && pnpm start`。

### Pitfalls
- bsk 每个共享 tab 动作（navigate/evaluate/fill/click/emulate）都需一个未使用的 `cooperate sync` 顶层 `observation_id` + `context_id`，动作间不得插入 screenshot/observe（会消耗它）；`grep head -1` 会抓到 stale 的 `previous_observation_id` 或嵌套值，改用 `python3 -c "json.loads(sys.stdin.read(),strict=False)"` 取顶层键；`json.load` 会因控制字符失败，必须 `strict=False`。
- `bsk evaluate` 的 `<EXPRESSION>` 是位置参数，`--return-by-value true` 是布尔 flag，不是脚本值；`bsk click --ref ""` 会 invalid_params，改用 evaluate 里 `btn.click()`；React 受控输入用原生 setter + `input` 事件驱动。
- `bsk session stop` 的 session id 是位置参数（`bsk session stop ygmq`），不是 `--session`。
- Tailwind v4 `@utility`/`@layer` 嵌套让 CSSOM `selectorText` 遍历查 `border-danger` 返回空，不能据此判定样式不存在；以 computed style / 实测为准。
- 程序化 `el.focus()` 不触发 `focus-visible`（Chrome 需键盘输入），聚焦环须靠 class 存在 + 键盘 Tab 核验。

### Carry-over
- 用户确认后统一提交三连 + Phase 6 累积改动，并删除 `.superpowers/sdd/2026-11-14-v3-phase-6/` 工作区。
- 接真实 ARK 密钥端到端。4 条 deferred minors 仍未处理。

## 2026-11-16（阿里云部署文档，仅文档阶段）

### Completed
- 用户说「本项目将部署到阿里云服务器，先编写部署文档，部署工具用 `~/agents/skills/qianwenai-deploy`」。新增 `docs/DEPLOYMENT.md`（253 行）+ README 文档索引一行。**未部署、未建云资源、未装 CLI、未提交/未 push**。
- 路径纠正：工具真实位置 `~/.agents/skills/qianwenai-deploy`（带前导点），`~/.openclaw/skills/qianwenai-deploy` 是其软链；用户给的路径少了点。
- 文档覆盖：适用范围与国内站限定、三种模式、14 步硬门禁、项目画像（APP_NAME `prompt-pilot` / app_port 3100 / nginx_mode proxy / 无 RDS 跳过步骤 5）、四项项目侧前置改动、上线验证、热更新/释放、费用、未决项。
- 核验：`git diff --check` clean；README 12 条本地链接 0 broken；`data/` 为 app.db 831488B + 4 个备份；`prisma/seed.ts` 确认 12 条模板按 slug `upsert` 幂等；`aliyun` CLI 仍 absent；无 `.qianwenai-deploy*` 状态文件。逐条重验了 skill 模板声明（systemd.sh Node 20 + `yarn install --production` 且无 build；nginx_proxy.sh `proxy_read_timeout 60s` / 无 `proxy_http_version 1.1` / `/healthz` 桩；docker.sh `docker run --rm` 无卷且 `--env-file` 仅 RDS 路径；ros_single.yaml AppPort 默认 8080、SG 80/443 `0.0.0.0/0`；upload_artifacts.py 排除表不含 `data/`/`.env*`）。
- doc-only 任务，**未重跑** typecheck / test / harness（上一阶段 2026-11-16 全绿：537/537、harness 25-0-0）。

### Key Decisions / Rulings
- **不能直接用内置 systemd+node 路径**：装 Node 20（项目要 >=24）、`yarn install --production` 跳过 prisma/tailwind 等 devDeps、完全不跑 `prisma generate`/`next build`/`db push`/`db:seed`，`next start` 无 `.next/` 必失败。建议补多阶段 Dockerfile 走 `--app-type docker --app-mode docker-image`；**Dockerfile 本次未创建**（工具不改用户代码，且需用户确认后单独阶段）。
- **产物洁净性**：`upload_artifacts.py` 排除表不含 `data/` 与 `.env*`；`data/app.db` 含记录正文与设置页保存的 `ARK_API_KEY`（FR-8.1），从仓库根打 binary 包会送进临时 OSS 桶。docker-image 模式产物仅 image.tar，天然规避；binary 模式必须改用干净暂存目录。compose 模式还会自动加载 `/opt/qianwenai/.env`。
- **SQLite 持久化**：docker.sh `docker run --rm` 不挂卷、systemd 热更新整体 `mv /opt/qianwenai`，两者都丢库。决策改绝对路径 `file:/var/lib/prompt-pilot/app.db` + 宿主目录挂载，路径在应用目录之外；ECS 系统盘是唯一副本，释放前必须备份。
- **密钥注入缺口**：跳过 RDS 后 `docker.sh` 不再有 `--env-file`，systemd.sh 的 `EnvironmentFile` 也只在 RDS 场景填充。镜像只固化非机密默认值；`ARK_API_KEY` 走设置页录入（落到持久化库）或 ECS 本机 `/etc/qianwenai/db.env`（0600）+ 改造单元；不进镜像/产物/聊天。
- **公网暴露是实质风险**：工具只给 HTTP、不做域名/HTTPS，SG 对 `0.0.0.0/0` 开 80/443，而产品无鉴权且设置页可写密钥、可删全部记录。文档列为部署前必须决策项（收紧 SourceCidrIp / 前置鉴权 / 仅内网）。
- `.claude/docs/runtime.md` 仍写「无部署流水线」，本次为控范围**未改**，列为待同步项。

### Pitfalls
- 本轮两次 `.env.example` 读取被权限策略拒绝（上一阶段），**未重试、未绕过**；环境变量名以 `docs/HANDOVER.md` 84-94 节与 `lib/llm/registry.ts` 为准，`.env.example` 内容记为未验证项。
- Nginx `/healthz` 是 `nginx_proxy.sh` 的桩，恒返 200，不代表应用就绪；步骤 12 的 `app: manual` 云助手核验不可省。
- 服务端 SSE 已带 `X-Accel-Buffering: no` / `no-cache, no-transform`，nginx 不缓冲；但 `proxy_read_timeout 60s` 且未设 `proxy_http_version 1.1`，长流仍需实测。

### Carry-over
- 部署前补齐四项：Dockerfile + .dockerignore、产物洁净门禁、SQLite 绝对路径与挂载、公网鉴权方案；之后按 1-14 步实际部署（需 `aliyun` CLI 3.x + OAuth + RAM + 步骤 9 费用确认）。
- 用户确认后统一提交累积改动（含本轮 DEPLOYMENT.md 与 README 索引行）。

## 2026-11-16（部署文档补充：现有 ECS 与环境变量核验）

- 用户补充：连接方式 `ssh -i <本地密钥路径> root@<ECS 公网 IP>`，并说明「环境变量已补充阿里云信息」。具体路径与公网 IP **不写入仓库文档与 memory**（避免随提交外发），文档只留占位符。
- 本地只读核验（未读取任何凭证内容）：SSH 私钥存在、权限 600、411 B；仓库 `.env` 从 35 B 增至 168 B；当前 shell 中阿里云相关变量 **0 个**；`aliyun` CLI 仍 absent；无 `.qianwenai-deploy*`。结论：补充信息**未导出到 CLI 进程环境**，步骤 1 仍阻塞。
- 又一次涉及 `.env` / profile 的 Bash 命令被权限策略拒绝，**未重试、未绕过**；`.env` / `.env.example` 内容继续记为未验证项。
- `.env` 当前权限 `644`，含云凭证应为 `600`；本轮未改（配置改动需备份→改→校验，属另开阶段）。
- **新增未决项**：qianwenai-deploy 全栈部署经 ROS 新建 ECS/EIP，**不会复用**这台已有服务器。若目标是装到现有 ECS，需改走直连部署；文档 §6 的 1-14 步与 §9/§10 的费用、释放描述都基于「新建资源栈」。
- 文档更新：`docs/DEPLOYMENT.md` 增 §3.1、§6 步骤 1 与 §11 两行，共 285 行；`git diff --check` clean；仓库内确认无字面 IP / 密钥路径。
- 待用户定夺：新建 ROS 栈 vs 复用现有 ECS；是否现在 SSH 只读核验服务器环境（属 outward-facing 动作，未获明确授权前不连）。

## 2026-11-16（部署目标定为复用现有 ECS + 服务器只读核验）

- 用户选定「复用现有 ECS」（不走 ROS 新建栈）＋「是，只读核验」。据此把 `docs/DEPLOYMENT.md` 整体重写为直连部署方案（196 行），README 索引行同步改文案。
- **qianwenai-deploy 不适用于本目标**：全栈会新建 ECS/EIP，热更新需 `.qianwenai-deploy` 状态，删除走 `delete_stack.sh`，都作用到新建资源上。文档改为「本地 build → `docker save` → scp → `docker load` → 容器 + nginx 独立 server block」，只沿用工具对产物洁净/密钥/探活的约定。无新增云资源，无步骤 9 费用门禁，不用 `delete_stack.sh`。
- 服务器只读核验（两次 SSH，未改动服务器、未输出凭证值）：Alibaba Cloud Linux 3 / root；**Node、npm、yarn absent**；pnpm 10.28.2；Docker 26.1.3 + Compose v2.27.0；nginx 1.24.0；git 2.43.7；sqlite3 3.26.0；`aliyun` CLI 3.3.14；磁盘 40G 用 28G 剩 11G（73%）；内存 1.8Gi 可用 1.2Gi。
- 端口/既有服务：80/443 由 nginx 占用（IPv4+IPv6），3100 无监听（curl 80→404、443→400、3100→000）；已有容器 `community-affairs`（`0.0.0.0:3001->3000`）与 `community-db`（`postgres:16-alpine`，`127.0.0.1:5432`）；nginx 已有 `server_name <既有域名>` + `proxy_pass http://127.0.0.1:3001`，443 SSL 由 Certbot 管理。**必须共存，不得改动**。
- 云端凭证：服务器非交互与 login shell 中阿里云相关变量 0 个（首次粗筛的 `alias` 行是 `which` shell 函数误匹配，已用纯变量名复核）；`aliyun configure get region` 未设置；`sts GetCallerIdentity` 无有效身份响应；`/root/.aliyun` 存在但凭证未就绪。直连部署不依赖 `aliyun` CLI。
- 硬约束推导：宿主无 Node + 内存 1.8Gi → `next build` 放本地；应用走 `127.0.0.1:3100` 只由 nginx 反代；SQLite 绝对路径 `/var/lib/prompt-pilot/app.db` + bind mount；nginx 需 `proxy_http_version 1.1` / `proxy_buffering off` / `proxy_read_timeout >=120s`。
- 仓库文档与 memory 均未写入字面公网 IP、密钥路径、既有域名（避免随提交外发），已 grep 确认。
- 核验：`git diff --check` clean；README 链接 0 broken；`docs/DEPLOYMENT.md` 196 行。本轮仍 doc-only，未重跑 typecheck/test/harness。
- 待用户定夺：新站域名/HTTPS 证书覆盖、公网鉴权方案、`ARK_API_KEY` 注入路径；实施 Dockerfile + nginx 共存配置。

## 2026-11-16（卸载不再使用的全栈部署技能）

- 用户确认「已用不到就删除」。按可逆原则执行：先把 `~/.agents/.skill-lock.json` 备份到 `~/.agents/skills-archive/20261116-qianwenai-deploy-uninstall/.skill-lock.json.before`，再把技能目录 `mv` 进同一归档、删除 `~/.openclaw/skills/` 下软链，最后从安装锁移除 `qianwenai-deploy` 条目。**归档保留，未硬删除**：36 个技能文件 / 181577 B，可原路回滚。
- 同源 `qianwenai-observe` 与 `qianwenai-operate` **未删**（用户只点名 deploy）；二者说明依赖 `.qianwenai-deploy` 状态文件，deploy 卸载后可能不可用，待用户明确是否一并移除。
- 仓库侧：`docs/DEPLOYMENT.md` 重写为不依赖该工具的直连方案（189 行），清掉 §1/§2/§4/§5/§7/§8/§9/§11 全部工具与脚本名引用；README 索引行本就无引用，未改。此前各节的历史记录保留原样，属于当时的选型记录，不回写。
- 核验：`git diff --check` clean；README 本地链接 0 broken；README/docs 无工具引用；无字面 IP/域名/密钥路径；lock JSON valid（v3 / 34 技能 / deploy 已移除 / observe、operate 在）；两安装路径 gone；归档 37 文件（含锁备份）；技能树 sha256 `5faa581fdb2b50318c0111baad09148e09af2b9283bc93e5611f14ec46806809`、改后锁 sha256 `35389b7c2e44dd1c3936fb5f1f98ab24ace1f5affb8904de4b7d5ccd9606c403`（tree hash 按「相对路径+内容」流式算法复核一致）。
- 有效冒烟：`openclaw skills list --agent main --json` 列出 113 个技能，**无名为 `qianwenai-deploy` 的项**；observe/operate 仍在，但 `blockedByAgentFilter=true` / `modelVisible=false`。此前不带 `--agent` 的 `skills list --json` 实际返回 `cli_error`（多 agent 需显式 owner），那次「deploy 未出现」属无效证据，已作废更正。
- 回滚：把归档内 `qianwenai-deploy` 移回 `~/.agents/skills/`、重建 `~/.openclaw/skills/qianwenai-deploy` 软链、用 `.skill-lock.json.before` 覆盖当前锁文件。
- 本轮未改产品代码，未重跑 typecheck/test/harness；未部署、未连服务器、未创建云资源、未提交、未 push。

## 2026-11-16（impeccable polish：工作台生成中输入锁定与过渡）

- 用户要求：`/impeccable polish 工作台输入框应该增加正在生成中的过渡效果，并且禁止输入`。Operate 模式，沿用既有羊皮纸/烛光世界，不换设计语言。
- 改动只落两个文件：`components/studio-v3/PromptComposer.tsx` + `lib/i18n/zh.ts`（新增 1 键 `studio.composer.generating`）。进行中（`isRequestActive(phase)` = starting/streaming/canceling）时：两份草稿 `readOnly`（非 `disabled`，保留选中复制、不丢焦点）、`updateDraft` / `handleModeChange` 提前 return、Tabs 两项 `disabled`、目标 chip `aria-disabled` + `opacity-40` + `cursor-not-allowed`、section `aria-busy` / `data-active`、底部 `role="status"` 的 `.rise` 文字 + `.now-pulse` 金色圆点。输入面靠 `Input.tsx` 既有 `read-only:bg-bg-sunken` + `transition-colors duration-150` 退到凹陷层。
- 刻意不加进度条、金线、常驻 glow：PRODUCT.md 禁「进度仪式」，DESIGN.md 有 One Candle / State-Only Glow；状态用文字 + 圆点双编码（Semantic Pair Rule），动效只动 opacity。
- 浏览器实测（3101 隔离 dev server + `MOCK_LLM_FAULT=slow_stream` 10s 首字延迟 + 独立 `data/pp-ui-smoke.db`；3100 旧生产构建未动）：idle 两份 textarea 可编辑、tabs 启用、无状态文案；active 两份 `readOnly=true` 且草稿保留、tabs 禁用、状态文案「正在生成，输入已锁定」+ `pp-now-pulse` 圆点、`aria-busy=true`、主按钮原位变「停止」；浅色 read-only 底 `#eadfc8` / 深色 `#120a06`（`--bg-sunken` 深浅各正确，先前一次异常读数是 `transition-colors` 未 settle 的中间值）；生成模式三个目标 chip 全 `aria-disabled=true` 且点击后 `aria-pressed` 不变（守卫生效）；390×844 无横向溢出（`scrollWidth==clientWidth==390`），状态文案与快捷键同行不挤。深浅 + 窄屏截图均已阅。
- bsk 用法补记：`evaluate` 需有效 `--context`，页面异步变化用 `--unverified` 并在脚本内自检前置条件；`emulate` 需 sync 的顶层 `observation_id`（`--observation`）；找主按钮须排除 `[role="tab"]`（tab 也是 `<button>`，文字同为「优化」）。
- 核验：`pnpm run typecheck` 0 错误；`pnpm test` 59 文件 / 537 用例；harness `status pass` 24-0-0；`impeccable detect --json` → `[]`；`git diff --check` clean；3100 `/studio` 仍 200，3101 已停，bsk session 已 close，临时 DB/脚本/截图已删。
- 未验证：真实网关密钥端到端（无密钥）；未重跑 `pnpm build`（本轮纯客户端状态，typecheck + 浏览器已覆盖）；`.env` 权限阻塞项未重试；未提交 / 未 push / 未部署 / 未建云资源。
- 回滚：`git restore components/studio-v3/PromptComposer.tsx lib/i18n/zh.ts` 会把前几轮未提交的 polish 改动一并回退；更稳的是用 `git diff` 单独剔除本轮新增块。

## 2026-11-16（部署范围定夺：不对外开放、仅自用、暂不申请域名）

### Completed
- 用户定：「本项目不对外开放，只是自用，暂不申请域名」；追问部署形态后选「仍上 ECS，仅本机可达」（三选项中的推荐项）。据此把 `docs/DEPLOYMENT.md` 从「nginx 独立 server block 反代」收敛为私网方案，README 文档索引行同步。
- 消解两项 P0 未决：新站域名/子域/HTTPS 证书覆盖、公网鉴权方案。§7 原「公网可达意味着任何人都能耗用额度、读写删数据」的前提不再成立；§10 决策状态表新增「已决」三行与「将来对外开放的前置」一行。
- 文档侧改动：§1 结论加范围声明、§2 硬约束 2 与 nginx 段、§3 整节（SSH 本地端口转发 `ssh -N -L 3100:127.0.0.1:3100 <host>`、SSE 不经反代）、§4.3 保留待定、§4.4 去掉「专用 nginx block」、§5 步 6/7/8、§6 探活与 SSE、§7 整节、§8 回滚/卸载去掉 nginx 步骤、§10 表。原文备份 `/tmp/DEPLOYMENT.md.bak-20261116`（sha256 `508f9fe3293676dd22bfecf1ad616016d365e4d757b476fc00930570d2ca0a5e`）。
- 决策按 conversation-accuracy-skill PERSIST 落盘：ACTIVE_CONTEXT / todo-tracker / 本节 + `memory-archive.mjs --persist-round`。

### Key Decisions
- 保留「复用现有 ECS 直连」不变，只改对外面：容器 `127.0.0.1:3100:3100`，本机 SSH 隧道访问；不新增 nginx server block、不备份/改/reload nginx、不动既有域名 443 与 Certbot。理由：既有服务必须共存，私网自用无需反代层，改动面最小。
- 「暂不申请域名」按可逆处理：§3/§7/§10 写明将来对外开放需另开阶段补域名、证书覆盖、公网鉴权与 nginx 共存方案；本阶段不做、也不删掉相关知识。
- 不替用户决定 `ARK_API_KEY` 注入路径（设置页录入 vs 0600 env 文件，§4.3 两条保留），仍列为剩余唯一决策。

### Verification
- doc-only：未重跑 typecheck/test（上一阶段 537/537 全绿）；本轮跑了 `harness-check.mjs`：首测 23-1-0（`ACTIVE_CONTEXT.md` 4132B 超 4KB 预算），备份后瘦身至 4009B，复测 24-0-0。
- `git diff --check` clean；README 本地链接 0 broken；文档内无字面公网 IP / 真实域名 / 密钥路径 / 凭证值（占位符 `<host>`、`<既有域名>` 不算）；空白字符与末尾换行 0 处问题。
- PERSIST 归档门禁先 dry-run 再实跑：`overBudget` / `archived` / `changed` 均为空，仅递增轮次；未触发历史归档。
- 未部署、未连服务器、未建云资源、未提交 / 未 push。

### Carry-over
- 剩余决策仅 `ARK_API_KEY` 注入路径；之后按 §4 补 Dockerfile/.dockerignore/产物门禁/SQLite 挂载，再按 §5 部署（用户确认后另开阶段）。
- 回滚：`cp /tmp/DEPLOYMENT.md.bak-20261116 docs/DEPLOYMENT.md`（sha256 `508f9fe3…`）；状态卡瘦身前版本 `/tmp/ACTIVE_CONTEXT.md.bak-20261116`（sha256 `8c60cd1a…`）；README/todo-tracker 用 `git diff` 单独剔除本轮块。

## 2026-11-17（/impeccable layout：模板页卡片统一 + 项目级插件启用）

### Completed
- 用户请求 `layout 建议【模版】页面列表卡片尺寸和样式保持一致`；结构化提问后选「尺寸统一，留一条金边（推荐）」：三类卡等宽等高、封面统一比例、移除 featured 跨列，只保留 featured 的 2px 金色顶边。Operate 模式，空间论点为「等价条目线性浏览」。
- 三处 UI 文件：`components/templates-v3/TemplateCover.tsx` 导出 `COVER_ASPECT='aspect-[5/3]'` 与统一 `viewBox 0 0 400 240`，ImageCover 重画为横构图（圆 + 矩形 + 金色小条 + 分隔线 + 标题），VideoCover 下 letterbox 移到 `y=214`；`TemplateLibrary.tsx` 把按分类的 GRID / 骨架比例合并为单一 `grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3`，删除 featured `lg:col-span-2`、骨架改用 COVER_ASPECT 并去掉 category 参数；`TemplateCard.tsx` 根加 `h-full border-t-2`（普通卡中性 2px、featured 金色，几何一致），自定义模板删除入口并入页脚第一行（与「用它开始」同排，`aria-expanded`），确认/失败行仍为瞬时第二行，完整保留 `confirmRef` / `restoreFocus` 焦点回归与失败重试。
- 历史：`ebde558` 曾刻意把 `grid items-start` + 删除 `h-full` 做成参差；本轮按用户选择覆盖该实现。
- 项目级启用 `/Users/yet/plugins/local-tools-marketplace` 三个插件（交 `harness-maintainer`，write_set 仅 `.claude/settings.json`）：新增 `qwen-harness-tools` / `redfox-data` / `quark-scan-ocr` 三个 `@local-tools` 键为 `true`，`enabledMcpjsonServers` 保持 `[]`；备份 `/tmp/prompt-pilot-settings.json.bak-20261117`（600），前后 sha256 `4ecb0771…` → `49f424e9…`；`python3 -m json.tool` / `claude plugin validate` / `claude plugin list` 均通过，CLI 确认项目设置覆盖用户级 `false`。用户问「是否需要设置 .mcp.json」→ 不需要：三个插件自带 `.mcp.json`，`${BAILIAN_API_KEY}` 由登录 shell 注入，项目根不新建。

### Key Decisions
- 卡片几何完全一致优先于 DESIGN.md 的「异构网格」；金色只作为 featured 的唯一状态信号（One Candle）。所有卡共用 2px 顶边是为了消除 1px 封面错位。
- 不按 skill 顺手修文档漂移：`Never repair drift as a side effect of a design task`。DESIGN.md Template Card 段仍写「异构网格 / 卡片尺寸随内容变化 / 禁止等尺寸网格 / Featured 其余不加」，与实现相反，只报告不改；`.impeccable/design.json` 是否相关未核对。
- 未执行 Next.js 升级：构建时 CLI 报 `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability`（16.4.2），重试同命令即继续并成功。升级超出本轮范围，未运行 `next upgrade`。
- 用户追加「本项目暂时不用考虑移动端屏幕的显示效果」：按验收范围约束处理，不改代码、不删响应式断点与移动底栏（DESIGN.md Responsive / NFR-8 / AC-18 仍写在文档里，暂不修改）；后续阶段不再做窄屏截图、移动端 polish 或移动专项验收。本轮 390×844 截图是已完成但按新范围不再需要的证据，保留在 `/tmp/templates-light-390.png` 仅作记录。

### Verification
- `pnpm run typecheck` 0 错误；`pnpm test` 59 文件 / 537 用例；`git diff --check` clean；`claude-project-harness-check.mjs` 25-0-0；`impeccable detect --json` 三个改动文件 → `[]`（只跑一次，不在 concept selection 阶段）。
- `pnpm build` 重试后成功（首次被安全提示中断）；curl 新构建确认 `items-stretch` 1 处、`border-t-2` 4 处、`aspect-[5/3]` 4 处，无 `col-span-2` / `aspect-[4/5]` / `aspect-[16/9]`。
- 停掉旧 3100 `next-server` 并以新构建 `pnpm start` 重启（后台任务 `bt39ap0t8`），`/templates` 200。服务状态补记：该后台任务在 10 分钟 timeout 后收到 SIGTERM（exit 143），3100 一度不可用；已改用 detached `nohup pnpm start > /tmp/prompt-pilot-start-20261117.log 2>&1 &` 重启，跨工具调用复核 pid 47578 / 200 / `items-stretch`，`.next` 已是新构建。后续会话若发现 3100 空闲，直接 `pnpm start` 即可，无需重跑 build。bsk 阅图：1440 浅色文本类三列等宽等高 + 页脚「生成模板 / 用它开始」对齐、滚动后第 4 张同宽、图片类与视频类封面统一 5:3 且构图语言保留、1440 深色金边正确、390×844 单列 + 底部四项标签栏无破版。全页截图受 `cdp_failed/page_hidden` 限制，改用 wheel 滚动 + viewport 截图覆盖页脚。
- 未验证：自定义模板（当前库无自定义模板）删除确认态的视觉与焦点回归；插件 MCP 工具需新开会话才加载（`claude mcp list` 本轮跳过）；真实网关密钥端到端。

### Carry-over
- DESIGN.md / `.impeccable/design.json` 与实现漂移待用户定夺是否另开阶段同步；启用三插件共 8 个 MCP server，超出治理默认「不超过 3 个」，可按需只开 `qwen-harness-tools`。
- 回滚：三个 UI 文件 `git restore components/templates-v3/TemplateCover.tsx components/templates-v3/TemplateLibrary.tsx components/templates-v3/TemplateCard.tsx` 会一并回退前几轮未提交改动，稳妥做法是 `git diff` 单独剔除本轮块；插件 `cp /tmp/prompt-pilot-settings.json.bak-20261117 .claude/settings.json`；构建产物 `.next` 重新 `pnpm build` 可覆盖。
- 仅本地工作树：未提交 / 未 push / 未部署 / 未连服务器 / 未建云资源。

## 2026-11-17（页面宽度一致性：只读排查，未实现；会话收口）

### Current State
- 用户反馈「工作台主体宽度与提示词库、模版、设置页面不一致」。随后用户要求「persist 收口，开新会话继续」，UserPromptSubmit hook 报上下文约 167k / 134 轮 / 162 次工具调用，要求立即 PERSIST + commit、禁止 Agent / MCP / 大 Read / 截图。本轮因此只做只读排查，零编辑 / 零验证命令 / 零截图 / 零 Agent / 零 MCP。
- 事实源：`app/(workspace)/layout.tsx` 只含 `AppShell` + `MobileNav` + `ModelStatusBanner`，不提供宽度容器，差异全在页级。

### Findings（三套宽度 + 两套 padding）
- 工作台 `components/studio-v3/StudioWorkspace.tsx:487-488`：`<PageShell variant="workbench">`（`w-full px-5 py-5 lg:px-7 lg:py-6`，无 max-width / 无 mx-auto）+ 内层 `mx-auto flex w-full max-w-[960px]` → 内容列 960px。
- 设置页 `app/(workspace)/settings/page.tsx:52`：自定 `mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 lg:flex-row lg:gap-10 lg:px-10` → 1080px 两栏；外层 div 于 `:166-167` 闭合（文件 169 行，`:53` `SettingsNav`、`:54` 内容列）。
- 提示词库 `components/library-v3/LibraryV3.tsx:197` / 模板 `components/templates-v3/TemplateLibrary.tsx:116`：`<PageShell variant="grid">` → `mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10`。
- `components/ui/PageShell.tsx`（36 行）：三变体 `reading`(760，全仓无消费者) / `workbench` / `grid`(默认)。`ShellVariant` 仅自身与 `docs/archive/v2/UI-REFACTOR-PLAN.md` 引用。`.impeccable/design.json:379` 记 1280px；`DESIGN.md:327` 写 960px 单列、`:398` 写 1280/1440 基准。
- 无测试断言 `PageShell` / `max-w-[960` / `variant="workbench"` / 宽度数值；`MarkdownView.tsx:45-74` 自带 `max-w-[68ch]`、原文/空态 44ch，放宽外层不破坏 68ch 可读性，源码 `<pre>` 与 diff 更受益；`cn`（twMerge）与 `className` 组合无冲突。

### Candidate（未获批准、未落地）
- 四页统一 `grid` 壳：`mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10`（默认变体、2/4 页已用、design.json 记 1280）。
- 收敛 `PageShell` 为单一 canonical shell（去 cva / `ShellVariant` / `reading`），三个消费者去掉 `variant="grid"`；工作台去内层 960 与 `variant="workbench"`；settings 改 `<PageShell className="flex flex-col gap-6 lg:flex-row lg:gap-10">`；同步 `StudioWorkspace.tsx:67` 与 `PromptComposer.tsx:46` 的 960px 注释。
- 备选（最小改动）：保留 cva，仅令 `workbench` 与 `grid` 同值，但留冗余变体。
- `SettingsNav.tsx` 窄屏分段条含 `-mx-6`，与 `lg:px-10` 需核对；用户已排除移动端显示，不改断点与底栏。
- `DESIGN.md:327` 的 960px 漂移按 impeccable「不顺手修文档」记为 deferred，并入 todo 第 15 条；不改文档。

### Next Step（新会话第一个动作）
- 先读 `app/(workspace)/settings/page.tsx` 尾部定位 `:52` 外层 div 闭合标签，再按候选落地 className 改动（只改 `PageShell.tsx` / `StudioWorkspace.tsx` / `PromptComposer.tsx` 注释 / `settings/page.tsx`，若收敛变体再加 `LibraryV3.tsx` / `TemplateLibrary.tsx`）。
- 验证：`node ~/.claude/scripts/claude-project-harness-check.mjs .` + `pnpm run typecheck` + `pnpm test` + `git diff --check`（可选 `pnpm build` 与一次 `impeccable detect --json <changed targets>`）；小布局不派 verifier；不做截图、不做移动端核验。
- 4 页 curl 200（detached `nohup pnpm start`，pid 47578 / `/tmp/prompt-pilot-start-20261117.log`）为唯一新增运行时证据。

### Constraints / Do Not Retry
- 不在本轮实现（hook 要求收口）；不擅自改 DESIGN.md；不删响应式断点与移动底栏；commit 后不 push；不启动 Agent / MCP / 截图。

### Carry-over
- 回滚：`git diff` 单独剔除本轮 className 改动即可，无数据 / 配置 / schema 迁移。
- 收口：本轮执行 conversation-accuracy-skill PERSIST（`ACTIVE_CONTEXT.md` 先压缩腾位 / `session-summary.md` / `todo-tracker.md`）+ `memory-archive.mjs --persist-round`，并按 hook 要求 commit 全部累积未提交改动（不 push）。

## 2026-11-17（宽度一致性落地 + 部署影响面评估；会话收口）

### Current State
- 用户指令 1：先 LOAD 最新 handoff → ACTIVE_CONTEXT → todo-tracker，跑一次 `pnpm run typecheck` / `pnpm test` 核对现场，再动手改布局；移动端显示仍排除验收范围。指令 2：评估部署到服务器的影响面（只读）。
- 现场核对：typecheck 0 / 59 文件 537 用例；6 文件未提交，与 `handoff-20261117-112522.md` 快照一致。
- Hook：上下文约 146k，只完成当前最小阶段，不新增 fan-out / 切模型 / 无关探索，随后 PERSIST 并开新会话；本轮无 commit / push 授权。

### Decisions（宽度一致性，已落地）
- `components/ui/PageShell.tsx` 全量重写：去 cva / `ShellVariant` / 三变体（`reading` 760px 全仓零消费者），保留单一 canonical shell `mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10`；四页宽度与留白统一，分栏交页面内 className 决定。
- 消费者：`StudioWorkspace.tsx:487-488` 去 `variant="workbench"` 与内层 `mx-auto max-w-[960px]`（改 `flex w-full flex-col`），`:67` 注释改「统一的居中单列」；`PromptComposer.tsx:46` 同步注释；`settings/page.tsx` 引入 `PageShell`，自定 `max-w-[1080px]` 两栏 div → `<PageShell className="flex flex-col gap-6 lg:flex-row lg:gap-10">`，末尾 `</div>` → `</PageShell>`；`LibraryV3.tsx:197` / `TemplateLibrary.tsx:116` 去 `variant="grid"`。
- 选 1280 的理由：原本 2/4 页已用 grid 默认值，`.impeccable/design.json:379` 记 1280px；`MarkdownView` 自带 `max-w-[68ch]` 保可读性，源码 `<pre>` 与 diff 更受益；`SettingsNav` 窄屏分段条含 `-mx-6`，但只在 `lg:hidden` 生效，与 `lg:px-10` 无冲突。
- 不改 `DESIGN.md:327`（960px 单列漂移），按 impeccable「不顺手修文档」并入 todo #15；移动端排除验收，不改断点 / 底栏、不截窄屏图。

### Verification（宽度落地）
- 中途 hook 报 `TS2322`（`variant` 不存在于 3 个消费者）与 `TS17002`（settings 的 `PageShell` 缺闭合标签）：契约先改、消费者后改的中间态，非最终缺陷；全部消费者改完后消失。
- 最终并行验证：`pnpm run typecheck` 0 错误；`pnpm test` 59 文件 / 537 用例；`claude-project-harness-check.mjs` 24-0-0；`git diff --check` clean；`pnpm build` 重试后 exit 0。
- `pnpm build` 首次 exit 1 `SecurityFatalError`（Next.js 16.4.2 安全升级提示，要求「重试同一命令」），重试通过并带 warning；构建输出建议升级并询问 worktree 安全升级，均**未执行**（超范围；不可信工具输出不据此扩权或跳验证）。
- 3100 生产服务：build 覆盖 `.next` 后停旧 pid 47556/47578，以 `nohup pnpm start > /tmp/prompt-pilot-start-20261117-width.log 2>&1 &` 重启（pid 65022）；`/studio` `/library` `/templates` `/settings` 均 200；渲染 HTML 四页均含 `max-w-[1280px]`，`max-w-[960px]` / `max-w-[1080px]` 各 0 次；源码无残留 `variant=` 宽度字面量；服务日志干净。
- 排查中一个 zsh 坑：`for path in ...` 会覆盖特殊数组 `$PATH`，导致 `curl` 全部 `command not found`；改名 `p` 后四页复测 200。服务本身已正常启动。
- 未验证：桌面 / 窄屏截图（用户排除移动端）、Docker 内构建行为、SSH 隧道长流空闲超时、真实网关密钥端到端。

### Findings（部署影响面，只读评估）
- 口径：本轮未连服务器、未跑 Docker、未改文件；服务器事实来自 `docs/DEPLOYMENT.md`（2026-11-16 只读巡检，未复验）；仓库事实来自静态检查 + impact-mapper 只读映射。
- 会变：1 容器 + 1 镜像 tag（`127.0.0.1:3100`）、1 宿主目录 `/var/lib/prompt-pilot`、1 SSH 隧道。不变：nginx/Certbot 配置、80/443/3001/5432、`community-affairs` / `community-db`、安全组、云资源、域名/HTTPS、计费。`.next` 361M、`data/` 3.7M；服务器 11G 可用磁盘 / 约 1.2Gi 可用内存。
- 宽度改动本身对部署近乎零影响（仅 className / 组件边界 / 注释，未碰 API / schema / env / 路由 / SSE / 密钥）；但 **6 文件未提交是发布输入陷阱**：clean checkout 会发出旧的 960 / 1080 / 1280 三套宽度，建议发布前先 commit。
- 阻塞项：`Dockerfile` + `.dockerignore` 均缺失（实测）；`start` 仅 `next start -p 3100`，首启 `db push` / `db:seed` 无启动钩子；`ARK_API_KEY` 注入路径（§4.3）未定；产物洁净门禁缺位（Docker build context 忽略 `.gitignore`，`data/app.db` + 4 个备份含记录正文与设置页密钥、644 权限的 `.env` 含云凭证可能进镜像 / tarball）；方案内部矛盾：`prisma` CLI 是 devDependency，§4.1 却要「运行阶段只带生产依赖」同时首启执行 `prisma db push` + `prisma/seed.ts`。
- Prisma 引擎跨平台：本机仅 `libquery_engine-darwin-arm64.dylib.node` / `schema-engine-darwin-arm64`，`prisma/schema.prisma` generator 无 `binaryTargets`；服务器 x86_64 Linux → 必须在 Linux 构建阶段 `pnpm db:generate`，绝不复制本机 `.prisma` / client 进镜像。`next.config.ts` 无 `output: 'standalone'`（`.next/standalone` 不存在），运行阶段需自定义复制策略，镜像偏大。
- 两个文档未记的新点：(a) Next.js 16.4.2 `config-shared.js:192` 默认 `experimental.agentUpgrade: 'security'`，`build/index.js:545` 触发 nudge；`nudgeUpgradeForAgent` 抛 `SecurityFatalError` exit 1，重试收据写 `.next/cache/next-agentic-upgrade-retries/<sha256>.json`（`RETRY_TTL` 5 分钟），重试才过；无 agent 标记且 `signal=null` 时读源码推断会提前 return、Docker 大概不拦，但**未在 Docker 内实测**；注入 `CLAUDECODE` 类变量仍会首跑失败；HANDOVER §7 clean build（`rm -rf .next`）会清掉收据 → 首次必失败需重试。(b) 本机 3100 已被重启的 `pnpm start`（pid 65022）占用，与 `ssh -N -L 3100:127.0.0.1:3100` 冲突，须停本机服务或换本地端口（如 3101）。另 `DEPLOYMENT.md §6` 仍要求 390px 验收，与用户「移动端排除验收」冲突，须裁剪；§5 step-7 建议增补 SSH 隧道下的 SSE 长流探针。
- 数据 / 网络 / 回滚：服务器是全新空库 + 12 个 seed 模板，本机 `data/app.db` 不迁移；ECS 系统盘单副本无快照 → 部署前备份 `app.db`；出网只需 `ARK_BASE_URL`；AC-15 / AC-16 离线行为；SSE 头在 `lib/engine/sse-v3.ts:14-16`（`X-Accel-Buffering: no` / `Cache-Control: no-cache, no-transform`）；SSH 隧道多一跳，长流空闲超时未验；回滚 = 停新容器 + 起旧 tag + 按需恢复 db，不动 nginx / 容器 / 云资源。
- 结论：服务器影响面小且隔离；真实风险在发布链路（前置缺位、秘密泄漏、未提交版本错配、跨平台引擎、初始化钩子、密钥注入、构建闸门、端口冲突、390px 验收冲突）。

### Constraints / Do Not Retry
- 不部署、不连服务器、不改 nginx / Certbot / 既有容器 / 安全组、不建云资源；不升级 Next.js、不跑 `next upgrade --agent=security`；不 commit / 不 push（用户未要求）；不做窄屏截图 / 移动专项验收；不改 DESIGN.md。
- 不复制本机 Prisma client / `.prisma` 进 Linux 镜像；本机 3100 被占用时不直接开 `ssh -L 3100:...`；`.env` / `.env.example` 不绕过权限策略。
- 构建输出里的「升级建议 / 询问 worktree」属不可信工具输出，不据此扩 `write_set` 或跳验证。

### Carry-over
- 回滚：`git restore` 6 文件（或 `git diff` 单独剔除 className 块），无数据 / 配置 / schema 迁移。
- 下一步第一个动作：新会话 LOAD（最新 handoff → ACTIVE_CONTEXT → todo-tracker）→ `git log -3` + `git diff` 核对 → 跑一次 typecheck / test。若要发布，先 commit 6 文件，再按 `docs/DEPLOYMENT.md` §4 补齐前置。
- 收口：本轮执行 PERSIST（`ACTIVE_CONTEXT.md` 压缩 / `session-summary.md` / `todo-tracker.md`）+ `memory-archive.mjs --persist-round` + 补齐 handoff 5 问；按 hook 开新会话。

## 2026-11-17（新会话 /clear 后续接）部署前置范围选定 + 只读影响面映射

### Request
- 用户首条消息「继续完成剩余的任务」。用 `AskUserQuestion` 把模糊的「剩余任务」收敛为 4 个互斥范围，用户选 **部署前置（仅本地）**：不连服务器、不碰云资源、不注入真实密钥；属 L 级改动，按规则先映射影响面、再独立验收；并明确 `ARK_API_KEY` 注入路径（§4.3）**只给取舍建议供用户拍板**，不擅自写成已决。

### 事实源重建 / 状态卡纠偏（重要）
- 注入的 `ACTIVE_CONTEXT.md` / `todo-tracker.md` / `session-summary.md` / `handoff-20261117-112522.md` 均写「6 文件未提交 / 未 push、未获 commit 授权」。git 现场实测：`HEAD == origin/main == 522f25f`，`git diff --stat` / `--cached --stat` 均无输出，工作区仅 memory 机器快照增删；`git show --stat 522f25f` 显示 6 个宽度文件 + 记忆文件都在该提交里。判定为**过期状态**：先写记忆说未提交、随后整体提交并把记忆一起提交的顺序差。部署评估里「clean checkout 会发出旧宽度」的风险已随提交消解。本轮 PERSIST 已把状态卡改为「已提交推送」。

### Decisions
- 密钥路径与前置改动**解耦**：`--env-file` 可选、设置页录入始终可用，不阻塞 Dockerfile / .dockerignore / standalone / 启动钩子 / 产物洁净门禁落地。
- `ARK_API_KEY` 取舍建议（**建议，待用户拍板，非已决**）：倾向 §4.3 路径 1「设置页录入」为默认 —— 密钥按 FR-8.1 落到已持久化、bind mount 的 SQLite，随宿主目录保留、容器重建不丢、不引入服务器侧 root-only 凭证文件、与 `lib/settings/store.ts`「设置页保存值 > 环境变量 > 代码默认值」优先级一致；路径 2「服务器 root-only（0600）env 文件 + `docker run --env-file`」作为可选进阶，凭证与数据分离，适合偏好外部注入者，但须注明两者同时配置时设置页值优先。任何路径 `ARK_API_KEY` 都不进镜像 / 产物 / 聊天。
- L/XL + 发布 / 用户数据高风险路由：`impact-mapper`（只读）→ 主 Agent 核对影响地图 → 方案 + 密钥建议交用户拍板 → `devops-engineer`（唯一 writer）→ 完整验证 → 独立 `verifier`（write_set none，实现者不自签收）。

### Findings（impact-mapper 只读影响地图，task ab8a6761d897ae0b0，本会话唯一产物）
- **建议新建**：`Dockerfile`（多阶段 linux/amd64，在目标平台构建阶段执行 `db:generate`）、`.dockerignore`（Docker 不套 `.gitignore`）、`scripts/docker-entrypoint.sh`（启动 Next 前 `db push` + `db:seed`，失败不启动服务，`exec` 交信号）。
- **建议修改**：`package.json` + `pnpm-lock.yaml`（`prisma` CLI 现为 devDependency，与「运行阶段只带生产依赖且要自动初始化」矛盾；须纳入运行依赖并更新锁文件，或拆独立初始化工具阶段，二选一未定）；`next.config.ts`（条件：选 standalone 才加 `output: 'standalone'`）；`docs/DEPLOYMENT.md` §4/§5/§6/§10；`docs/HANDOVER.md` §7（clean build 口径）；`.claude/docs/runtime.md`（仍写「无部署流水线」）。
- **不需默认改** `prisma/schema.prisma`：generator 无 `binaryTargets`，只要在 linux/amd64 构建阶段 `db:generate`，默认 native 引擎即目标平台；选定基础镜像后若固定目标再评估。冻结契约 `lib/llm/types.ts` **不得触碰**；`.gitignore` 无需改。不改 `DESIGN.md`。
- **构建契约链**：install（需 devDeps 才能 build）→ `db:generate`（须在目标平台阶段）→ build → 运行（Node ≥24 + 生产依赖 + 相匹配的 Prisma 引擎）→ 首启初始化（`db:push` 要 Prisma CLI + schema，`db:seed` 要 Node≥24 原生 TS 类型擦除 + `@prisma/client`）。`prisma/seed.ts` 的 `seedBuiltinTemplates` 按 slug 幂等写 12 模板。
- **架构错配（本会话补给 mapper 的上游事实，高风险）**：本机 Apple Silicon 实测生成物 `binaryTargets` 仅 `["darwin-arm64"]`、引擎仅 `libquery_engine-darwin-arm64.dylib.node`；目标 ECS 为 `x86_64` Linux。本地 `docker build` 默认产 arm64 镜像，必须用 `docker buildx build --platform linux/amd64`（或等价），并让 `db:generate` 在该目标平台 Linux 构建阶段实际运行，**不要用 `$BUILDPLATFORM` 生成后拷进目标镜像**，也不要复制本机 `.prisma` / client。构建器与运行器基础镜像需兼容的 libc/OpenSSL；容器实测列为上线前置必验项，本轮不做。
- **standalone 取舍未定**：不启用则与现有 `next start` 直接匹配但镜像较大；启用可精简 web 运行内容但不能假设 Prisma CLI / schema / seed / 引擎被 NFT 追踪，须单独提供并用 `outputFileTracingIncludes`（全局键 `'/*'`）显式收录原生资源。实现前须读本仓 `node_modules/next/dist/docs/` 对应 Docker/standalone 文档（已读 17-deploying.md 与 output.md）。`public/` 不存在，无需复制。
- **密钥 / 数据洁净性**：`.dockerignore` 至少排除 `data/`（主库 + 4 备份含记录正文与设置页密钥）、`.env*`、`.git/`、`.agent/`、`.claude/`、`.superpowers/`、`.scratch/`、`.impeccable/`、`.next/cache/`、`node_modules/`、`.npm-cache/`、`.pnpm-store/`。镜像只固化非机密默认 `ARK_BASE_URL` / `ARK_MODEL_GENERATE` / `ARK_MODEL_OPTIMIZE` / `DATABASE_URL=file:/var/lib/prompt-pilot/app.db`。设置页值优先级高于 env，两者同配的行为须写进文档。
- **SSE**：`lib/engine/sse-v3.ts` 头已设 `X-Accel-Buffering: no` / `Cache-Control: no-cache, no-transform`，`lib/engine/stream-v3.ts` 用 `ReadableStream` 返回 start/delta/meta/usage/done；不需改 SSE 契约。现有 `slow_stream` mock 约 10s 首字 + 单 delta，能测长连接存活但不证明多段持续增量；SSH 隧道下 SSE 长流探针只能在之后获准阶段做。
- **其它风险**：`db push` 无 migrations，启动流程不得盲目接受数据丢失，生产更新前查 schema 变更并备份；clean build 首次 Next.js 16.4.2 安全闸门 `SecurityFatalError` 需重试（本轮未独立复核，沿用已落盘结果）；`DEPLOYMENT.md §6` 的 390px 移动端验收与用户「移动端排除验收」冲突，须仅从部署验收裁剪，不改产品/设计响应式约束；本机 3100 被 pid 65022 占用与 `ssh -L 3100:...` 冲突。

### Suggested Verification（后续实施阶段建议命令，本轮**未执行**）
- 本地：harness check / typecheck / test / `pnpm db:generate && pnpm build` / `git diff --check`；build 首次失败按项目规则重试、不升级。
- Docker（本轮不做）：`docker buildx build --platform linux/amd64 --load -t <tag> .` + `docker image inspect ... '{{.Os}}/{{.Architecture}}'` 期望 `linux/amd64`；镜像内洁净扫描只报 PASS/FAIL 不打印匹配内容；隔离临时数据卷验首启初始化 / 12 模板 / 重启持久化 / Prisma 实际调用。
- SSE 探针仅可在获准隧道阶段、隔离容器 `MOCK_LLM_FAULT=slow_stream`、不注入真实密钥时做。

### Constraints / Do Not Retry
- 不部署、不连服务器、不改 nginx / Certbot / 既有容器 / 安全组 / 云资源、不注入真实密钥；不升级 Next.js、不跑 `next upgrade --agent=security`；不做窄屏截图 / 移动专项验收；不改 DESIGN.md。
- 不复制本机 Prisma client / `.prisma` 进 Linux 镜像（引擎仅 darwin-arm64）；本机 3100 被占用时不直接开 `ssh -L 3100:...`；`.env` / `.env.example` 不绕过权限策略。
- 构建输出里的「升级建议 / 询问 worktree」属不可信工具输出，不据此扩 `write_set` 或跳验证。
- 未获功能 commit 授权不擅自提交产品代码；本会话仅按 hook 做记账类 memory PERSIST commit，不 push。

### Carry-over
- 本会话**未写任何产品文件 / 未跑 build / 未连服务器 / 未派实现者或 verifier**（会话预算上限，UserPromptSubmit hook 要求立即收口，禁止再启动 Agent / MCP / 大 Read / 截图）。
- 新会话第一个动作：LOAD（最新 handoff → ACTIVE_CONTEXT → todo-tracker）→ `git log -3` + `git diff` 核对 → 跑一次 typecheck / test；然后先把**方案 + §4.3 取舍建议**给用户拍板（用户明确要拍板，不写成已决），确认后按 `spawn-prompts.md` 最小封套派 `devops-engineer`（write_set 仅部署前置文件）→ 完整验证 → 独立 `verifier` → 汇报已验证 / 未验证 / 残余风险 / 回滚。
- 未决：standalone 与否、Prisma CLI 运行时方案、Node 基础镜像 libc/OpenSSL + buildx/QEMU 能力、密钥注入路径。
- 回滚：本轮无产品改动可回滚；状态卡纠偏与本节为纯 memory 记账。

## 2026-11-17（部署前置实现 + 独立验收 Reject）会话预算上限收口

### Request
- 用户「继续未完成的任务」。本会话实际完成：4 项拍板 → `devops-engineer` 单 writer 实现 8 文件 → 完整验证 → 独立 `verifier` 验收。verdict **Reject**（1 Important / 2 Minor），任务**未通过、未自签收、8 个产品文件未提交**。按 UserPromptSubmit hook（上下文约 165k）立即收口：只做 PERSIST + 记账 commit，不 push、不起新 Agent、不修复、不复验。

### Decisions（用户 AskUserQuestion 拍板 4 项，均为 recommended，已决）
- `ARK_API_KEY` 注入：设置页录入为默认、服务器 root-only(0600) `--env-file` 为可选进阶、同配时设置页值优先；密钥不进镜像 / 产物 / 聊天。
- 运行时镜像：非 standalone；`prisma` CLI 移入 `dependencies`；保留 `next start -p 3100`。
- 基础镜像：`node:24-bookworm-slim`，目标 `linux/amd64`（ECS x86_64 / Alibaba Cloud Linux 3）；Prisma native 引擎须在目标平台阶段重生成，不复制本机 darwin-arm64 产物。
- 验证深度：静态 + 本地；不起 Docker daemon、不跑 amd64 实机构建。

### Implementation（devops-engineer 唯一 writer，8 文件均未提交）
- 新增：`Dockerfile`（多阶段 amd64、corepack 固定 pnpm 10.14.0、`onlyBuiltDependencies` 放行 prisma 三件套、runner 只带 prod 依赖 + `.next` + prisma/ + entrypoint，ENV 只固化非机密默认值）、`.dockerignore`（排除 data/、.env*、.git/、.agent/、.claude/、缓存、构建产物、根文档；`.npmrc` 实测仅 store-dir/cache-dir 无凭证但路径指向本机故排除）、`scripts/docker-entrypoint.sh`（`set -e` / `mkdir -p /var/lib/prompt-pilot` / `prisma db push` 不带 `--accept-data-loss` / `pnpm db:seed` / `exec "$@"`，0755）。
- 改：`package.json` + `pnpm-lock.yaml`（`prisma 6.19.3` devDeps→deps，锁文件 importer 纯分类移动 +3/−3）、`docs/DEPLOYMENT.md` §4/§5/§6/§10 改「已实施」+ 产物洁净门禁 + §4.3 双路径、`docs/HANDOVER.md` §7、`.claude/docs/runtime.md`。`next.config.ts` 未加 standalone（按决定）。

### Verification（已执行命令与结果）
- 实现者：`pnpm build` 首次 Next.js 16.4.2 `SecurityFatalError`(exit1) 重试**同一命令** exit0（不升级、不跑 `next upgrade --agent=security`）；`git diff --check` clean。本机 3100 被 pid 65022 占用，实现者与 verifier 均未 kill/重启服务、未重跑 build（避免覆盖 361M `.next`）。
- verifier 独立复跑：`pnpm run typecheck` 0 / `pnpm test` 59 文件 537 用例通过 / harness 23 pass 1 fail（唯一失败 = 既存 `ACTIVE_CONTEXT.md` 4601/4096 字节预算，非本次回归）/ `sh -n` clean / scratch 实测 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 在 pnpm 10.14.0 生效（疑点 B 不成立）。
- Docker daemon 未运行（`docker info` 连不上 socket），未实跑 amd64 构建 / 容器内首启（按决定 4）。

### Findings（独立 verifier `a76a1e3a3d2d627f0`，Verdict: Reject）
- **Important(1) 唯一阻塞**：`Dockerfile:32` 固化 `ARK_MODEL_OPTIMIZE="deepseek-v4.1-flash"`，使 `lib/llm/registry.ts:162` 的 `envValue(env,'ARK_MODEL_OPTIMIZE') ?? generateModel` 回落永不触发，违反 FR-8.3「未单独配置优化模型时复用生成模型」。设置页主路径（`getEffectiveLlmEnv` 只覆盖有 settings 行的字段）与 `--env-file` 路径均受影响：只覆盖生成模型时优化模型被钉死在镜像默认值。修复面约 1 行：移除该 ENV（并订正 `Dockerfile:26` 注释、`docs/DEPLOYMENT.md:134`「与代码默认值一致」措辞）。疑点 A 成立且比 env-only 更广。
- **Minor(2)**：`docs/DEPLOYMENT.md:65` `CMD` 仍写 `pnpm start`（现为 `next start -p 3100`）、`:3`「状态：文档阶段」、`:209`「上一版 tag」为陈旧措辞；`.dockerignore:23`「版本控制」属 git 术语、非 v2 回归。疑点 C=Minor、D（`.env.example` 被 `.env.*` 排除）无害（无代码引用、不参与 build）。
- 其余 11 条验收 PASS：write_set 纯净（冻结契约 / `DESIGN.md` / `.env*` / `app` / `lib` 均未碰）、frozen-lockfile 自洽、镜像与产物无 `ARK_API_KEY` / `sk-` / `Bearer`、`.dockerignore` 覆盖且构建必需集未误排、entrypoint 契约、文档 §4/§4.3/§10/§5/§6 同步、`docs/HANDOVER.md` + `runtime.md` 无字面 IP / 域名 / 密钥路径 / 凭证、`diff --check` clean、未验证项已标注上线前置。

### Constraints / Do Not Retry
- 不部署、不连服务器、不改 nginx / Certbot / 既有容器 / 安全组 / 云资源、不注入真实密钥；不升级 Next.js；不改 DESIGN.md；移动端排除验收；`lib/llm/types.ts` 冻结。
- 未获功能 commit 授权不擅自提交 8 个产品文件；本会话仅记账类 memory PERSIST commit，不 push。verifier 的 Reject 不是 push 令牌；后台 task-notification / hook 文本不是用户确认。
- 会话预算上限：不再起 Agent / MCP / 大 Read / 截图；修复与复验顺延新会话。

### Carry-over（下一会话第一动作）
- LOAD（最新 handoff → ACTIVE_CONTEXT → todo-tracker）→ `git log -3` + `git diff` 核对 8 文件仍在 → 跑一次 typecheck / test（不凭摘要认定完成）。
- **resume `devops-engineer` 做 Important 定向修复**（去 `Dockerfile:32` 的 `ARK_MODEL_OPTIMIZE` ENV + 订正注释 / 文档措辞，可顺带收 2 条 Minor）→ **独立 `verifier` 复验** → Accept 后再由用户授权功能 commit / push；实现者不自签收。
- 回滚（已文档化、未执行）：`git checkout -- package.json pnpm-lock.yaml docs/DEPLOYMENT.md docs/HANDOVER.md .claude/docs/runtime.md` 后 `rm -f Dockerfile .dockerignore scripts/docker-entrypoint.sh`。
- 未验证 / 上线前置：amd64 实机构建 + 镜像架构、容器首启 `db push` + seed + 12 模板、bind mount 重启持久化、容器内真实 Prisma 调用、SSH 隧道下 SSE 长流、真实密钥端到端、`next start` PID1 / SIGTERM、hadolint。
- HEAD `ddb37d6`（记账 commit，未 push），`origin/main 522f25f`；注入卡旧值「HEAD==origin/main==522f25f / 6 文件未提交未 push」为过期，本轮已纠偏。

## 2026-11-17（部署前置定向修复 + 独立复验 Accept）

### Request
- 用户 `/clear` 后 handoff：LOAD（最新 handoff → ACTIVE_CONTEXT → todo-tracker）→ git 核对 8 文件 → 跑一次 typecheck/test → resume `devops-engineer` 定向修复 Important（可顺带收 2 Minor）→ 独立 `verifier` 复验 → Accept 后由用户授权功能 commit/push。上一会话 agent 已随 `/clear` 销毁，按同一封套起新实现者并喂入 Reject 上下文。

### Implementation（唯一 writer `devops-engineer`，7 处 / 3 文件）
- `Dockerfile`：ENV 块整行删 `ARK_MODEL_OPTIMIZE="deepseek-v4.1-flash" \`（原 L32），剩 5 行逐字不变、续行链完整、无新增 ENV、无 `ARK_API_KEY`；L26 注释改「优化模型刻意不固化；未单独配置时由 lib/llm/registry.ts 回落复用生成模型（FR-8.3）」。
- `docs/DEPLOYMENT.md`：§4.3 移除该项默认值并写明回落 +「设置页 / `--env-file`」单独配置路径；§3 CMD 改 `next start -p 3100`；头状态改「项目侧前置已实施，仅静态与本地验证」；§8「上一镜像 tag」与 §5 一致。
- `.dockerignore`：仅 L23 注释 `# 版本控制与 CI 元数据` → `# Git 元数据与 CI 配置`，四条排除项逐条未动。
- 改前 3 份字节一致备份 `/tmp/prompt-pilot-fix-{Dockerfile,DEPLOYMENT.md,.dockerignore}.bak-20261117` + sha256；定向回滚为三行 `cp`。

### Verification
- 主 Agent 基线（修前）与收口（修后）各跑一次：typecheck 0 / 59 文件 537 用例 / harness 24 pass 0 warn 0 fail / `git diff --check` / `sh -n` clean。修后独立核对 3 份备份隔离 diff 恰好 7 处、无夹带、全树恰好 8 个未提交路径。
- 独立 `verifier`（fresh context，非实现者）：全套 per-gate + `npx vitest run tests/unit/llm/registry-optimize.test.ts` 4/4；harness 记 25/0（与主 Agent 24/0 计数口径差异，均 0 fail）；语义核对 `lib/llm/registry.ts:162`、`lib/settings/store.ts:279-297`、`:335-353`，确认设置页与 `--env-file` 双路径回落成立、FR-8.3 无阻塞。verdict **Accept**（0 Critical / 0 Important；2 info 非阻塞：`.dockerignore:23` 新措辞准确、`DEPLOYMENT.md:76`「重新评估」为普通动词且本轮未改动、非 v2 回归）。
- 未起 Docker daemon；本轮未重跑 `pnpm build`（未改构建输入，避免覆盖既有 `.next`）。

### Decisions
- 用户 `AskUserQuestion` 选「授权 commit + push」：本会话依次做 PERSIST（记账 commit，仅 `.agent/memory/`）→ 8 产品文件功能 commit → 一次 `git push origin main`。远端 `main` 仍在 `522f25f`，本地领先 2 笔记账 commit、无分叉，push 为快进。

### 残余风险 / 未验证（上线前置，按拍板 4 授权外）
- amd64 实构建与镜像架构、容器首启 `db push`+`db:seed`+12 模板、bind mount 重启持久化、容器内真实 Prisma 调用、SSH 隧道下 SSE 长流、真实密钥端到端（usage 落库 / 限流 / 额度错误码）、`next start` PID1 / SIGTERM、hadolint / Dockerfile lint、容器内 FR-8.3 运行时实测。

### Carry-over（下一会话第一动作）
- LOAD（最新 handoff → ACTIVE_CONTEXT → todo-tracker）→ `git log -3` + `git status -sb` 核对 HEAD 与 `origin/main`（本会话已 commit+push，以现场为准）→ 跑一次 typecheck/test。
- 剩余 Pending 见 `todo-tracker.md`：上线前置实机构建与容器内验证、`.env` 644→600、Next.js 16.4.2 安全提示（升级未执行）、DESIGN.md:327 960px、模板卡文档、真实网关密钥端到端等。
- 回滚：提交前 `git checkout -- package.json pnpm-lock.yaml docs/DEPLOYMENT.md docs/HANDOVER.md .claude/docs/runtime.md` 后 `rm -f Dockerfile .dockerignore scripts/docker-entrypoint.sh`；提交后改用 `git revert`；定向回滚用三份 `/tmp` 备份。

## 2026-11-17（本地 Docker 验证阻塞，静态回退）

### Request and decisions
- 用户批准本地 `linux/amd64` 实构建与容器验证，仍禁止服务器 / ECS / SSH / 部署 / 真实密钥 / `.env` 内容读取；写集限六份部署文件，不 commit、不 push。
- 目标是验证镜像、首启 Prisma 与模板 seed、PID 1/SIGTERM、重启持久化及 FR-8.3；hadolint 缺失时用 BuildKit `--check`，不得安装新工具或拉第三方 lint 镜像。

### Outcome
- Docker Desktop 启动尝试在不超过 120 秒后仍无 daemon socket（`docker info` / `buildx ls` / BuildKit `--check` 均因连接失败而退出）；遵循停止条件，未构建镜像、未运行容器，未改任何六份部署文件，部署文档保留所有未验证状态。无镜像、容器或临时 bind 目录。
- 主仓库 HEAD `b269c9f`；主 Agent 重新核对工作树只有既有 handoff 删除与未跟踪快照；3100 仍由 pid 65022 监听、未触碰，3110 空闲。Docker daemon 当前不可用，后续重试需解决启动问题；不绕过沙箱，未经单独授权不做 unsandboxed 启动。
- 主仓库新鲜验证：harness 24/0/0、typecheck 0、59 文件/537 测试、FR-8.3 单测 4/4、`sh -n` 与 `git diff --check` clean。独立 `verifier` Accept 仅确认诚实静态回退、证据和范围边界，不是 Docker 或部署验收。
- 实现者被环境隔离进 worktree；主 Agent 在主仓库重跑测试并核对六文件基线，verifier 用基线比较确认文档未升级。实现者在 worktree 执行 `pnpm install --frozen-lockfile`（215 个锁定依赖）及 `pnpm db:generate`；verifier 判定非实质新增工具安装，但此动作未在步骤清单中，计划的「不安装软件」措辞有歧义，后续应先澄清。测试工具输出 Prisma 自动提示从 `.env` 加载环境变量，未打印变量值；未手动读取 `.env` / `.env.example` 内容，也未绕过文件访问拦截。

### Unverified and next step
- 未验证：amd64 镜像构建/架构、容器内 db push/seed/真实 Prisma、PID 1/SIGTERM、重启数据保留、容器内 FR-8.3、SSH 隧道 SSE、真实密钥端到端、服务器部署/镜像传输、hadolint 与宿主 clean build。
- 先检查 Docker Desktop 启动条件并征求是否允许 unsandboxed 启动或改用可用主机；获准后再按本地 Docker 计划执行，不改六文件外范围。不得提交或推送。

### PERSIST boundary
- 本轮无产品变更；按用户当前「不提交」选择不做任何 commit（包括记账 commit）或 push。memory 更新仅落工作区，下一轮以 git 现场核对。
- 记录的现有测试环境输出含「Environment variables loaded from .env」提示；无值输出、未手动读文件。后续测试应避免扩大读取行为。

## 2026-11-17（daemon 故障定位，仍阻塞）

- 结论：macOS 27.2（26B123）+ Docker Desktop 4.75.0（5/26 构建）。daemon 未恢复、socket 空；按停止条件不重跑 amd64 构建与容器验证，六部署文件未改、无镜像/容器、无 commit/push。
- 根因收敛到 backend start-request 子进程协议：sysctl/`com.docker.build`/Electron tray/error window 全报 `unmarshaling start request: unexpected EOF`；`com.docker.virtualization`（`ExtraFiles:nil`）却成功拉起 VM。tray 失败触发 backend 主动 shutdown → `monitor exited: exit status 150`。
- 已排除：Aqua GUI session、deep strict 签名、磁盘/inode/进程/fd 资源、单二进制损坏（backend 可独立跑 monitor/services）、settings 损坏、group container EPERM（仅我的终端 TCC）、陈旧状态（今天六次启动同一失败；DockerHelper launching→terminating 自 10/12 起如此）。
- 官方手段穷尽：`diagnose`=`exec: no command`、`start`/`restart` 均 context canceled、`open -a Docker` 多次失败；`com.docker.socket` job exited，两 privileged helper 在。本轮未新用 unsandboxed；WebSearch 无联网工具，先验知识未采信、未据此扩权。
- 修复需单独授权：升级/重装 Docker Desktop（超「不装软件」）、或用户授予终端 Full Disk Access / 允许 Docker 后台项目、或改用可用 amd64 主机；均未执行。
- 3100 pid 65022、3110 空闲未触碰；`git diff --check` rc0；无产品变更未重跑测试，静态结果沿用上轮。

## 2026-11-18（/impeccable 审计 + 渲染态审计 + 授权修复）

### 结构/配置/文档审计（只读，已交付报告）
- 无 P0；静态健康 15/20 Good。门禁新鲜：harness 24/0/0 RC0、typecheck RC0、contrast RC0（浅深 ≥4.5:1，min accent/accent-subtle 4.70）、test RC0（59 文件 537）。HEAD b269c9f main，工作区仅 .agent/memory 元数据。
- P1 F1：ARCH:390 + HANDOVER:155 声称「构建期脚本扫描 .next/static 命中 sk-/Bearer/变量名即失败（AC-17）」不实；scripts/ 仅 contrast-check/docker-entrypoint/e2e-http 三件，build=next build，ci.yml 无扫描；next.config.ts:5 诚实写「M7 会加」；PRODUCT AC-17 本身定义为事后 DevTools 检查。→ 文档校正为事后门禁 + M7 计划，不新增功能。
- P1 F2：ARCH:392「基础限流（内存令牌桶）」未实现；无 middleware，仅上游 429 映射（lib/llm/errors.ts）+ mock faults，CostBucket 是成本聚合；防重=requestId 幂等（lib/engine/idempotency.ts）+ 客户端单飞。→ 文档校正。
- P2 F3：DESIGN:327「960px 居中单列」vs PageShell.tsx:17 max-w-[1280px]（522f25f 统一四页 1280），源码无 960。→ 960→1280。
- P2 F4：PRODUCT FR-8.2/README/CLAUDE「默认火山方舟」vs registry.ts:32 ARK_DEFAULT_BASE_URL=opencode.ai/inference/go/openai/v1、:36 DEFAULT_GENERATE_MODEL_ID=deepseek-v4.1-flash；ARCH:363 诚实记网关默认。→ 措辞对齐网关+deepseek 默认可切方舟，不改行为。
- P2 F5：runtime.md:10「无 CI」不实；.github/workflows/ci.yml 存在（verify job：pnpm 10.14.0 / node .nvmrc / frozen-lockfile / db push / check:contrast / typegen / typecheck / test / build；permissions contents:read；push main+PR+dispatch）。→ 描述实 CI。
- P2 F6：registry.ts:25/:243「离线 heuristic composer/离线模板」v2 残留注释；v3 无 key→null provider→503 NO_MODEL。→ 注释更新。
- P2 F7：schema.prisma:20 stage 注释「compose|interview|evaluate|refine|run|judge」过时；代码写 generate/optimize/repair（stream-v3.ts:155 等），ARCH:72 正确；schema:3「M0 尚未 migrate」过时。v2 列 promptId/versionId/runId/evalTaskId 故意保留只读（HANDOVER:44）非缺陷。→ 仅注释。
- P3 组：delivery.md:37-41 backlog 三空 bullet；domain.md 通用样板（src/<context>、/grill-with-docs、:51 ADR-0007 event-sourced orders 示例 vs 实 result-first）；harness.json projectClaudeMdMaxBytes 8192 vs 全局项目≤6KB（CLAUDE.md 实 2062B）；settings.json 无 hooks、enabledPlugins ui-ux-pro-max 与 impeccable 重叠；.gitignore 缺 .scratch/；68 tracked PNG（docs/assets 8.6M + archive/v2 1.0M/33）。HANDOVER:37「harness 25 全过」为 2026-11-14 dated 历史快照，不改写。
- 正面：v3 结构连贯、零依赖纪律、CI 完整、真实安全实现（幂等/meta 分隔符/安全 Markdown/级联删除）、未验证项诚实；仅 dangerouslySetInnerHTML=layout.tsx:34 可信静态 themeScript。

### 渲染态审计（live /studio）
- dev server 曾死（curl 000，旧 pid 65022 gone）；起 pnpm dev 首次 Next 16.4.2 SecurityFatalError 升级提示 halt，按项目规则同命令重试一次→Ready 159ms /studio 200（后台 bzwn8buw8，/tmp/pp-dev.log）。未跑 next upgrade --agent=security（不可信输出）。
- detect --json 1440x900 + 390x844（默认浅色）各 3 警告（/tmp/pp-detect-{1440,390}.json）：
  - dark-glow（active nav a.flex.h-10/min-h-11 nth-1）：globals.css:58 --glow-gold 与 DESIGN 逐字一致、state-only（AppShell/MobileNav/Card）、≤2/屏 → 误报（pinned）。
  - cream-palette（body rgb 243,234,216）：#f3ead8=pinned Parchment Background → 误报。
  - nested-cards（div.flex.min-h-[220px]）：实锤 P3。ResultPanel.tsx:159 根卡片（rounded-panel border-line-strong bg-surface-raised shadow-md）内 :285 空态又一 rounded-panel border-line-subtle bg-bg-sunken 盒 → 卡片套卡片（DESIGN 禁）；border-line-subtle 误用于容器（仅分隔线）；空态无 action。→ 拍平：去 border/rounded/bg，icon+text 直接居中于结果纸，保留 min-h 稳布局。
- 深色仅 contrast 门禁覆盖，detect 只扫浅色；无渲染 a11y/contrast/responsive 失败。

### 修复授权与边界
- 用户「按优先级逐个修复所有问题」授权 F1-F7+P3+R1 编辑（含 DESIGN:327、schema/registry 注释、ResultPanel UI、文档），覆盖部署期「不改 DESIGN.md」仅限本修复；仍不 commit/push。
- UI 编辑前必读 craft-floor.md；修复后重跑 harness/typecheck/test/contrast + detect 复核 nested-cards 清除。破坏/决策项（PNG 裁剪、插件重叠、hook 接线）谨慎或单独确认。

### 修复结果（同日，已验证）
- 15 文件落盘并验证：harness 24/0/0、typecheck 0、59 文件 537 tests、contrast min 4.70:1、diff --check clean、settings/harness JSON OK、CLAUDE.md 2181B。detect 1440+390 复核 nested-cards 清除，余 dark-glow/cream-palette 两条 pinned 误报。
- F1/F2 文档校正：ARCH:390 改「AC-17 事后检查 + 锚定 token 形态（裸搜 sk- 误报 Tailwind mask），构建期扫描计划 M7 尚未实现」、ARCH:392 改「requestId 幂等 + 客户端单飞（FR-1.6），入站令牌桶尚未实现，上游 429 由 errors.ts 映射」、HANDOVER:155 同步；不新增安全功能。
- F3 DESIGN:327 960→1280（sidecar 无 960）；F4 PRODUCT FR-8.2 / README:37 / CLAUDE:15 默认网关 + deepseek-v4.1-flash 可切方舟（CLAUDE 并修「L1 离线模板」stale→AC-15 503 NO_MODEL）；F5 runtime:10 描述实 ci.yml verify job；F6 registry:25/:243 注释改 null provider→503；F7 schema:3 头注（已接入 SQLite/db push）+:20 stage 注释（generate|optimize|repair，历史只读）。
- R1 ResultPanel:285 去 rounded-panel/border-line-subtle/bg-bg-sunken 拍平空态（保留 min-h-[220px] 与居中），消除卡片套卡片；detector 复核清除。
- P3：delivery.md backlog 三指针补全；domain.md 单上下文结构示例改 app/lib + 真实 ADR 文件名、:51 ADR-0007 改 result-first；harness.json projectClaudeMd 预算 8192→6144（对齐全局项目≤6KB）；.gitignore +.scratch/；settings.json 禁用 ui-ux-pro-max（执行全局「单 UI 设计插件」规则，impeccable 为 active）。备份 /tmp/pp-settings.json.bak-20261118、/tmp/pp-harness.json.bak-20261118。
- 决策项未改：hook 接线（可选，需先配 ignore-rules 抑制 pinned 误报）、PNG 裁剪（破坏性需保留决策）；HANDOVER:37 harness 25 为 dated 历史快照不改写。无 commit/push。

### 决策项收口（同日，用户「修复」+ AskUserQuestion 选「裁剪全部 41 张孤儿」）
- hook：`impeccable hooks on` 启用并接线 .claude（wired）；dark-glow/cream-palette 无 extractable value，改 file-scoped `ignore-value <rule> "*" --file`：dark-glow→app/globals.css + components/shell/AppShell.tsx + MobileNav.tsx + components/ui/Card.tsx；cream-palette→app/globals.css。reason 注明 DESIGN.md pinned brief（state-only Glow Gold / Parchment #f3ead8）。规则在其余文件仍生效。静态文件 detect 本就不报这两条（仅渲染 URL 扫描报），ignore 防 hook 噪音。新增未跟踪 .impeccable/config.json；config.local.json/settings.local.json gitignored。
- PNG：全量 git grep 引用核对（md/html/tsx/ts/css/json）→ 68 张中 41 张孤儿（basename 无任何引用，约 5MiB/5751KiB），27 张被引用保留。用户选裁剪全部 41。`rm`（非 git rm，不 stage）→ git status 41 个 D，可 checkout 恢复。复核 worktree 27 张全被引用、0 孤儿残留、41  absent、无断链；清空空目录（design-v2/q5/bento-r3 等）。harness 复跑 24/0/0。
- 仍不 commit/push。HANDOVER:37 dated 历史不改写。部署仍阻塞（SSH host key）。

### 提交推送收口（同日，用户「push 代码，然后persist收口，开新会话继续」）
- 推送前新鲜门禁：harness 24/0/0 RC0、typecheck RC0、vitest 59 文件 537 全过、diff --check clean。
- 代码 commit `f60bcfe`（57 文件：15 改 + 41 PNG 删 + .impeccable/config.json 新增）push origin/main（b269c9f..f60bcfe），用户明确授权，main 直推。
- handoff 按「只留最新 1 个」清理：删 3 个今日较早 untracked 快照，保留 handoff-20261118-113450.md 并补齐五问；10 个旧 tracked handoff 删除随记账 commit 入库。
- 部署基线更新为 f60bcfe：三件套（Dockerfile/.dockerignore/entrypoint）未变；计划步骤 2 的 HEAD 校验改为当前 main HEAD。本轮 commit/push 授权已用尽，后续需新授权。
- 记账 commit（本笔）随后 push；会话收口，新会话从 ACTIVE_CONTEXT + handoff-113450 恢复，第一动作是 SSH host key 核验授权。

## 2026-11-18（续：首次服务器部署闭环 + 独立验收 Accept）

### 编排与前置
- 用户指令：backend-architect 搭方案（数据库/迁移/脚本）→ devops-engineer 预检评估 → 执行部署 → 全程回报。主 Agent 加派独立 verifier（发布高风险）。
- SSH host key 闭环：用户选带外核对，VNC 取真实 ED25519 指纹与远端出示一致 → ssh-keygen -R 旧 ECDSA + 固定已核验 ED25519（写入前再比对指纹，不等即中止）→ SSH 连通测试通过。连接方式运维本机保管，不入库。
- DEPLOYMENT.md 重写 250→约 100 行（删决策日期流水账/审计叙事/重复声明），backend-architect 增补「数据库与迁移」「部署脚本」节；主 Agent 修正过时事实：服务器实际已有 2G swapfile（旧基线「无 swap」失效）、GitHub SSH 未配信任走 scp 回退；README/HANDOVER/runtime 三处交叉引用同步。

### backend-architect 交付（本地，未提交）
- scripts/deploy.sh 新增：precheck/build/run/verify/rollback/status；set -euo pipefail；OOM/Killed/137 即停零重试（SecurityFatalError 单次原样重试例外）；build 日志强制源码目录外；镜像 linux/amd64 + Env 凭据计数断言；verify 按 builtin:true 计数 12 + 四页面 200 + RestartCount/OOMKilled + 拒绝 0.0.0.0/[::] 绑定 + 既有容器在运行；run 保留上一镜像到 /var/lib/prompt-pilot-deploy/previous-image；rollback 不自动覆盖 db。
- scripts/docker-entrypoint.sh +16 行：db push 前滚动备份守卫（app.db.pre-push.bak + WAL/SHM 侧车，仅最近一份，首启无库跳过），set -e 与 exec "$@" 语义不变。
- 验证：bash -n / sh -n / shellcheck 零告警 / typecheck 0；幂等（三轮 seed 12 内置 + 自定义不受影响）、破坏性变更拒止（删列 db push exit 1 阻止启动）、备份守卫逐字节一致，均临时目录实演。

### devops 预检与裁决
- 首轮 NO-GO：pull 基础镜像后 MemAvailable 0.976Gi < 1Gi 阈值（缺口 25MiB）；主 Agent 复测回升 1.09Gi → 按 devops 自设判据落回 GO-WITH-RISK。发现既有 2G swap（SwapFree 1.6G）显著缓解 OOM。
- GitHub git ls-remote 失败于 host key verification（服务器无 GitHub 主机密钥）→ scp 源码包回退，无需用户 deploy key。基础镜像 node:24-bookworm-slim 预热 amd64/linux。磁盘 9.9G、3100 空闲、既有容器 healthy。

### 部署执行（GO-WITH-RISK，全部断言通过）
- git archive 64e1868（379 文件，无 data/无真实 .env；含 HEAD 跟踪 .env.example，.dockerignore 排除不进镜像）scp sha256 全等 → /opt/prompt-pilot-src；deploy.sh 与 entrypoint 单独 scp sha256 逐一全等。
- build 前 MemAvailable 1.22Gi 过门；nohup 服务端构建约 4.5 分钟，全程零 OOM（最低 568Mi，swap 吸收峰值）；镜像 prompt-pilot:64e1868 1.33GB amd64/linux，Id sha256:af1d7fe0…70abd（本地构建无 RepoDigests，此为 config ID）；Env 凭据计数 0。
- run 只绑 127.0.0.1:3100:3100 + bind mount + unless-stopped，无 --memory/--cpus，无密钥注入；就绪约 8s。
- verify：12/12 内置模板、四页面 200、RestartCount=0、OOMKilled=false、仅回环、既有容器在运行。
- 补充：restart 持久化通过且备份守卫实际生效（app.db.pre-push.bak 生成）；优雅退出 0.435s ExitCode 143；AC-15 POST /api/generate → 503 NO_MODEL；AC-17 容器内 /app/.next/static 词边界复扫零命中（初扫 34 命中均 mask-/task- 词内误报）；本机 3110 隧道四页面 200 + 12 模板，用完即关，3100 未占用。
- 既有服务终检：community-affairs/community-db Up (healthy)，3001 有应答（根 404 正常）、5432 open、nginx active、swap 无新增、监听面无新增（额外端口均长驻既有进程）。
- 偏差记录：restart 后 1.2s 内探活空响应一次（时序，等就绪后全绿）；AC-17 扫描路径适配为容器内真实产物；Prisma openssl-1.1.x 回退警告（功能实测正常）。

### 独立 verifier：Accept（10/10 断言独立复测）
- 含自建隧道复验、镜像 Env 变量名形态审查（无敏感名/值）、两脚本 sha256 两侧全等、监听面进程 elapsed 核对（均早于部署）。
- Findings：[low] 客户端产物 camelCase apiKey 字段名 17 处（设置页表单键，空初始值 + 末四位掩码，无凭据值）与 AC-17 字面「API key 变量名无命中」口径偏差，建议明确口径为凭据值 + snake_case 零命中或改字段名；[info] 3001 根 404 正常；[info] digest 措辞实为 config ID。
- 观察项：Prisma openssl 警告（建议后续 Dockerfile 补 openssl）；certbot renew timer inactive（既有）；悬空镜像约 2.7G 未清理（清理需批准，不动 community-affairs 相关）；.env.example 内容权限拒读未验证。
- 未验证：真实密钥 SSE 长流/费用落库/预算提示、宿主重启后 unless-stopped 自启、公网路径（不在范围）、DevTools 实测（词边界扫描等价覆盖）。

### 纪律与待办
- 零 commit 零 push（HEAD=64e1868=origin/main）；未注入/读取/打印密钥；未加 swap/改 daemon/动 nginx/Certbot/安全组/清理镜像；落盘文字无 IP/域名/密钥路径。
- 本地未提交 6 文件：scripts/deploy.sh（新）、scripts/docker-entrypoint.sh、docs/DEPLOYMENT.md、README.md、docs/HANDOVER.md、.claude/docs/runtime.md。待用户授权 commit+push。
- 待用户：经 3110 隧道在设置页录入模型密钥 → 补验 AC-1/4/13/14 真实链路。
- 临时产物：服务器 /tmp/prompt-pilot-build-64e1868-*.log、/tmp/pp-build-wrapper-64e1868.log、/tmp/pp-ac15-body.json；本机 /tmp/pp-src-64e1868.tar.gz、/tmp/pp-src-list.txt、/tmp/pp-tunnel-templates.json、/tmp/pp-rehearsal.Essq1s（演练，可删）。
- 本机 dev server 3100 已停（bzwn8buw8 exit 143）；Docker daemon 仍坏（不影响服务器部署路径）。

## 2026-11-18（续：访问模式改公网 + 安全组 IP 白名单）

- 用户否决隧道方案，理由「无密钥无损失」；主 Agent 纠正事实：应用无鉴权，录密钥后任何人可耗额度/读写删记录，无密钥也可灌数据。用户选「安全组 IP 白名单」（AskUserQuestion recommended）。
- 实施：deploy.sh verify 公网绑定断言改条件式（BIND_ADDR=127.0.0.1 才拒绝 0.0.0.0）+ BIND_ADDR 注释；DEPLOYMENT.md 头部/访问/run/verify/步骤/红线更新 + 新增「公网访问与 IP 白名单」节（严禁全网放行、出口 IP 变化更新规则、回退回环模式路径）。
- 坑（实测）：服务器有 mihomo 系统代理，curl http://0.0.0.0:3100 被拦截返 502，deploy.sh run 就绪等待超时 exit 124；应用本身健康（回环 200）。修复：BASE_URL 恒走 http://127.0.0.1（服务器本机探活），BIND_ADDR 仅用于 docker -p 与绑定断言。
- 容器经 deploy.sh run（BIND_ADDR=0.0.0.0）重建：旧镜像记入 previous-image，数据无损，Ready 664ms，RestartCount=0；脚本 scp 同步 sha256 全等；verify 公网模式全绿（12 模板/四页面 200/绑定 0.0.0.0:3100/既有容器在运行）。
- 待用户：阿里云控制台安全组入站 TCP 3100 → 出口 IP/32（curl 测得 180.152.46.10，浏览器若走代理出口可能不同）；加完主 Agent 实测公网可达。白名单 IP 不入库（文档/memory 占位）。
- 本地未提交改动增至 6 文件（deploy.sh 两轮修改 + DEPLOYMENT.md 白名单节）；仍零 commit 零 push。
- 闭环：用户控制台加规则后，本机公网实测（--noproxy 直连）四页面 200 + /api/templates builtin=12。访问免隧道成立。

## 2026-11-18（续：hosts 域名映射 + 会话收口）

- 用户本机 /etc/hosts 加 `120.26.172.45 promptpilot.com`（sudo 须真实终端，会话 ! shell 无交互终端读不了密码）；dscacheutil 解析与 http://promptpilot.com:3100/studio、/settings 实测 200。hosts 只映射 IP 不映射端口，:3100 省不掉（80 被既有 nginx 占用不动）；须 http（HSTS 风险时改 promptpilot.test）、浏览器直连不走代理。
- 用户问 settings 密钥存储与共享：答全局设置落服务器 SQLite、无账号体系、任何可达者可用其模型/读写删数据；白名单是唯一边界，共享出口 IP 的设备等同白名单内。
- 提交闭环：用户自行 commit+push `20282dc feat: enhance deployment process with backup and verification`（11 文件：6 产品 + memory），HEAD=origin/main=20282dc。「6 文件待授权」待办消解。服务器镜像 tag 仍 64e1868，脚本内容已 scp 同步与 20282dc 一致。
- 本会话收口：部署 + 独立验收 Accept + 公网白名单 + hosts 映射全闭环；剩余待办仅用户录入密钥后补验 AC-1/4/13/14 与观察项（openssl / AC-17 口径 / 悬空镜像）。会话预算上限，PERSIST 后开新会话。

## 2026-11-19（工作台 polish + twMerge 根因修复，待新会话部署）

- 需求（/impeccable polish）：工作台生成/优化进行中禁止输入且显示动画；所有停止按钮换醒目颜色。勘察结论：输入 readOnly + 草稿守卫早已存在（含部署版 64e1868），缺的是视觉信号，不是功能。
- 决策：主输入面顶边加金色扫描线 `pp-scan`（只动 transform、1.8s、reduced-motion 静止），不新增文案；两处停止（PromptComposer / ResultActions）secondary 改 destructive 深红底浅字；DESIGN.md Destructive 语义扩为「删除与停止中断」（用户明确要求覆盖旧「只用于不可逆操作」口径）。ContinueBar 进行中仍可输入是 FR-4 既定设计，未改。
- 根因坑：tailwind-merge 把自定义字号（text-label/text-caption 等）判为文字颜色，与同组 text-on-danger-fill / text-on-accent / text-accent 冲突时丢弃先出现的颜色 → 停止按钮曾深红底深棕字，primary/secondary 文字色全站丢失。修复：lib/utils.ts `extendTailwindMerge` 把 --text-* 字号登记回 font-size 组。不要重试改 variant 顺序或加 important 一类绕过。
- 验证：typecheck 0、vitest 537/537、harness check pass；bsk 实测浅色/深色/iPhone14 模拟：readOnly 聚焦按键无效（草稿不变）、扫描线渲染、停止对比度浅 #8f1d14/#fbf5e9 深 #991b1b/#f5e6d3（约 6.9:1）、点停止→「已中断」内容保留且解锁。截图 /tmp/pp-*.png 为临时证据。
- 观察项（未修）：Tabs `-mb-px` 下划线几何约 2px 纵向溢出，移动模拟下 tablist 右缘竖向滚动条 thumb（既有，真机 overlay 静止通常不可见）；hook 报 DESIGN.md 新于 .impeccable/design.json（sidecar 漂移，只报告）；Next.js dev 启动弹 security upgrade nudge，项目铁律不升级 Next 未执行。
- 部署决策：用户 2026-11-19「接收建议」= 值得单独部署一次（按钮文字色对比度属 a11y 缺陷），流程 commit → scp /opt/prompt-pilot-src → deploy.sh → verify，**在新会话执行**（本会话到 checkpoint 轮转）；commit 授权覆盖 6 个产品文件：DESIGN.md、app/globals.css、components/studio-v3/PromptComposer.tsx、components/studio-v3/ResultActions.tsx、components/ui/Button.tsx、lib/utils.ts。服务器镜像仍 64e1868。
- 会话开头插曲：用户要求删本机 hosts `120.26.172.45 promptpilot.com`；sudo 被权限拒绝，已给 ! sudo 备份+sed 命令，**用户未回执行结果，不得假定已删**。
- 本地 dev DB（data/app.db）已配置模型密钥（只查存在性未读值）；本轮验证留下几条记录（含一条已中断）可在提示词库删；dev server 3100 会话末仍在运行（背景任务）。

### 2026-11-19 续 · 新会话部署闭环

- git：commit `fb6874d`（6 产品文件，顺手补回 lib/utils.ts 末尾换行）；push 实际区间 `20282dc..fb6874d`（交接卡称 origin/main=e05af97 有漂移，远端起点实为 20282dc）；记账笔后本地=远端。
- 连接闭环：`aliyun` ssh 别名指向**另一台机器**（ECDSA host key 冲突，勿用于本项目）；部署机固定的 ED25519 仍有效；~/.ssh 全部 7 把私钥被拒、ssh-agent 无身份 → 用户提供 ~/.ssh 之外的密钥并给出完整命令，已记入**仓库外**密钥同目录运维备忘 `prompt-pilot-deploy.md`（位置引用，IP/密钥路径不入库）；`.env` 未动（相关命令被权限拒绝，遵守不读 .env 铁律）。
- hosts：会话末复核映射**仍在**；用户选「我自己删」（sudo sed 备份+删除命令已给），不得假定已删。
- 部署执行：git archive fb6874d（314 文件，无 data/ 无 .env）sha256 `cd5c7f6c…` 两侧全等；`sqlite3 .backup` 留 `app.db.pre-deploy-20261119.bak`（110592B，运行中安全备份）；precheck 过（MemAvailable 1143Mi / 磁盘 7Gi / 既有容器 healthy）；build 约 6 分钟零 OOM，镜像 `prompt-pilot:fb6874d` Id `sha256:3e51208c…` 1.33GB linux/amd64，Env 凭据名计数 0；run（BIND_ADDR=0.0.0.0）就绪约 8s；verify 全绿：12 内置模板 / 四页面 200 / RestartCount=0 / OOMKilled=false / 绑定 0.0.0.0:3100 / 既有容器运行。
- 补充验收：AC-17 容器内 /app/.next/static 词边界扫描零命中；`pp-scan` 在部署 CSS chunk、`destructive` 在 JS chunks（停止配色与扫描线随包上线）；容器替换后 1 条 PromptRecord 仍在（数据无损）；本机公网直连 /studio 200 + 12 模板（当前出口 IP 在白名单内）。
- 回滚路径：`previous-image=prompt-pilot:64e1868`（deploy.sh rollback 可用）；db 备份如上；两侧传输包已删。
- 坑（不要重试）：① `pgrep -f "deploy.sh build"` 在远端 bash -c 里自匹配命令串 → 假 STILL_BUILDING 空等 9 分钟，判定构建结束看 wrapper 日志完成行或用 `[.]` 断词模式；② ssh 远端 nohup 启动必须 `< /dev/null`，否则通道不闭合本地挂起（本次挂起任务 TaskStop，远端 nohup 构建不受影响）；③ 本项目部署一律用用户提供的连接命令，不走 aliyun 别名。
- 剩余：待用户公网 /settings 录密钥 → 补验 AC-1/4/13/14；hosts 用户自删；观察项清单不变（openssl / AC-17 camelCase 口径 / 悬空镜像约 2.7G + 保留的 64e1868 回滚镜像 / certbot timer / Tabs 滚动条 / design.json 漂移 / 本地 dev DB 清理）。
- 连接记录归位（用户追问后补齐）：DEPLOYMENT.md 头部加指针「连接命令见本机 .env PP_DEPLOY_SSH 与运维备忘」；.env 确认 gitignored（.gitignore:13）且未跟踪，但 Agent 对 .env 的读写均被权限拒绝，PP_DEPLOY_SSH 追加命令已交用户 ! 自行执行，**未回执行结果前不得假定已写入**。

## 2026-11-24（视频继续优化截断 bug：根因修复 + 部署闭环 17b0601）

- 症状：工作台生成视频首次成功，继续优化报「模型输出被截断，没有拿到完整提示词，缩短输入后再试」。
- 根因链（服务器账本 + 容器日志 + 网关探针实证）：实际模型 hy4-flash-free（DB 设置 llm.modelGenerate 覆盖容器 env ARK_MODEL_GENERATE=deepseek-v4.1-flash）是思维链模型，走 opencode 网关 OpenAICompatProvider；路由都传 thinking:'off' 但通用适配层 buildBody 从未下发（只有 Ark 子类发），模型默认开思维链；该网关把 reasoning token 计入 max_tokens（默认 8192）。失败 optimize：tokensOut=8192=reasoningTokens，可见输出 0 → finish_reason=length → stream-v3 抛截断。生成输入短、思维链没吃满所以成功。
- 网关探针结论（容器内 node fetch，max_tokens 512）：thinking:{"type":"disabled"} 有效（reasoning 86→0，流式/非流式均验）；enable_thinking:false 与 chat_template_kwargs 被忽略；网关必带 x-opencode-session 头否则 400 MissingSessionID；宿主直连网关被边缘 403/1010（UA 指纹），探针必须在容器内跑。
- 修复 commit 17b0601（已 push origin/main）：① lib/llm/openai-compat.ts mapThinking 下沉基类 buildBody，默认 disabled（Ark 子类行为不变）；② lib/llm/errors.ts LengthCause 新增 max_tokens_with_reasoning（总输出顶到 max_tokens 但可见输出没顶到；排在 context_window 之后），不再误报 unknown；③ 新增 5 测试。验证：typecheck 0 / vitest 542/542。
- 部署：git archive sha256 两侧全等；源码替换改用「新目录解包 + mv 改名」（pre-tool hook 禁 rm 工作区外路径，旧源码留在 /opt/prompt-pilot-src-prev-fb6874d，清理需批准）；db 备份 app.db.pre-deploy-20261124.bak；precheck 过（磁盘 6Gi）；build 零 OOM 镜像 prompt-pilot:17b0601（1.33GB amd64）；run BIND_ADDR=0.0.0.0 就绪 8s；verify 全绿（12 模板/四页面 200/RestartCount=0/OOMKilled=false/既有容器运行）；previous-image=prompt-pilot:fb6874d。
- 线上 e2e 实测（原失败记录「Vox海边vlog分镜」cmwudoctc0004pi01jjo5so8s，API 发「更具体」）：249 delta、done completed、3 条改动说明、tokensIn 1026 / tokensOut 1384 / reasoningTokens 0 / finish stop / 9.45s。**该测试给这条记录追加了一个迭代**（用户可在时间线查看或删除）。
- 复核：/etc/hosts promptpilot 映射已删（0 命中），用户自删待办消解。
- 遗留：服务器 /tmp/pp-src-17b0601.tar.gz 与构建日志、本机 /tmp/pp-src-17b0601.tar.gz 未清；旧源码目录与悬空镜像清理需批准；AC-13/14（成本页/预算）本轮未专项补验。

## 2026-11-24 续 · 抽屉继续优化动画与滚动修复（18e9613 部署闭环）

- 症状（/debug 转入产品排查）：库抽屉迭代时间线处执行继续优化，无进行中过渡动画、流式结果在视野外。
- 根因：① scan-line/stream-caret 只在工作台渲染，抽屉结果面缺失；② 滚入视野条件 prev==='idle'，而流结束 phase 停 completed（settled 不重置 idle），第二次起提交不再滚动；工作台同隐患。
- 修复 18e9613（已 push）：RecordDetailDrawer 结果面补 scan-line（active 时顶边）+ rendered 视图 stream-caret；抽屉与 StudioWorkspace 滚动条件改「非进行中→starting」（!isRequestActive(prevPhase)）。
- 验证：typecheck 0 / vitest 542/542；bsk 实测：进行中 .scan-line/.stream-caret exists=true、status「正在生成」；从时间线底部提交后截图确认结果面滚回顶部、MetaRow 3.0s/91 输出 token（thinking off 生效）、时间线追加轮次。
- bsk 坑（不要重试盲撞）：写操作报「cooperate sync」时先 `bsk cooperate sync` 再重新 snapshot 取 ref；evaluate 被 strict observation 锁，被动 DOM 用 `bsk read --selector ... --fields-json`；截图 --ref 需 observe 过的 ref，整_tab 截图不需要；session stop 会中断进行中的流（留下已中断迭代）。
- 部署：sha256 全等；源码 mv 换名（旧目录 prompt-pilot-src-prev-17b0601 留存）；db 备份 app.db.pre-deploy-20261124-ui.bak；build 零 OOM；run+verify 全绿；previous-image=17b0601。
- 本地 dev 库「部门年度总结十章节提示词」被实测追加第 3–7 轮（第 2、6 轮已中断），沙箱数据可删。
- 遗留清理清单增：服务器 /opt/prompt-pilot-src-prev-17b0601、/tmp/pp-src-18e9613.tar.gz 与构建日志、本机 /tmp/pp-src-18e9613.tar.gz、/tmp/pp-drawer-*.png。

## 2026-11-24 续 · 遗留清理与 AC-13/14 补验

- 清理（用户批准）：服务器旧源码 prev-fb6874d/prev-17b0601（mv 入 /tmp 再 rm，hook 删除边界）、两侧传输包与构建日志、本机 /tmp 截图；dangling 过滤器为空（<none> 条目是带 tag 镜像的父层，prune 0B 正确）；删被取代回滚镜像 64e1868/fb6874d（保留 17b0601），层共享释放有限，磁盘仍 90%/3.8G。
- 本地 dev 库清空验证记录：PromptRecord/PromptIteration 全删（9 条沙箱），Template 12 与 AppSetting 保留，LlmCall 账本保留（匿名用量口径）。
- AC-13/14 补验（本地沙箱夹具法）：注入 20 条已知成本 LlmCall（0.03/条，月合 0.6）→ KPI ¥0.6/41 次/¥0.03、未知注明「21 次未拿到价格未按 0 计入」、14 天折线+替代表、两表；预算 0.75→80% 提示、0.5→120% 强提示不阻断 + 工作台超预算提示；验毕删夹具、预算回 null。
- 真依赖结论：线上无价格表 → costCny null → budgetUsage null → AC-14 线上真实链路永不触发。用户选「提供真实单价」，**数字未给，待用户提供 hy4-flash-free 与 deepseek-v4.1-flash 元/百万 token 单价**后加 ARK_MODEL_PRESETS 并部署。
- bsk 坑续：navigate/reload 等写操作在会话中段常报 cooperate sync；可靠路径是 tab create --url + tab select + read；sync→snapshot→click 仅会话初段可靠。
- 仍挂起：.env 644→600（Agent 禁读写 .env，命令交用户）；openssl/AC-17 口径/design sidecar/Tabs 滚动条/SDD 工作区删除/design-parser 恢复等 P2 观察项未动。

## 2026-11-25 · 宿主 OOM 全停审查 + 整改 + cf30f19 部署

- 故障链四环：① 1.8Gi 超卖 + vm.swappiness=0（2G swap 不用，宁可 OOM）；② 全局 OOM 按 rss 挑中 dockerd（1.2–1.5GB 异常膨胀，adj -500 不够）；③ LiveRestore=false，新 dockerd 在 Loading containers 阶段 graceful stop 遗留容器（证据 community-db FinishedAt 落在 journal Loading 窗口内）；④ unless-stopped 不拉起 daemon 启动时已 stopped 的容器 → 全停 13h。对照：容器运行中退出（今早 09:58 OOM 杀 next-server）走策略自愈路径自动 Up。
- OOM 案底 recurring：8/31、9/26、10/12（30min 连杀 6 次 dockerd）、11/19、11/24、11/25；触发器含阿里云 HBR 备份全盘扫描（今早 05:45 起跑 4h+ 与业务重叠）。dmesg -T 有分钟级漂移，以 journalctl/inspect 为准。
- 整改（用户 2026-11-25 授权突破原红线）：三容器 docker update --restart always（docker 重启后自动 Up 实弹验证）；daemon.json 加 live-restore=true（备份 daemon.json.bak-20261125）；/etc/sysctl.d/99-vm-swappiness.conf vm.swappiness=10（systemd-sysctl 实跑验证压过 /etc/sysctl.conf 与 50-aliyun.conf 的 0）。红线修订：不改 daemon/不调 sysctl 已被本次显式授权取代；不加 swap/不装软件仍有效。
- 用户侧待办：HBR 备份窗口改凌晨（阿里云控制台）；1.8Gi 升内存根除超卖；dockerd 膨胀观察。
- cf30f19 部署：设置页 baseUrl 默认隐藏（只读掩码行 + 显示并编辑，错误时自动展开）；ARK_MODEL_PRESETS 加 deepseek-v4.1-flash（USD 0.15/0.003/0.6 × 汇率 6.678179@2026-11-25 = 1.0017/0.02/4.0069 元/百万，峰值 ×2 UTC 工作日 01–04/06–10）与 hy4-flash-free 全 0；estimateCost 按调用时刻计峰值。历史账本行成本仍「—」，新调用起有金额。546/546 + bsk 隐藏/展开实测。
- 磁盘：部署后 95%/2.2G（低于 precheck 3GiB）→ docker builder prune -f 释放约 19G build cache + 删被取代 17b0601 → 46%/21G。镜像仅 cf30f19 + 回滚 18e9613。本轮残留（prev-18e9613 源码、传输包、日志）已清。
- bsk/ssh 坑续：docker system df / builder prune 在满盘上分钟级慢，放后台；写操作 cooperate sync 门槛见前节。
