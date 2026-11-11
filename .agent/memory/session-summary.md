# Session Summary

## 2026-11-10

### Completed
- [x] 19 张工单全部完成：生成/编辑/诊断修复/试运行/导出/版本库/成本账本/设置/评估
- [x] 界面四轮改造：B5 暖色纸感、B7 刊物尺度、P1-P4 结构重构（大纲/卡片网格式/锚点导航）
- [x] 设置页可写：密钥、端点、模型，DB 覆盖环境变量，密钥不回传
- [x] 评估功能端到端：样本执行、逐条判定、与 v0 胜率、API 与界面
- [x] 文档体系：CONTEXT.md、DESIGN.md 重写、ADR 0001-0003、HANDOVER、两份改造计划
- [x] `\` 折叠侧栏补实现；e2e 覆盖评估

### Key Decisions
- 视觉走编辑刊物感而非工具感 | Reason: 五页产品高密度会显得更空
- 动效只用 CSS，两类 | Reason: 收益不抵依赖成本
- 评估无评委时 needs_review，数值留 — | Reason: 不能把没判伪装成 0 分
- 五页三种骨架 | Reason: 同构是"简单"的根因

### Important Findings
- 根 layout 曾缺 viewport，移动端按 980px 缩放，md 断点实际失效
- 深色 accent 亮，白字仅 2.39:1；引入 on-accent 深字后 7.86:1
- 库列表接口原不返回正文，卡片只能显示"暂无描述"；补 preview 后正常
- 设置测试写 DB 会被并行生成路由读到，导致偶发失败 → 测试串行
- v0 的 renderedText 是原始句子，schemaJson 才是首版结构

### Pitfalls
- hook 放在提前 return 后 → 白屏 | Fix: 移到所有 return 之前
- registry 无条件启用 valid mock → 生成链路坏 | Fix: allowValidMock 显式申请
- Chrome 无头窗口最小宽度 500 → 截图"溢出"是假象 | Fix: CDP 设设备宽度并读 scrollWidth
- 文档写了 `\` 与 ⌘K 但没实现 | Fix: 补实现并核对每条快捷键

### Carry-over
- [ ] 接真实 ARK key 验一轮：usage 落库、reasoning_content、错误码映射、评委 verdict 稳定性
- [ ] 可选项：版本回滚 UI、标签/收藏、模型选择器界面

## 2026-11-10（R1 工作台 bento 重构）
- 决策: 重构方向定为「编辑部 bento」（ADR-0004）| Reason: 用户指定 Orbit 参考（open-design.ai/plugins/example-orbit-general），分析其源码后发现色板与项目现有一致，价值在构图异构而非配色。
- 决策: R1 只改工作台页，其余页面待确认后再动 | Reason: 用户要求先测效果。
- 事实: R1 交付物 = globals.css 新 tokens（tint-do/dont、--font-numeral、numeral 尺寸、now-pulse）+ FlowTimeline（需求→生成→试运行→评估→优化）+ FieldPreview 八字段异构预览 + 诊断移到底部 dock（⌘J）+ StudioWorkspace 重排（hero 条 + 时间轴 + bento 网格）。
- 坑: `FieldPreview({}) ?? fallback` 里 `<Preview/>` 是 JSX 元素永不为 null，导致解析失败字段渲染成空标题卡；改为预览函数无 hook 纯函数、直接调用其返回值判断。
- 坑: 被父组件当普通函数调用的组件不能含 useMemo（hook 数量随分支变化）；预览组件已全部去 hook。
- 坑: 截图轮询用「编辑目标字段」title 判 ready 会匹配到流式中的回退卡，需等生成真正完成再截。
- 验证: pnpm typecheck ✓、pnpm test 493 全绿（一次偶发单失败重跑未复现）、pnpm build ✓、生产服 3100 截图（1440，深/浅）确认时间轴、hero 条、bento 卡渲染正常。
- 待办: R1 等用户确认；R2-R5 按 docs/BENTO-REFACTOR-PLAN.md 推进。

## 2026-11-10（回归 shadcn/ui，ADR-0005）
- 决策: 组件层回归 ARCHITECTURE.md 原选型（shadcn/ui），采纳 cva + Radix Slot 工程模式 | Reason: 用户确认「回归规划」；手写实现与选型表分叉。
- 决策: 不映射 shadcn 默认 token 名（background/primary/accent），组件继续用项目 token | Reason: 项目 accent=赤陶，shadcn accent=悬停灰，映射会二义。
- 事实: 新增依赖 class-variance-authority、@radix-ui/react-slot；Button/IconButton 重写为 cva 变体；buttonStyles 保留（ExportMenu 需要 ref 触发按钮）。
- 坑: Radix Slot 要求单一子元素，asChild 时不能再注入 icon 节点；图标须由子元素自带，否则 build 报 "Slot failed to slot onto its children"。
- 文档: docs/adr/0005-adopt-shadcn-ui.md 新增；ARCHITECTURE.md 选型表/目录树同步（Next 16、状态层改 React hooks、组件行标注 ADR-0005）。
- 验证: typecheck ✓、493 测试 ✓、build ✓、词库页「新建」与工作台截图正常。

## 2026-11-11（shadcn 推广 + R2 提示词库）
- 决策: PageShell/StatTile/MeterBar 改用 cva 变体（形态/色调），与 Button 同写法；删除 0 引用的 OutlineRail、DocSection，Section 去掉 Panel 导出 | Reason: 收口手写组件，统一变体模式。
- 事实: 提交 fed11f2（组件推广）、86f6d41（R2）。R2 行式 bento = 标题/单行描述/标签 + 版本数与 v0 胜率两列衬线数字（text-h2 numeral）；搜索与排序（最近更新/版本最多/标题，客户端排序）收拢到列表上方一行；行点击保留右侧详情抽屉。
- 事实: `PromptListItem` 新增 `winRate: number | null`；`latestWinRates()` 取最近 200 条已完成评估任务，按 versionIds JSON 映射到提示词，无记录 null，前端显示 —；集成测试覆盖（列表路由 null、评估后胜率 1）。
- 坑: 行描述回退 preview 时会带 markdown 的 `#` 前缀，展示前用 `/^#+\s*/` 剥离。
- 验证: typecheck ✓、493/493 ✓、build ✓；CDP 实测排序、行点击抽屉、搜索空态；截图归档 docs/assets/bento-r2/（1440 明暗、1024、390、详情、空态）。
- 服务与 Chrome 已停；工作区仅剩 `.agent/memory/handoff-*.md` 未跟踪。
