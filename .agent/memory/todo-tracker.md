# Todo Tracker

## In Progress
- [ ] Batch D：records/templates/stats API + 12 模板 seed + 预算聚合 | Priority: P0 | Created: 2026-11-13 | Task 1 完成（`aa6878d`/`f616ee4`）；下一步 Task 2 templates API + seed

## Pending
- [ ] DESIGN 主题切换位置 vs AppShell.tsx 侧栏底部对账 | Priority: P1 | Created: 2026-11-12 | 对账点: Phase 2（Batch E）
- [ ] Batch E：studio-v3 UI（i18n zh.ts、diff、R101-R108、components/studio-v3/*、Rating、替换 /studio）| Priority: P0 | Created: 2026-11-13
- [ ] 真实网关密钥端到端验证（生成 → 优化 usage → 成本页，v3 语义）| Priority: P1 | Created: 2026-11-10 | Blocker: 无 ARK/opencode 真实密钥
- [ ] 为 DeepSeek V4.1 Flash / GPT 5.6 Luna 补价格表或设置覆盖 | Priority: P1 | Created: 2026-11-11
- [ ] 恢复 design-parser.mjs（本机缺失）或改用替代结构校验 | Priority: P2 | Created: 2026-11-13

## Blocked
- 无。

## Done
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
