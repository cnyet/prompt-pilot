# Todo Tracker

## In Progress
- 无。

## Pending
- [ ] P0-1 Phase 0 文档收口：CONTEXT.md 词表、docs/ARCHITECTURE.md（新 SSE 协议+新数据模型）、docs/HANDOVER.md、README.md、docs/adr/0007-result-first-reset.md、废弃 docs/ROADMAP.md | Priority: P0 | Created: 2026-11-12 | Source: PM 评审
- [ ] P0-2 FR-9.1 阶段枚举删「说明」，定义 generate/optimize/repair 的 LlmCall.stage 落库值 | Priority: P0 | Created: 2026-11-12 | Source: PM 评审
- [ ] P0-3 PromptRecord 补 copiedAt / originTemplateId 埋点字段 + ROADMAP Phase 1 任务行 | Priority: P0 | Created: 2026-11-12 | Source: PM 评审
- [ ] P1 修复 DESIGN.md：4 处 v2 术语（步骤/字段标题/版本号/当前阶段）、三步 vs 两步、设置三段 vs 两段、动效规则与 glow-in 矛盾、主题切换位置与 AppShell 对账 | Priority: P1 | Created: 2026-11-12 | Source: PM 评审
- [ ] P1 修复 PRODUCT/ROADMAP：FR-4.5 失败记录矛盾改写、NFR-9 i18n 决策（补字典任务或降级）、AC 补缺（FR-1.1/1.2/1.3/2.4/6.3/8.4/10.3/11.2）与 AC-17/19/20 双重分配去重 | Priority: P1 | Created: 2026-11-12 | Source: PM 评审
- [ ] P1 design.json：colorMeta 补全 28 色 darkValue 或加「新语义名 → CSS 变量」映射；组件 CSS 令牌名与 frontmatter 统一 | Priority: P1 | Created: 2026-11-12 | Source: PM 评审
- [ ] P2 修复：测试数统一为实测值、评分对象限定完成记录、记录层幂等、输入长度 Zod 校验入 Phase 1 测试、cachedHit 字段、模板 style 枚举+补「代码」风格、删除记录时置空 LlmCall 关联 | Priority: P2 | Created: 2026-11-12 | Source: PM 评审
- [ ] 验收工作区遗留改动（设置连通性测试 API、成本分页组件、LLM/测试改动），通过后单独提交 | Priority: P0 | Created: 2026-11-12
- [ ] ROADMAP Phase 1：数据层与 API（新分支 feat/v3-result-first，开工前备份 data/app.db）| Priority: P0 | Created: 2026-11-12 | Blocked by: P0-1/2/3
- [ ] 真实网关密钥端到端验证（生成 → 优化 usage → 成本页，v3 语义）| Priority: P1 | Created: 2026-11-10 | Blocker: 无 ARK/opencode 真实密钥
- [ ] 为 DeepSeek V4.1 Flash / GPT 5.6 Luna 补价格表或设置覆盖 | Priority: P1 | Created: 2026-11-11

## Blocked
- [ ] ROADMAP Phase 1 实现 | Blocker: P0-1 / P0-2 / P0-3 未完成；工作区遗留改动未收口

## Done
- [x] v3 产品重置文档四件套：PRODUCT.md v3、docs/ROADMAP-V3.md、DESIGN.md 六段格式重写、.impeccable/design.json | Completed: 2026-11-12
- [x] 独立 PM 评审（有条件通过，19 条问题清单入 session-summary）| Completed: 2026-11-12
- [x] 验证：design-parser 覆盖、harness 24/24、check:contrast 浅深 62 组全过 | Completed: 2026-11-12
- [x] 设置「测试连接」mock 成功路径覆盖、成本分页组件（代码在工作区，验收待做）| Completed: 2026-11-11
- [x] `4e5a856` 工作台输入放大、主路径模板、品牌印记、opencode 网关、成本趋势图 | Completed: 2026-11-11
- [x] `8c32e9d` FR-8.5 最近使用 | Completed: 2026-11-11
- [x] `3e11bca` 版本间 diff、`f42c157` 元信息编辑、`ef0c28f` 收藏、`cf64a46` 版本回滚、`d9871fd` 盲评双向交换、`3dae599` 模板预填 | Completed: 2026-11-11
- [x] v2 DESIGN Q0-Q5 收口（`5d771bb`/`d1b86e8`/`1bb2d69`）与测试基线 506/506 | Completed: 2026-11-11
- [x] GitHub 标准仓库配置 | Completed: 2026-11-11
- [x] 评估功能端到端、设置页可写（v2 范式，随 v3 Phase 6 退役）| Completed: 2026-11-10
