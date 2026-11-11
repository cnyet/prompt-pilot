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

## 2026-11-11（R3 评估页）
- 事实: R3 只改 `components/eval/EvalWorkspace.tsx`。创建区改双栏（评估对象 19rem + 样本输入 1fr，操作条独立一行）；KPI 三项用 `text-numeral-hero`，不满足独立为 `bg-tint-coral` + `text-numeral-mega text-danger`；样本对照用 `sm:grid-cols-2` 并排当前版本 / v0 基线；判定仍按样本分组，序号改衬线两位数。
- 决策: 无判定判定条件定为 `summary === null || (verdictCount === 0 && judgedSamples === 0)` | Reason: 仅看 verdictCount 会在「有样本级对比、无标准判定」时误标待人工判定；仅看 summary 会把无评委的 0 当已知值显示。
- 坑: `next dev` 会自动向 `AGENTS.md` 追加 nextjs-agent-rules 块，污染任务 diff；用 `git checkout -- AGENTS.md` 回退，不要带入提交。
- 验证: typecheck ✓、493/493 ✓、build ✓、project harness check 全 pass；浏览器实测 1440/1024/390 与样本展开态；danger/coral 对比度浅色 4.74:1、深色 5.18:1。
- 待办: R3 未提交，工作区仅 `EvalWorkspace.tsx` 一个改动；下一步 R4 模板 + 设置 + 全局 chrome。

## 2026-11-11（设计系统重做：瑞士黑白）
- 决策: 用户对现 DESIGN.md 不满意，要求启用 ui-ux-pro-max 重做；方向选定「瑞士黑白」（Uber 纯黑白 + Blinkist 编辑留白 + Linear 密度）。本轮先交付 DESIGN.md + 单页样张，不改造应用代码；R4 暂停。
- 事实: 项目 `.claude/settings.json` 已启用 `ui-ux-pro-max@ui-ux-pro-max-skill`（修改前备份 `settings.json.bak-*`，JSON 校验通过）。技能数据库脚本：`~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.15.0/.claude/skills/ui-ux-pro-max/scripts/search.py`。
- 事实: 已启动 ui-designer 子代理重写 `DESIGN.md` 与 `docs/design-preview/swiss-workbench.html`（1440/390 截图），结果待返回。
- 评估: `~/Downloads/questui-DESIGN.md` 是奇幻 RPG 风格（金/深红/紫、Cinzel+Spectral、金色 glow、深棕底），与瑞士黑白方向及 P1 业务用户定位冲突，**不能直接借用视觉系统**；可借用其组件规格清单（按钮/卡片/输入/chip/list/checkbox/radio/tooltip）与 8px 间距刻度作为文档结构。
- 验证基线: typecheck ✓、493/493 ✓。

## 2026-11-11（设计方向转向 QuestUI：Q0 交付）
- 决策: 用户最终选定 QuestUI 奇幻视觉，保留其深棕分层、金色主操作、衬线标题、2-8px 圆角与 active glow，改写为中文双主题「烛光羊皮纸」| Reason: 用户明确要求，替代瑞士黑白；直接照搬在中文、浅色与对比度上不可用。
- 决策: 浅色为羊皮纸日光变体（默认），深色为烛光地下室；中文标题系统宋体、正文系统无衬线、零网络字体 | Reason: 中文子集体积与首屏预算；用户选择系统宋体方案。
- 事实: 新增 `docs/adr/0006-questui-parchment-direction.md`；ADR-0001/0004 视觉结论标记为被取代，ADR-0002/0003/0005 继续有效。Q0 交付 `DESIGN.md`、`docs/design-preview/questui-workbench.html`、`docs/assets/design-v2/` 三张截图（1440 明暗 + 390 明）。
- 事实: 令牌 WCAG 实测浅色最低 4.62:1（accent / tint-gold），深色最低 4.70:1（accent / tint-gold）；QuestUI 原稿 `#991B1B` 文字 2.00:1、`#581C87` 1.73:1、白字压 `#CA8A04` 2.94:1，均未采用。
- 坑: Chrome headless `--window-size 390` 会钳制宽度；移动截图改用 CDP `Emulation.setDeviceMetricsOverride`，实测 `scrollWidth = 390`，无横向溢出。
- 坑: `sips` 的 cropOffset 不能可靠取顶部；长截图用 PIL 按 y 区间裁剪检查。
- 验证: harness check 全 pass；typecheck ✓；493/493 ✓；build ✓；桌面 1440 与移动 390 截图目检通过。
- 事实: 用户于 2026-11-11 确认 Q0 方向，下一步 Q1。因会话预算收口，Q1 未启动；Q0 未改任何应用代码，R3 `EvalWorkspace.tsx` 仍未提交。
- 待办: 新会话从 Q1 开始（令牌层 + Button / Input / Chip / Card / Panel / Tabs），随后 Q2 工作台迁移。

## 2026-11-11（Q1 令牌层 + GitHub 标准仓库）

### Completed
- [x] Q1：`app/globals.css` 令牌层按 DESIGN.md 第二节重写（浅色羊皮纸日光 / 深色烛光地下室），保留旧令牌别名（`tint-coral/sage/lavender/butter`、`shadow-overlay`、`numeral`）使 Q2-Q5 前页面继续编译。
- [x] 基座组件：Button（primary/secondary/ghost/destructive × sm/md/lg）、Input/Textarea/Select、Chip（语义色调 + selected + removable）、Card（default/elevated/accent/interactive/selected）、Panel、Tabs（受控 + 键盘 roving tabIndex）。
- [x] `scripts/contrast-check.mjs` 解析 `globals.css` 两套主题并校验 31 组对比度；`pnpm check:contrast` 接入。
- [x] GitHub 标准仓库：remote `git@github.com:cnyet/prompt-pilot.git`、MIT LICENSE、CI workflow（contrast → typegen → typecheck → test → build）、Dependabot、issue/PR 模板、CODEOWNERS、CONTRIBUTING/SECURITY/CODE_OF_CONDUCT、`.editorconfig`/`.gitattributes`/`.nvmrc`、package 元数据。
- [x] commit：`bd2ff96`（仓库配置）、`f022b65`（合并远端 Initial commit）、`8fde4ca`（CI 先生成 Next 类型）、`0df71f3`（Q1，13 文件 +873/-160）。

### Key Decisions
- Q1 只换令牌与基座组件，不改页面结构；旧 tint 别名指向新语义色，避免一次改全站 | Reason: 分阶段迁移，Q2-Q5 每步独立 diff。
- 对比度脚本解析 CSS 变量而非硬编码色值 | Reason: 令牌改动后自动复核，避免文档与代码漂移。
- CI 在 typecheck 前跑 `pnpm exec next typegen` | Reason: `next-env.d.ts` 未入库且引用 `.next/types`，否则 CI 类型检查必失败。
- 远端 main 与本地历史无关，用 `--allow-unrelated-histories` 合并并保留远端 LICENSE 版权行 | Reason: 不 force push、不重写远端历史。

### Important Findings
- DESIGN.md 2.6 漏写 `--radius-pill`；本轮补为 9999px 并回写文档。
- Tailwind v4 无 `readonly:` 变体，只读态必须用 `read-only:`。
- 旧 Button 的 `variant="quiet"` 在 4 个文件中使用，Q1 机械替换为 `ghost`（EvalWorkspace 只暂存这一行）。
- 对比度实测：浅色最低 4.51:1（`text-faint`/`bg`），深色最低 4.70:1（`accent`/`accent-subtle`），均达标。

### Pitfalls
- 直接 `git add components/eval/EvalWorkspace.tsx` 会带入未完成的 R3 改动 | Fix: 用 `git show HEAD:` 生成临时文件，改一行后用 `git hash-object -w` + `git update-index --cacheinfo` 只暂存该 blob。
- 本地 3100 生产服务未停就跑了测试/build | 风险: 测试与应用共用 SQLite；本次 493 全绿但属残余风险，后续必须先停服务。

### Verification
- `pnpm check:contrast` ✓（浅/深全部 ≥4.5:1）
- `pnpm run typecheck` ✓、`pnpm test` ✓ 493/493、`pnpm build` ✓
- 独立 verifier 只完成对比度复核（与 DESIGN.md 2.3 一致），未取得完整独立签收；部分验证为主 Agent 自证。

### Carry-over
- [x] 已推送 `origin main`（`d4a30a7..4e8ef13`，非 force）；GitHub Actions 首跑全绿（49s，含 contrast/typegen/typecheck/test/build）；3100 服务已停。
- [ ] Q2 工作台迁移（AC-1 / 3 / 12 / 13），新会话启动。
- [ ] R3 `components/eval/EvalWorkspace.tsx` 仍未提交（工作区保留原改动）。
- [ ] `.claude/harness.json`、`.claude/settings.json` 的本地修改不入库。

## 2026-11-11（Q2 工作台迁移）

### Completed
- [x] 工作台迁移：需求摘要 Card + 假设 chip、视图切换 Tabs、3 列 bento、字段卡卡片化、诊断 dock 头部 chips + 常显修复/忽略、试运行/渲染/JSON 卡片、390px 适配。
- [x] 借鉴 design-v2 截图亮点（不引入右栏，保持 DESIGN §4.1 / ADR-0004）：时间轴副标签（N 个假设 / 正在生成第 N 字段 / 已完成 N 字段 / 自动运行 / 在评估页进行 / 评估后开放）；诊断 dock 宽屏 auto-fit 多栏、全部修复移入头部。
- [x] 验证：typecheck ✓、493/493 ✓、build ✓、harness 25 pass / 0 fail、contrast ✓、浏览器 2560 深色实测副标签与诊断头部。

### Key Decisions
- 工作台结构继续以 DESIGN §4.1 + ADR-0004 为准（时间轴 → 需求摘要 → 八字段 bento → 底部诊断 dock）；截图只借信息密度与局部形态，不引入右栏版本/对比/质量/导出 | Reason: 右栏依赖的 FR-7/FR-11 UI 尚未接入，硬搬会产生空面板。
- 时间轴副标签由 `StudioWorkspace` 计算后经 `details` 传入，`FlowTimeline` 保持展示组件 | Reason: 不把生成状态耦合进时间轴。

### Pitfalls
- 残留 dev server 占用 3100 导致新代码未编译，`pnpm dev` 报 EADDRINUSE；重启前先 `lsof -ti:3100` 杀掉 next-server 子进程。
- bsk 新 CLI：动作需 cooperate sync 的 context + observation；click 会消费 observation，下一步动作前重新 sync。

### Carry-over
- [ ] Q2 代码待提交；R3 `EvalWorkspace.tsx` 不得混入。
- [ ] Q3 库 + 评估迁移（AC-6）。
- [ ] 390px 下诊断头部新增按钮的换行未复测。

## 2026-11-11（Q3-Q5 收口）

### Completed
- [x] Q3 评估页：`5d771bb`。创建区双栏、KPI 衬线数字、样本对照双栏、判定按样本分组；旧 tint 全部换成 `tint-green/gold/red`；无判定时四项 KPI 均显示 `—` + 「待人工判定」（ADR-0003）。
- [x] Q4 模板 + 设置 + 全局 chrome：`d1b86e8`。左轨 64px（可展开 208px）+ 72px 顶栏（衬线页名、日期、模型状态、⌘K）；模板异构网格（图标块 size 随场景变化、featured 顶部金边）；设置页 hero 状态条 + 成本 KPI 衬线数字；删除 `PageHeader`，内容标题降为 h2；旧 tint 别名与 `shadow-overlay` 删除。
- [x] Q5 响应式 + 双主题 + a11y：`1bb2d69`。左轨与 MobileNav 统一在 1024px 切换；评估记录行 390px 标题独占整行；设置状态条窄屏隐藏分隔点；全局 `:focus-visible` 金色 2px 焦点环；补 1024/390 深浅截图 + 1440 焦点态。
- [x] `chore: 30633d5` 收入 `next dev` 自动追加的 AGENTS.md 规则块。

### Key Decisions
- 左轨默认 64px、`\` 展开到 208px，主题切换放轨底 | Reason: DESIGN §3 要求 64px 图标轨，同时保留既有 `\` 快捷键与主题入口。
- 顶栏持有唯一 h1（页面名），工作台/评估等内容标题降为 h2 | Reason: 避免重复 h1 与标题跳级，a11y 审计要求 h1 恰好 1 个。
- `PageHeader` 导出删除，页面标题统一由 AppShell 顶栏承担 | Reason: Q4 后各页再渲染大标题会与顶栏重复。
- 无判定判断用 `summary === null || (verdictCount === 0 && judgedSamples === 0)` | Reason: 只有样本级对比、无标准判定时也应标待人工判定。

### Important Findings
- 评估记录行在 390px 下 `flex-1` 会让标题被压缩成「面…」；改为窄屏 `w-full`、`sm:flex-1` 才正常。
- `Intl.formatToParts` 只给数字，日期需显式补「月/日」，否则出现「2026 年 1111」。
- 深度主题截图必须在 localhost 源上写 `localStorage`；在 `about:blank` 写会丢，导致截出浅色。
- Q5 DOM 审计（5 页 × 1440/390）：无缺 alt、无空名称按钮、无 tabindex>0、无重复 id、无标题跳级、每页 h1=1。

### Pitfalls
- `next dev` 每次启动都会重写 AGENTS.md 的 nextjs-agent-rules 块；已单独提交，避免污染功能 diff。
- 3100 未停就跑测试会共用 SQLite；本轮已先停 dev server 再跑 typecheck/test/contrast。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 493/493 ✓；`pnpm run check:contrast` ✓（深色最低 4.70:1）；`claude-project-harness-check.mjs .` 全 pass。
- 浏览器实测 1440 / 1024 / 390 深浅双主题，`scrollWidth === clientWidth` 无横向溢出；1440 焦点态可见金色环。

### Carry-over
- [ ] 真实 ARK 密钥端到端验证（usage 落库、reasoning_content、错误码映射、评委 verdict 稳定性）。
- [ ] 已知缺口：FR-6.4 盲评的位置随机化与双向交换尚未实现。
- [ ] `.claude/harness.json`、`.claude/settings.json` 本地修改不入库。

## 2026-11-11（模板入口接通工作台）

### Completed
- [x] `3dae599`：模板页「用它开始」从禁用态改为 `/studio?template=<id>`；工作台按查询参数预填示例需求，光标置末；未知 id 静默忽略；示例只作首次初值，生成后「重新开始」恢复空输入。

### Key Decisions
- 场景模板抽到 `lib/templates.ts`，模板页与工作台入口共用一份定义 | Reason: 原先两处各自维护名称/示例，容易漂移。
- 用 server component 读 `searchParams` 再以 prop 下发，不用 `useSearchParams` | Reason: 避免给 `/studio` 增加 Suspense 边界。
- 预填只在首次进入生效（父组件 mount 后清空 seed） | Reason: 「重新开始」应回到空态，而不是再次塞入模板示例。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 496/496 ✓；harness check 全 pass。
- CDP 实测：6 个入口 href 正确且均非 disabled；`template=content` 预填文案与光标位置正确；未知 id 输入框为空且无错误遮罩；生成完成后「重新开始」输入框为空。

## 2026-11-11（盲评双向交换）

### Completed
- [x] `d9871fd`：FR-6.4 位置随机化与双向交换。`buildJudgeMessages` 支持 `target-first` / `baseline-first`；有基线时正反各判一次，`comparisonFromTarget` 把反向结果翻回目标视角，`reconcileComparison` 只在两向一致时采用，冲突记 `same`；标准判定只取正向一次，避免把基线判定算进通过率。

### Key Decisions
- 双向判定只用于 comparison，不通两倍判标准 | Reason: criterion verdict 必须针对目标版本，反向那次的 A 是基线，用了会污染 passRate。
- 冲突归为 `same` 而不是丢弃 | Reason: 保留「有判定但方向不可信」的事实，胜率分母只见 decisive，不受影响。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 500/500 ✓；harness check 25 pass / 0 fail。
- 新增单测覆盖 A/B 顺序、反向翻向、合并冲突；集成测试让两个版本输出可区分，双向判官一致时胜率仍为 1（交换后不反转）。

## 2026-11-11（版本回滚与收藏）

### Completed
- [x] `cf64a46`：FR-7.5 版本回滚 UI。详情面板选中历史版本后可「回滚到此版本」，PATCH 以 `origin: 'rollback'` 追加新版本并记录 `parentVersionId`；当前版本禁点；成功后提示「已回滚到 vN，生成 vM」并刷新列表。
- [x] `ef0c28f`：FR-8.5 收藏。列表行右侧独立书签按钮（`aria-pressed`，选中时金色填充），PATCH `favorite` 只改元信息、不产生版本；失败回滚乐观更新并显示 `role="alert"`；工具栏「只看收藏」筛选带计数，收藏为空有独立空态。

### Key Decisions
- 回滚是追加而非移动指针 | Reason: 版本历史不可变，回滚结果本身也要可追溯、可再评估。
- 收藏按钮做成列表行的兄弟节点而不是嵌套在行按钮里 | Reason: 避免 button 套 button 的非法 HTML 与键盘事件冲突。
- 收藏用乐观更新 + 失败回滚 | Reason: 本地库操作应即时反馈，网络失败时状态不能悬空。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 502/502 ✓；`pnpm run check:contrast` 全通过（最低 4.70:1）；harness check 24 pass / 0 fail。
- CDP 实测：收藏后详情与列表接口均返回 `favorite: true`、版本数不变；刷新后 `aria-pressed` 仍为 true；筛选后仅剩 1 行且统计为「1 条收藏 · 共 11 条」；取消收藏落入「收藏为空」空态；1440 / 390 深浅截图确认书签填充与布局。

### Carry-over
- [ ] 标签编辑、分页、最近使用、版本间 diff 对比仍未做。
- [ ] `.claude/harness.json`、`.claude/settings.json` 本地修改不入库。

## 2026-11-11（库元信息编辑）

### Completed
- [x] `f42c157`：FR-8.1 提示词详情内「编辑信息」。标题、描述、标签三项走 PATCH 元信息，不产生新版本；空标题前端拦截；保存后同步详情与列表行，版本时间线不变。

### Key Decisions
- 编辑入口放在详情操作行，与「继续编辑」并列 | Reason: 元信息编辑与版本编辑是两类动作，放在一起容易混淆；复用现有操作区最省层级。
- 保存按钮用 secondary 而非 primary | Reason: 同屏已有「基于 vN 继续编辑」primary，DESIGN 限制单屏 primary 1 个。
- 编辑态隐藏「继续编辑」操作行 | Reason: 表单填写期间避免两个主路径同时争注意力。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 503/503 ✓；`pnpm run check:contrast` 全通过；harness check 24 pass / 0 fail。
- CDP 实测：预填当前值；标题置空保存出现「标题不能为空。」且表单不关闭；填入新标题/描述/标签后保存，接口与页面标题、标签 chip、列表行同步，`versionCount` 仍为 1；验证后已恢复原始元信息。

### Pitfalls
- 残留 dev server 占用 3100 会让新 `pnpm dev` 静默失败（EADDRINUSE），浏览器仍由旧进程供页，表现为新代码「没生效」；起服务前必须确认端口真正释放。

### Carry-over
- [ ] 分页、最近使用、版本间 diff 对比仍未做。
- [ ] `.claude/harness.json`、`.claude/settings.json` 本地修改不入库。
