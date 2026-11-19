# Archived memory section

> Source: session-summary.md
> Archived: 2026-11-19T02:51:02.251Z

## 2026-11-13（续：craft 开工，Batch A/B 落地）

### Completed
- [x] `/impeccable shape` 工作台页：发现访谈一轮（范围=整个工作台页、production-ready、主题切换移顶栏），brief 用户确认后落盘 `docs/shape-studio-v3.md`。三个待定点裁定为建议值：diff 默认行内、重新生成=追加迭代、主题切换移顶栏。
- [x] impact-mapper 产出 Phase 1+2 影响图（文件级创建/修改清单、冻结契约处理、复用/替换判定、风险点、A-E 批次顺序）。
- [x] Batch A（SDD：writing-plans → 实现者 → 独立 verifier）：`8ee16b3` schema 三模型+LlmCall 关联列（cachedHit Boolean? 无默认）、`7e402a5` settings modelOptimize+预算键（三态 null/正数/拒绝非法）、`cd77c37` registry optimize 角色与 FR-8.3 回退。verifier 裁决 approve，4 条 P2 不阻塞。备份 `data/app.db.bak-20261113-1139`。
- [x] Batch B（同流程）：`aec9c65` MetaSplitter（分隔符跨 chunk hold-back + flushTail + 三态降级）、`bcbacf0` sse-v3（start/delta/meta/usage/error/done + zod，畸形块跳过不中断）、`542cde0` 幂等 LRU（in-flight 单次执行 + 5min TTL + 失败不缓存 + 容量驱逐）、`9008711` 三组系统提示词 + shared 协议段。545/545、typecheck 零错误、harness 24 pass。

### Key Decisions
- types.ts 冻结零触碰：v3 stage 用 ledger 本地 `LedgerStage = EngineStage | 'generate' | 'optimize' | 'repair'` 扩展，不改 EngineStage。
- 失败轮落库 status failed、output 空（时间线可见可重试）；中断保留正文 status canceled；幂等重放对 failed 迭代发 error+done(failed)。
- Batch B 两处计划偏差均判合理：finish() 补 bodyEmitted===0 降级分支（提前出现用例）；容量测试最后断言改为「最近完成的 c 复用」（一致的最旧完成驱逐下 b 必被再驱逐，计划自相矛盾）。
- 纯函数层零依赖 v2：新代码不 import lib/engine/schema.ts 与 sse.ts，传输层只作只读结构参照。

### Verification
- Batch A：verifier 复跑 typecheck/524 测试/harness 25 pass/冻结 diff 为空；schema 契约测试钉 requestId 唯一、cachedHit null、LlmCall 不级联。
- Batch B：实现者逐字验证 531→535→539→545 递增；收口 gate typecheck+545+harness 24 pass。

### Pitfalls
- 计划里引用了不存在的 `MOCK_LLM_FAULT='network_error'`（真实画像只有 bad_json/fenced_json/truncated/rate_limited/quota_exceeded/slow_stream），测试已改 `rate_limited`。
- 幂等容量驱逐的「旧条目复用」断言与任何一致驱逐策略矛盾：重执行会再次触发驱逐，先驱逐的一定是当时最旧完成条目。
- mock provider 测试路径：无 key + `allowValidMock:true` + `MOCK_LLM_FAULT=valid` → `createValidMockProvider()`；setup-env 已删真实 key，绝不打真实网关。

### Carry-over
- [ ] Batch B 独立终审（verifier 已派出）。
- [ ] Batch C：ledger 加法 → lib/db/records.ts 写路径 → /api/generate → optimize/repair 路由（计划已写好）。
- [ ] Batch D：records/templates/stats API + 12 模板 seed + 预算聚合。
- [ ] Batch E：studio-v3 UI（i18n zh.ts、diff、R101-R108、components/studio-v3/*、Rating、替换 /studio、主题切换移顶栏）。
- [ ] 会话末记账提交：docs/shape-studio-v3.md + docs/superpowers/plans/* + 记忆文件。
