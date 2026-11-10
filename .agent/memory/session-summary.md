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
