# Archived memory section

> Source: session-summary.md
> Archived: 2026-11-19T02:51:02.250Z

## 2026-11-12（v3 产品重置：PRODUCT / ROADMAP / DESIGN / PM 评审）

### Completed
- [x] `/impeccable teach` 产品重置：PRODUCT.md 重写为 v3「结果优先」范式。核心变化：删八字段结构化/假设 chip/评估/版本树/试运行/变量集；只展示处理后 Markdown；导航 4 项（工作台/提示词库/模板/设置，无评估）；FR-1 到 FR-11、NFR-1 到 NFR-12、AC-1 到 AC-20、7 项成功指标。新增：继续优化、按需本地检查（P1）、收藏+1 到 5 星评分、文本/图片/视频三类模板、成本预算提醒。用户确认增值功能：优化说明、对话式继续优化、自定义模板、成本预算提醒；确认保留：优化前后对比、本地诊断。
- [x] 新建 docs/ROADMAP-V3.md（取代 docs/ROADMAP.md，旧文件未删）。7 阶段 16 人日：Phase 0 文档基线 / Phase 1 数据层与 API / Phase 2 工作台 / Phase 3 库 / Phase 4 模板 / Phase 5 设置与成本 / Phase 6 移除旧模块。新数据模型 PromptRecord/PromptIteration/Template；SSE start/delta/meta/usage/error/done；元数据用 `<<<PROMPTPILOT_META>>>` 分隔符由服务端剥离；diff 行级 LCS+字符级、20k 退化；检查规则 R101-R108；12 条内置模板 seed；迁移只增不删。
- [x] `/impeccable document` DESIGN.md 重写为 v3：Stitch 六段固定结构（Overview/Colors/Typography/Elevation/Components/Do's and Don'ts）+ YAML frontmatter（28 色令牌/9 字阶/圆角/间距/10 组件令牌），25,446 字节。保留烛光羊皮纸材质，新增四个 signature 组件规格（Workspace Result Surface / Rating / Library Record Row / Template Card）。
- [x] 新建 .impeccable/design.json（21,048 字节，schemaVersion 2）：8 组件 HTML/CSS 片段、colorMeta（8 色 darkValue+tonalRamp）、typographyMeta 8 角色、shadows/motion/breakpoints、narrative（northStar/keyCharacteristics/rules/dos/donts）。
- [x] 独立 PM 评审（opus general-purpose 子代理，只读）：总裁决「有条件通过，暂不进 Phase 1」，19 条问题（3 P0 / 5 P1 / 11 P2），6 条做得好不建议改。

### Key Decisions
- v3 范式：结果优先、过程隐身，默认路径 PRODUCT 写「不超过三步」、DESIGN 写「只有两步」（两处口径待统一，评审 P2） | Reason: 用户明确不要结构化过程，参考火山 PromptPilot 两条主路径但主动做减法。
- SSE 元数据协议：正文流式下发，分隔符后内容缓冲，解析失败降级为输入前 24 字标题+空说明，正文不受影响 | Reason: 单次调用同时产出正文/标题/说明，避免第二次 LLM 调用；模型不守格式是一等风险。
- DESIGN.md 改用六段 Stitch 格式与语义色名（candle-gold 等），运行时变量仍为 --accent 等 | Reason: impeccable document 命令要求固定格式；design.json colorMeta 只覆盖 8/28 色 darkValue，其余依赖 globals.css（评审 P1，待补全）。
- FR-5 本地检查定 P1；术语从「诊断」改「检查」 | Reason: 用户确认保留但非首版必须；与 v2 CONTEXT.md 词表冲突，Phase 0 收口时解决。

### Verification
- design-parser.mjs 解析 DESIGN.md：northStar ✓、色彩 3 组 21 色 4 规则、字阶 8 条、阴影 5 条、组件 13 节、Do 13/Don't 16。
- node ~/.claude/scripts/claude-project-harness-check.mjs . → 24 pass / 0 warn / 0 fail。
- pnpm check:contrast → 浅色 31 组、深色 31 组全过；最低浅色 4.51:1（text-faint/bg）、深色 4.70:1（accent/accent-subtle）。
- 未跑 typecheck/test（本轮纯文档；工作区另有未提交代码改动，避免混跑）。

### Pitfalls
- DESIGN.md 残留 4 处 v2 术语（188 当前步骤底 / 238 字段标题 / 251 版本号 / 265 当前阶段），违反 PRODUCT:266 术语禁令，待修。
- 数值口径矛盾：PRODUCT:37 三步 vs DESIGN:163 两步；DESIGN:364 设置「三段」分段条但只有模型/成本两段；动效「只动 opacity/transform」vs glow-in 的 box-shadow 过渡。
- DESIGN:321 主题切换在顶栏，现行 AppShell 在侧栏底部（AppShell.tsx:169-181），Phase 2 需对账。
- FR-9.1 阶段枚举「生成/优化/修复/说明」中「说明」无对应 LlmCall 调用；FR-4.5「失败不产生半成品记录，可在时间线中重试」自相矛盾；成功指标零埋点（缺 copiedAt/originTemplateId）；requestId 幂等只覆盖迭代层不覆盖记录层。
- 测试基线数混乱：ROADMAP 写 493、HANDOVER 写 466、session-summary 11-11 节实测 506/506；后续以实测为准。

### Carry-over
- [ ] P0-1 完成 Phase 0 文档收口：CONTEXT.md 词表、ARCHITECTURE.md 新 SSE+数据模型、HANDOVER.md、README.md、ADR-0007、废弃 docs/ROADMAP.md。
- [ ] P0-2 FR-9.1 删「说明」阶段并定义 stage 落库值；P0-3 PromptRecord 补 copiedAt/originTemplateId 埋点。
- [ ] P1 修复：DESIGN 4 处术语+口径矛盾+动效规则；FR-4.5 改写；NFR-9 i18n 决策（字典或降级）；AC 补缺与去重；design.json colorMeta 补全。
- [ ] 先验收并提交工作区遗留的设置连通性测试/成本分页代码改动，再开 v3 分支 feat/v3-result-first。
