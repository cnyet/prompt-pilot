# Todo Tracker

## In Progress
- 无。

## Pending
- [ ] 提交全部累积未提交改动（Phase 6 + impeccable 三连，用户确认后），再删除 `.superpowers/sdd/2026-11-14-v3-phase-6/` 工作区 | Priority: P1 | Created: 2026-11-14
- [ ] 真实网关密钥端到端验证（生成 → 优化 usage → 成本页，v3 语义）| Priority: P1 | Created: 2026-11-10 | Blocker: 无 ARK/opencode 真实密钥
- [ ] 为 DeepSeek V4.1 Flash / GPT 5.6 Luna 补价格表或设置覆盖 | Priority: P1 | Created: 2026-11-11
- [ ] 可选：处理 Phase 6 final review 的 4 条 deferred minors（HANDOVER mock fault、mock 输出 v2 词、ARCHITECTURE 备份措辞、`.env.example` 权限阻塞）| Priority: P2 | Created: 2026-11-14
- [ ] 恢复 design-parser.mjs（本机缺失）或改用替代结构校验 | Priority: P2 | Created: 2026-11-13

## Blocked
- 无。

## Done
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
