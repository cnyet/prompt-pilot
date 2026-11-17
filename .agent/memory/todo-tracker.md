# Todo Tracker

## In Progress
- 无。宽度一致性已落地并验证、部署影响面评估已交付；剩余工作均为另开阶段的部署前置，见 Pending。6 文件未提交 / 未 push（未获 commit 授权）。

## Pending
- [ ] 定夺 `ARK_API_KEY` 注入路径：设置页录入 vs 服务器 root-only（0600）env 文件（文档 §4.3）| Priority: P1 | Created: 2026-11-16
- [ ] 把本地 `.env` 权限从 644 改 600（配置改动走备份→改→校验）；直连部署不依赖 `aliyun` CLI，服务器上 CLI 凭证未就绪仅在需要调云 API 时处理 | Priority: P1 | Created: 2026-11-16
- [ ] 按 `docs/DEPLOYMENT.md` §4 补齐前置（Dockerfile + .dockerignore、产物洁净门禁、SQLite 绝对路径与挂载、密钥注入），再按 §5 直连步骤部署；容器只绑 `127.0.0.1:3100` + 本机 SSH 隧道，不动 nginx | Priority: P1 | Created: 2026-11-16 | Blocker: 密钥注入路径未定、前置未实施
- [ ] 部署前置需一并解决本轮评估新发现的发布链路风险：首启 `db push` / `db:seed` 无启动钩子（`start` 仅 `next start`）；`prisma` CLI 是 devDependency 与「运行阶段只带生产依赖」矛盾；Linux 构建阶段必须重生成 Prisma 引擎（本机仅 darwin-arm64，generator 无 `binaryTargets`）；`next.config.ts` 无 `output: 'standalone'`；clean build 触发 Next.js 16.4.2 安全闸门首次失败需重试；本机 3100 占用与 `ssh -L 3100:...` 冲突；§5 step-7 增补 SSH 隧道下 SSE 长流探针 | Priority: P1 | Created: 2026-11-17 | Blocker: 前置未实施
- [ ] 裁剪 `docs/DEPLOYMENT.md` §6 上线验证里的 390px / 移动底栏项，与用户「移动端显示排除验收」对齐（当前文档与验收范围冲突）| Priority: P2 | Created: 2026-11-17
- [ ] 提交全部累积未提交改动（Phase 6 + impeccable 三连 + 部署文档，用户确认后），再删除 `.superpowers/sdd/2026-11-14-v3-phase-6/` 工作区 | Priority: P1 | Created: 2026-11-14
- [ ] 真实网关密钥端到端验证（生成 → 优化 usage → 成本页，v3 语义）| Priority: P1 | Created: 2026-11-10 | Blocker: 无 ARK/opencode 真实密钥
- [ ] 为 DeepSeek V4.1 Flash / GPT 5.6 Luna 补价格表或设置覆盖 | Priority: P1 | Created: 2026-11-11
- [ ] 可选：处理 Phase 6 final review 的 4 条 deferred minors（HANDOVER mock fault、mock 输出 v2 词、ARCHITECTURE 备份措辞、`.env.example` 权限阻塞）| Priority: P2 | Created: 2026-11-14
- [ ] 恢复 design-parser.mjs（本机缺失）或改用替代结构校验 | Priority: P2 | Created: 2026-11-13
- [ ] 同步 DESIGN.md Template Card 段（异构网格 / 禁止等尺寸网格 / Featured 金边）与 `.impeccable/design.json` 到统一网格实现；并修 DESIGN.md:327 的 960px 单列漂移（宽度任务已落地，四页统一 1280px，该句已过时）；按 impeccable skill 未在设计任务中顺手修 | Priority: P2 | Created: 2026-11-17

## Blocked
- 无。

## Done
- [x] 部署到服务器的影响面评估（只读）：未连服务器 / 未改文件 / 未部署；结论服务器影响面小且隔离（回环 3100 + 1 容器 + 1 宿主目录 + 1 SSH 隧道），风险集中在发布链路。查明 Dockerfile/.dockerignore 缺位、首启无初始化钩子、Prisma 引擎跨平台（仅 darwin-arm64）、无 standalone、Next.js 16.4.2 构建安全闸门、本机 3100 与 SSH 隧道端口冲突、§6 390px 验收与移动端排除冲突。见 `session-summary.md` 2026-11-17 同节 | Completed: 2026-11-17
- [x] 四页主体宽度一致性：`PageShell` 收敛为单一 1280px canonical shell（去 cva / `ShellVariant` / `reading` 变体），工作台去内层 960 与 `variant="workbench"`、settings 换 `PageShell` 去自定 1080、库/模板去 `variant="grid"`、同步两处 960px 注释。6 文件 +21−32，仅 className 与注释。核验 typecheck 0 / 59 文件 537 用例 / harness 24-0-0 / diff --check clean / build 重试后 0 / 4 页 200 / 渲染 HTML 均 1280 且 960、1080 各 0 次 / 无残留 variant 宽度字面量；移动端排除验收、未截图。未提交未 push | Completed: 2026-11-17
- [x] `/impeccable layout` 模板页卡片统一：`TemplateCover.tsx` / `TemplateLibrary.tsx` / `TemplateCard.tsx` 改为等宽等高三列、封面共用 5:3、仅 featured 2px 金边、删除入口并入页脚；typecheck 0 / 537 用例 / harness 25-0-0 / detect [] / build ✓ / bsk 1440 浅深 + 三类 + 390px 阅图 | Completed: 2026-11-17
- [x] 项目级启用 `local-tools` 三个插件（`.claude/settings.json` 的 `enabledPlugins`）；不新建项目根 `.mcp.json`，`enabledMcpjsonServers` 保持 `[]`；备份 `/tmp/prompt-pilot-settings.json.bak-20261117`；json.tool / plugin validate / plugin list 通过 | Completed: 2026-11-17
- [x] 定夺部署对外范围：不对外开放、仅自用、暂不申请域名；域名/HTTPS 证书与公网鉴权两项消解。仍复用现有 ECS，容器只绑 `127.0.0.1:3100` + 本机 SSH 隧道，不新增 nginx block、不动 Certbot/既有服务；§7 公网暴露风险不成立。`docs/DEPLOYMENT.md` 收敛为私网方案（§1/§3/§5/§6/§7/§8/§10），README 索引行同步 | Completed: 2026-11-16
- [x] impeccable polish：工作台生成中状态。两份草稿 `readOnly` + 守卫、tabs 禁用、目标 chip `aria-disabled`、`aria-busy`、`.rise` 状态文案 + `.now-pulse` 圆点、输入面退 sunken；`zh.ts` +1 键。核验 typecheck 0 / 537 用例 / harness 24-0-0 / detect [] / diff --check clean；bsk 深浅 1440 + 390px idle/active 实测并阅图；3100 仍 200，临时 DB/服务/截图已清 | Completed: 2026-11-16
- [x] 卸载不再使用的全栈部署技能：技能目录移入本机归档（可逆）、移除 `~/.openclaw/skills/` 软链、从 `~/.agents/.skill-lock.json` 删除条目；`docs/DEPLOYMENT.md` 清掉全部工具/脚本引用并重写为独立直连方案（189 行）。同源 observe/operate 两技能未动，待用户定夺。核验 lock valid 34 技能 / 归档 37 文件 / diff --check clean / README 0 broken / 无工具引用与字面 IP | Completed: 2026-11-16
- [x] 部署目标定为**复用现有 ECS 直连部署**（不走 ROS 新建栈）；两次 SSH 只读核验服务器现状；`docs/DEPLOYMENT.md` 重写为 196 行直连方案 + README 索引行同步。核验 diff --check clean、README 链接 0 broken、无字面 IP/域名/密钥路径入库 | Completed: 2026-11-16
- [x] 阿里云部署文档阶段：新增 `docs/DEPLOYMENT.md` + README 索引行；仅文档，未部署/未建云资源/未提交。核验 skill 模板声明逐条重验、seed 幂等确认 | Completed: 2026-11-16
- [x] `/impeccable` 三连：A layout（工作台 960px 上下单列、优化/生成 tabs、280px 输入）→ B polish 工作台（默认优化、now-pulse/stream-caret、停止按钮保留焦点、ADR-0002 增补）→ C polish 其他页面（settings 两处输入统一 `inputStyles`，修焦点环/危险态/缺失状态与重复）。核验：typecheck 0 / 537 用例 / harness 25-0-0 / detect [] / 深浅主题浏览器实测；未提交未 push | Completed: 2026-11-16
- [x] Phase 6：v2 清理与收口。Tasks 1-5 完成；harness 25-0-0 / typecheck 0 / 59 文件 537 用例 / build ✓ / e2e ✓ / contrast ✓ / 浏览器冒烟 ✓；最终 verifier Accept with minors，无 Critical/Important；旧表备份 `data/app.db.bak-20261114-2027` 后删除，保留五张表；未提交未 push | Completed: 2026-11-14
- [x] Batch H 4 条 Minor 收口（设置页旧文案、KPI 标签、ARCHITECTURE 掩码示例、`maskKey` <4 字符边界）| Completed: 2026-11-14
- [x] Batch H：Phase 5 设置/成本。实现 + 全量验证 + 独立 verifier 验收通过（Accept：AC-12/13/14/17/26 + Review Focus 8/8）；HEAD `f4d3749`；verifier 自跑 harness 24-0-0 / typecheck 0 / 906 用例 / build ✓ / contrast ✓ / AC-17 clean | Completed: 2026-11-14
- [x] Batch F：提示词库 v3 UI（列表 + 详情抽屉 + 继续优化/修复 + v2 库删除）；final fix `618f0b2`；已本地合入 main（快进 `fc7ac2f` → `79a101d`），分支已删；merged main typecheck 0 / 83 文件 857 用例 / build ✓ / contrast ✓；未 push | Completed: 2026-11-14
- [x] Batch E 合入 main（fast-forward `cdc8ebc` → `f48833d`），特性分支与 SDD 工作区已删；merged main typecheck 0 / 78 文件 832 用例 / harness 24 pass / 0 fail；未 push | Completed: 2026-11-14
- [x] Batch E：studio-v3 UI 全量（i18n、Markdown/diff、R101-R108、流式、工作台、导航）；final review 后 fix wave `f48833d`，scoped re-review 11/11 ADDRESSED；typecheck 0 / 78 文件 832 用例 / harness 24 pass | Completed: 2026-11-13
- [x] DESIGN 主题切换位置对账：主题切换移至顶栏，导航四项 + 移动底栏（Batch E `7828b16`）| Completed: 2026-11-13
- [x] Batch D 合入 main（快进 `369857c` → `1563ada`），特性分支与 SDD 工作区已删；merged main typecheck 0 / 639 用例 / harness 24 pass / 0 fail | Completed: 2026-11-13
- [x] Batch D：records/templates/stats API + 12 模板 seed + 预算聚合；final review 后 fix wave `274df1f`，scoped re-review 7/7 ADDRESSED；typecheck 0 / 639 用例 / harness 25 pass | Completed: 2026-11-13
- [x] finishing-a-development-branch：Batch A-C 合入 main（`5d607b1`），特性分支已删 | Completed: 2026-11-13
- [x] Batch C：ledger 加法、lib/db/records.ts 写路径、/api/generate、optimize/repair 路由；final review 修复 F1/F2（`e61796d`），typecheck 0 / 582 用例全过 | Completed: 2026-11-13
- [x] P1 收口：NFR-9 单一字典模块定稿、AC-21 到 AC-28 补缺、AC 分配去重、design.json colorMeta 28 色 + tokenMapping | Completed: 2026-11-13 | `6bd7233`
- [x] P2 收口：评分限定完成记录、幂等两层、Zod 边界测试、cachedHit、模板四风格含代码、删除置空 LlmCall | Completed: 2026-11-13 | `6bd7233`
- [x] 验收工作区遗留改动并独立提交 `fc00f4c`（typecheck ✓、512/512 测试 ✓、harness 24/24 ✓）| Completed: 2026-11-13
- [x] P0-1 Phase 0 文档收口：ADR-0007 新建、CONTEXT/ARCHITECTURE/HANDOVER/README 重写、`docs/ROADMAP.md` 删除（`f3a281d`）| Completed: 2026-11-13
- [x] P0-2 FR-9.1 删「说明」阶段并定 stage 落库值 generate/optimize/repair | Completed: 2026-11-13
- [x] P0-3 PromptRecord 补 copiedAt / originTemplateId 埋点（PRODUCT 成功指标 + ROADMAP schema）| Completed: 2026-11-13
- [x] P1 DESIGN.md：4 处 v2 术语、三步 vs 两步、设置三段 vs 两段、动效与 glow-in 矛盾 | Completed: 2026-11-13
- [x] P1 PRODUCT/ROADMAP：FR-4.5 失败记录矛盾改写；测试数统一为实测 512 | Completed: 2026-11-13
- [x] v3 产品重置文档四件套：PRODUCT.md v3、docs/ROADMAP-V3.md、DESIGN.md 六段格式重写、.impeccable/design.json | Completed: 2026-11-12
- [x] 独立 PM 评审（有条件通过，19 条问题清单入 session-summary）| Completed: 2026-11-12
- [x] 验证：harness 24/24、check:contrast 浅深 62 组全过（2026-11-13 复测仍全过）| Completed: 2026-11-12
- [x] 设置「测试连接」mock 成功路径覆盖、成本分页组件（随 `fc00f4c` 验收提交）| Completed: 2026-11-11
- [x] `4e5a856` 工作台输入放大、主路径模板、品牌印记、opencode 网关、成本趋势图 | Completed: 2026-11-11
- [x] `8c32e9d` FR-8.5 最近使用 | Completed: 2026-11-11
- [x] `3e11bca` 版本间 diff、`f42c157` 元信息编辑、`ef0c28f` 收藏、`cf64a46` 版本回滚、`d9871fd` 盲评双向交换、`3dae599` 模板预填 | Completed: 2026-11-11
- [x] v2 DESIGN Q0-Q5 收口与测试基线 506/506 | Completed: 2026-11-11
- [x] GitHub 标准仓库配置 | Completed: 2026-11-11
- [x] 评估功能端到端、设置页可写（v2 范式，随 v3 Phase 6 退役）| Completed: 2026-11-10
