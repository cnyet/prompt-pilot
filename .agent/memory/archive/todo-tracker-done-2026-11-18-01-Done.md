# Archived memory section

> Source: todo-tracker.md
> Archived: 2026-11-18T05:17:38.211Z

## Done
- [x] 首次服务器部署闭环（backend-architect → devops 预检+部署 → 独立 verifier Accept 10/10）：SSH host key 带外核验固定；DEPLOYMENT.md 重写+数据库/迁移/脚本章节；deploy.sh 六子命令 + entrypoint 滚动备份守卫（shellcheck 零告警 + 三段实演）；scp 源码包 sha256 全等；服务器内 build 零 OOM（镜像 prompt-pilot:64e1868 amd64）；12 模板/四页面 200/持久化/优雅退出 0.435s/AC-15 503/AC-17 词边界零命中/3110 隧道可达；既有服务未受影响。零 commit 零 push，6 文件本地待授权 | Completed: 2026-11-18
- [x] 审计修复提交推送：用户授权，代码 commit f60bcfe（57 文件）push origin/main；推送前门禁 harness 24/0/0、typecheck 0、537 测试全过；handoff 只留最新 1 个并补五问；记账 commit 随后推送 | Completed: 2026-11-18
- [x] 审计决策项收口：impeccable hook 启用接线 + 2 条 pinned 误报 file-scoped ignore；PNG 裁剪 41 张孤儿（约 5MiB，用户选全部，27 张被引用保留，无断链，git D 可恢复）。harness 复跑 24/0/0；无 commit/push | Completed: 2026-11-18
- [x] /impeccable 审计问题修复（F1-F7 + P3 + 渲染 R1，15 文件）：安全文档校正、DESIGN 1280、默认 provider 措辞、CI 描述、registry/schema 注释、ResultPanel 空态拍平、delivery/domain 文档、harness 预算 6144、.gitignore .scratch/、禁用 ui-ux-pro-max。验证 harness 24/0/0 / typecheck 0 / 537 tests / contrast min 4.70 / detect nested-cards 清除（余 2 pinned 误报）/ diff-check clean。决策项 hook/PNG 未改；无 commit/push | Completed: 2026-11-18
- [x] 本机 Docker daemon 启动故障定位：排除 Aqua/签名/资源/单二进制/settings/陈旧状态，收敛到 start-request 协议；官方恢复手段穷尽仍失败，按停止条件诚实回退，六部署文件未改、无 commit/push | Completed: 2026-11-17
- [x] 本地 Docker daemon 启动尝试后静态回退：harness 24/0/0、typecheck 0、59 文件 537 测试、FR-8.3 单测 4/4、`sh -n` 与 `git diff --check` clean；独立 verifier Accept（仅回退，不是 Docker 验收）；六部署文件未改、未提交推送 | Completed: 2026-11-17
- [x] 按用户「不提交」选择完成本轮 PERSIST：恢复 todo-tracker 历史、补齐 handoff 五问、运行 `memory-archive.mjs --persist-round`；无 commit/push | Completed: 2026-11-17
- [x] 部署前置定向修复 + 独立复验 Accept + PERSIST：去 `Dockerfile` 固化的 `ARK_MODEL_OPTIMIZE`（恢复 FR-8.3 回落）、订正注释与 `DEPLOYMENT.md` §4.3/§3/文件头/§8、`.dockerignore:23` 注释，共 7 处 / 3 文件；独立 `verifier` **Accept**（0 Critical / 0 Important，2 info 非阻塞）；主 Agent 实跑 harness 24-0-0 / typecheck 0 / 537 用例 / `git diff --check` / `sh -n` clean。用户授权「PERSIST + 功能 commit + push main」，本会话执行（记账 commit 仅 `.agent/memory/`，8 产品文件单独提交，一次 push）| Completed: 2026-11-17
- [x] 用户 4 项拍板（AskUserQuestion，均 recommended）：`ARK_API_KEY` 设置页默认 + 0600 `--env-file` 可选 + 设置页优先；非 standalone + `prisma` CLI 入 dependencies + `next start -p 3100`；`node:24-bookworm-slim` / linux/amd64；验证仅静态+本地不起 Docker | Completed: 2026-11-17
- [x] 部署前置实现（`devops-engineer` 唯一 writer，8 文件**未提交**）：新建 Dockerfile / .dockerignore / scripts/docker-entrypoint.sh（0755）；改 package.json + pnpm-lock.yaml（prisma 6.19.3 devDeps→deps）、DEPLOYMENT.md §4/5/6/10、HANDOVER.md §7、runtime.md；§6 390px 验收裁剪已做 | Completed: 2026-11-17
- [x] 完整验证 + 独立 `verifier`（L/XL + 发布高风险）：typecheck 0 / 59 文件 537 用例 / harness 23-1（既存本卡 4601/4096 字节，非回归）/ `sh -n` / `git diff --check` clean / `pnpm build` 首次 SecurityFatalError 重试同命令 exit0；verdict **Reject**（1 Important `Dockerfile:32` 固化 `ARK_MODEL_OPTIMIZE` 破坏 FR-8.3 回落 + 2 Minor，其余 11 条 PASS）| Completed: 2026-11-17 | **已在后续会话修复并复验 Accept**
- [x] 会话预算上限收口 PERSIST：ACTIVE_CONTEXT 瘦身到 3980B（修掉唯一 harness fail）、session-summary 追加本节、todo 更新、handoff 5 问补齐、`memory-archive.mjs --persist-round`、记账类 memory commit（不 push）| Completed: 2026-11-17
- [x] 会话预算上限收口 PERSIST：纠偏状态卡（宽度 6 文件 + 部署文档均已在 `522f25f` 提交推送，HEAD==origin/main；旧记录里所有「未提交未 push」字样就此失效）；追加本会话 session-summary 节、补齐 handoff 5 问、跑 `memory-archive.mjs --persist-round`、记账类 memory commit（不 push）| Completed: 2026-11-17
- [x] 部署前置范围选定（用户选「部署前置（仅本地）」）+ 只读 `impact-mapper` 影响地图（task ab8a6761d897ae0b0）：新建/条件改文件清单、构建契约链、arm64→amd64 架构错配、standalone/Prisma CLI/密钥未决项、产物洁净性与 SSE 验证建议；未写产品文件 / 未跑 build / 未连服务器 / 未派实现者 | Completed: 2026-11-17
- [x] 部署到服务器的影响面评估（只读）：未连服务器 / 未改文件 / 未部署；结论服务器影响面小且隔离（回环 3100 + 1 容器 + 1 宿主目录 + 1 SSH 隧道），风险集中在发布链路。查明 Dockerfile/.dockerignore 缺位、首启无初始化钩子、Prisma 引擎跨平台（仅 darwin-arm64）、无 standalone、Next.js 16.4.2 构建安全闸门、本机 3100 与 SSH 隧道端口冲突、§6 390px 验收与移动端排除冲突。见 `session-summary.md` 2026-11-17 同节 | Completed: 2026-11-17
- [x] 四页主体宽度一致性：`PageShell` 收敛为单一 1280px canonical shell（去 cva / `ShellVariant` / `reading` 变体），工作台去内层 960 与 `variant="workbench"`、settings 换 `PageShell` 去自定 1080、库/模板去 `variant="grid"`、同步两处 960px 注释。6 文件 +21−32，仅 className 与注释。核验 typecheck 0 / 59 文件 537 用例 / harness 24-0-0 / diff --check clean / build 重试后 0 / 4 页 200 / 渲染 HTML 均 1280 且 960、1080 各 0 次 / 无残留 variant 宽度字面量；移动端排除验收、未截图。未提交未 push | Completed: 2026-11-17
- [x] `/impeccable layout` 模板页卡片统一：`TemplateCover.tsx` / `TemplateLibrary.tsx` / `TemplateCard.tsx` 改为等宽等高三列、封面共用 5:3、仅 featured 2px 金边、删除入口并入页脚；typecheck 0 / 537 用例 / harness 25-0-0 / detect [] / build ✓ / bsk 1440 浅深 + 三类 + 390px 阅图 | Completed: 2026-11-17
- [x] 项目级启用 `local-tools` 三个插件（`.claude/settings.json` 的 `enabledPlugins`）；不新建项目根 `.mcp.json`，`enabledMcpjsonServers` 保持 `[]`；备份 `/tmp/prompt-pilot-settings.json.bak-20261117`；json.tool / plugin validate / plugin list 通过 | Completed: 2026-11-17
- [x] 定夺部署对外范围：不对外开放、仅自用、暂不申请域名；域名/HTTPS 证书与公网鉴权两项消解。仍复用现有 ECS，容器只绑 `127.0.0.1:3100` + 本机 SSH 隧道，不新增 nginx block、不动 Certbot/既有服务；§7 公网暴露风险不成立。`docs/DEPLOYMENT.md` 收敛为私网方案（§1/§3/§5/§6/§7/§8/§10），README 索引行同步 | Completed: 2026-11-16
- [x] impeccable polish：工作台生成中状态。两份草稿 `readOnly` + 守卫、tabs 禁用、目标 chip `aria-disabled`、`aria-busy`、`.rise` 状态文案 + `.now-pulse` 圆点、输入面退 sunken；`zh.ts` +1 键。核验 typecheck 0 / 537 用例 / harness 24-0-0 / detect [] / diff --check clean；bsk 深浅 1440 + 390px idle/active 实测并阅图；3100 仍 200，临时 DB/服务/截图已清 | Completed: 2026-11-16
- [x] 卸载不再使用的全栈部署技能：技能目录移入本机归档（可逆）、移除 `~/.openclaw/skills/` 软链、从 `~/.agents/.skill-lock.json` 删除条目；`docs/DEPLOYMENT.md` 清掉全部工具/脚本引用并重写为独立直连方案（189 行）。同源 observe/operate 两技能未动，待用户定夺。核验 lock valid 34 技能 / 归档 37 文件 / diff --check clean / README 0 broken / 无工具引用与字面 IP | Completed: 2026-11-16
- [x] 部署目标定为**复用现有 ECS 直连部署**（不走 ROS 新建栈）；两次 SSH 只读核验服务器现状；`docs/DEPLOYMENT.md` 重写为 196 行直连方案 + README 索引行同步。核验 diff --check clean、README 链接 0 broken、无字面 IP/域名/密钥路径入库 | Completed: 2026-11-16
- [x] 阿里云部署文档阶段：新增 `docs/DEPLOYMENT.md` + README 索引行；仅文档，未部署/未建云资源/未提交。核验 skill 模板声明逐条重验、seed 幂等确认 | Completed: 2026-11-16
- [x] `/impeccable` 三连：A layout（工作台 960px 上下单列、优化/生成 tabs、280px 输入）→ B polish 工作台（默认优化、now-pulse/stream-caret、停止按钮保留焦点、ADR-0002 增补）→ C polish 其他页面（settings 两处输入统一 `inputStyles`，修焦点环/危险态/缺失状态与重复）。核验：typecheck 0 / 537 用例 / harness 25-0-0 / detect [] / diff --check clean；深浅主题浏览器实测；未提交未 push | Completed: 2026-11-16
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
