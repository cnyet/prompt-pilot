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

## 2026-11-11（版本间 diff）

### Completed
- [x] `3e11bca`：FR-7.5 任意两个版本对比。详情时间线下方新增 `VersionDiff`：基准/目标两个下拉，默认 v0 与最新版本；复用 `components/studio/diff.ts` 的行级 LCS，输出新增/删除行数、红绿底纹与 +/- 标记，方向随选择反转；无文本时给出空提示。

### Key Decisions
- 复用已有 `diffLines` 而非另写对比算法 | Reason: 工作台字段建议已在用同一实现，避免两套 diff 语义漂移。
- 组件内部持有下拉状态并以 `detail.id` 作 key | Reason: 切换提示词自动回到 v0/最新，不需要额外的重置 effect。
- 对比区放在时间线之后、版本内容之前 | Reason: 先选版本再读内容；对比是时间线的自然延伸。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 503/503 ✓；`pnpm run check:contrast` 全通过；harness check 24 pass / 0 fail。
- CDP 实测：3 个版本默认 v0→v2 得 0/0（内容相同）；切到 v1 得「新增 88 行 · 删除 1 行」，88 个 `+` 与 1 个 `-`；反向 v1→v0 得「新增 1 行 · 删除 88 行」；同版本全 same；深浅截图均正常。

### Carry-over
- [ ] 分页、最近使用仍未做；真实 ARK 链路仍缺 key。

## 2026-11-11（最近使用）

### Completed
- [x] `8c32e9d`：FR-8.5 最近使用。`Prompt.lastUsedAt` 可空字段 + 索引；打开详情后 PATCH `{ markUsed: true }`，服务端 5 分钟内去重，并显式回写原 `updatedAt`，避免使用被当成编辑；列表返回 `lastUsedAt`，库页新增「最近使用」排序，未使用项显示「尚未使用」并排在后面，同一组按更新时间倒序。

### Key Decisions
- 用 `markUsed` 布尔标记而不是让 GET 详情产生写副作用 | Reason: 读接口保持无副作用，使用记录由显式动作触发。
- 服务端去重 5 分钟 | Reason: 避免反复打开造成高频写库；同一会话内排序结果足够稳定。
- 保留 `updatedAt`，只写 `lastUsedAt` | Reason: 「最近更新」和近七天统计应只反映内容变更。
- 排序在前端做，API 保持 `updatedAt desc` | Reason: 列表上限 100，前端排序足够，且现有搜索/收藏筛选都走本地。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 505/505 ✓（新增 markUsed 写入、updatedAt 不变、去重、false 拒绝四项断言）；contrast 全通过；harness 24 pass / 0 fail。
- CDP 实测：切换到最近使用后 11 条均显示「尚未使用」；打开一条后接口 `lastUsedAt` 写入、`updatedAt` 与版本数不变，该行升到首位并显示「最近使用 2026/11/11 14:00」；重复打开时间戳不变；1440 深浅与 390 截图正常，390 无横向溢出。

### Pitfalls
- 项目没有 `prisma/migrations/`，不要臆造 migration；改 schema 用 `pnpm exec prisma db push` + `prisma generate`。

### Carry-over
- [ ] 仅剩列表分页；真实 ARK 链路仍缺 key。

## 2026-11-11（工作台输入、主路径模板、品牌与设置）

### Completed
- [x] `4e5a856`：工作台输入区放大（桌面 240px、移动 196px，7 行，可纵向拉伸）；场景入口改为复用 `lib/templates.ts`，新增并置顶 featured「一句话扩写」。
- [x] `4e5a856`：新增 `BrandMark` 印章式 P + 导引星，替换左轨「PP」；新增 `app/icon.svg`；AppShell 底部统一版权条「© 2026 PromptPilot · 本地优先的提示词工坊」。
- [x] `4e5a856`：设置默认网关改为 `https://opencode.ai/inference/go`；生成模型 `deepseek-v4.1-flash`（显示 DeepSeek V4.1 Flash），评估模型 `gpt-5.6-luna`（显示 GPT 5.6 Luna）；默认 provider 改 `openai_compatible`，避免向网关发送方舟专属字段。
- [x] `4e5a856`：成本区新增近 14 天柱状（调用次数）+ 折线（已知金额）组合图，左右双轴、上海时区切日、未知金额不入折线、`role="img"` + `sr-only` 明细表；删除设置「快捷键」分区与导航。
- [x] 本地 SQLite 清理：12 条重复提示词删到 3 条（6 个版本），备份 `data/app.db.bak-20261111-1430`；保留周报、向量数据库、产品周报三条真实内容。

### Key Decisions
- 模型 ID 不能含空格，用 kebab slug 存储，界面经 `modelDisplayLabel()` 映射显示名 | Reason: 同时满足 ID 校验与用户可读名称。
- opencode 网关走 `openai_compatible` 而非 `ark` | Reason: 避免适配层注入 `thinking` / `service_tier` 等方舟专属参数。
- 趋势图金额未知时不补 0、不画折线，只在图下图注未知调用数 | Reason: 沿用「未知一律 null」契约，不伪造数据。
- 清理脏数据前先停 3100 并备份数据库 | Reason: SQLite 单文件，避免运行中写入与误删不可回滚。

### Verification
- `pnpm run typecheck` ✓；`pnpm test` 506/506 ✓（新增上海时区按日聚合、未知金额排除断言）；`pnpm run check:contrast` 全通过（浅色最低 4.51:1，深色 4.70:1）；harness 24 pass / 0 warn / 0 fail。
- CDP 1440/390 实测：输入框桌面 240px、移动 196px 且无横向溢出；模板页 7 张卡、首张「一句话扩写」、1 张 featured；设置 base URL 与两个模型 ID 正确、导航仅模型/成本/数据、无「快捷键」、图表有 aria-label；库页 3 行；深浅两套 Logo 与版权条正常；`/icon.svg` 返回 200。

### Pitfalls
- `DEFAULT_MODEL_PRICING_CNY` 尚未收录 DeepSeek V4.1 Flash 与 GPT 5.6 Luna，真实调用成本会先显示未知，需在设置价格覆盖或补表后才进折线。
- 新模型 ID 含点号可过校验，但含空格必失败；不要直接拿显示名当 ID。

### Carry-over
- [ ] 真实网关密钥端到端验证；[ ] 新模型价格补表；[ ] 列表分页。

## 2026-11-11（待办：设置测试与成本分页）

### Pending
- [ ] 设置-模型区增加「测试」按钮，用当前表单配置做连通性校验，需先确认是否已有 API 路由可复用。
- [ ] 设置-成本区域分页显示，按阶段/模型表与明细统一分页规则，未知值仍显示「—」。

### Context
- 当前会话触发压缩抖动（87k，两次压缩间隔 461s），按规则先 PERSIST 再 `/clear` 续接。

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

## 2026-11-13（Phase 0 收口：遗留改动验收 + 文档基线）

### Completed
- [x] 验收并提交工作区遗留改动（`fc00f4c`，独立于 v3）：ARK 默认端点补 `/openai/v1` + `normalizeArkBaseUrl` 旧地址自动规范化 + opencode 网关 `x-opencode-session` 头；测试改独立 `data/test.db`（`tests/global-setup.ts` + `tests/setup-env.ts`，清真实密钥），跑测试不再停 3100；流式首 token 超时 90s、内容后 15s 停顿检测；ping max_tokens=16；八字段 maxTokens 8192。验证：typecheck ✓、512/512 测试 ✓、harness 24/24 ✓。
- [x] 建分支 `feat/v3-result-first`；开发库备份 `data/app.db.bak-20261113-1047`。
- [x] Phase 0 文档收口（`f3a281d`）：ADR-0007 新建（结果优先重置，取代 ADR-0001/0003/0004 相关结论）；`docs/ROADMAP.md` 删除（git rm）；CONTEXT.md 词表重写（记录/迭代/检查/对比原文，v2 词标废弃）；ARCHITECTURE.md 重写为 v3 契约（数据模型含 copiedAt/originTemplateId、API 表、SSE+元数据协议、diff、R101-R108、安全/性能/幂等/迁移）；HANDOVER.md 重写（过渡态：文档已 v3、代码仍 v2）；README.md 重写；ROADMAP-V3 同步埋点字段、测试基线 512、test.db 隔离口径。
- [x] P0-2：PRODUCT FR-9.1 删「说明」阶段，stage 落库值 generate/optimize/repair，无「说明」调用。P0-3：copiedAt/originTemplateId 埋点写入 PRODUCT 成功指标与 ROADMAP schema。P1：FR-4.5 改写（中断≠失败）；DESIGN 7 处修正（当前步骤底/字段标题/版本号→迭代序号/当前阶段删、三步统一、设置两段、glow box-shadow 唯一例外）。

### Verification
- check:contrast 浅深全过（最低深色 4.70:1）；harness 24/24 pass。
- design-parser.mjs 脚本本机已不存在（上会话插件环境），DESIGN.md 本轮仅正文文字改动、六段结构与 frontmatter 手工核对通过——下轮改 DESIGN 结构时需先解决解析器缺失。

### Key Decisions
- ARCHITECTURE.md 采用「v3 目标契约 + 现状声明」结构：文档描述 v3，冲突以文档为准；v2 细节交给 git 历史。Reason: 评审 P0-1 禁止两套协议并存描述。
- HANDOVER 如实写过渡态：文档已收口 v3、代码仍运行 v2，Phase 6 前旧约定（流式只写 pending 等）在 v2 代码存活期继续有效。
- stage 枚举定为 generate/optimize/repair；「说明」不单独调用模型，随优化正文一次产出。

### Carry-over
- [ ] P1 剩余：NFR-9 i18n 决策（字典或降级）；AC 补缺（FR-1.1/1.2/1.3/2.4/6.3/8.4/10.3/11.2）与 AC-17/19/20 去重；design.json colorMeta 补全 28 色 darkValue。
- [ ] P2 批次（11 条，见 todo-tracker）。
- [ ] DESIGN 主题切换位置 vs AppShell.tsx 侧栏底部对账（Phase 2）。
- [ ] Phase 1 数据层与 API（3 人日）：前置已全部清空，可开工。

## 2026-11-13（续：P1/P2 剩余项收口）

### Completed
- [x] P1 全部完成（`6bd7233`）：NFR-9 定稿首版单一字典模块（`lib/i18n/zh.ts`，t(key) 形状，不承诺英文）；AC 补缺 AC-21 到 AC-28（覆盖 FR-1.1/1.2/1.3/2.4/6.3/8.4/10.3/11.2）；design.json colorMeta 补全 28 色 darkValue（canonical=浅色、darkValue=深色，与 globals.css 逐项核对）+ 新增 tokenMapping（语义名 → 运行时 CSS 变量，28 条映射）。
- [x] P2 全部完成：FR-6.6 评分限定完成或已中断记录；ROADMAP 幂等改两层（记录层 LRU 拦 /api/generate 首轮 + 迭代层 requestId 唯一约束）；LlmCall 补 cachedHit（Boolean?）；删除记录置空 LlmCall 关联；内置模板文本类改为四风格各一条（周报/公文、种草/营销、数据结论/分析、代码评审/代码）；V3-17 补 Zod 输入边界测试。
- [x] AC 分配去重：Phase 2 → AC-1..7、19..24、27；Phase 3 → AC-8/9/25/28；Phase 5 → AC-12..14、17、26；Phase 6 → AC-15/16/18 + AC-1..28 全量回归。PRODUCT 侧 AC 无分配，无双算。

### Verification
- check:contrast 全过；harness 25/25（比上轮多 1 项 pass）；typecheck 零错误。纯文档改动，未跑 test。

### Carry-over
- [ ] DESIGN 主题切换位置 vs AppShell.tsx 侧栏底部对账（Phase 2）。
- [ ] 恢复 design-parser.mjs 或替代结构校验（改 DESIGN 结构前）。
- [ ] Phase 1 数据层与 API（3 人日）可开工。

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

## 2026-11-13 Batch C（SSE 路由与账本关联）

- 提交链：`03a26ea` ledger 加法（LedgerStage、recordId/iterationId）→ `59eb9b6` lib/db/records.ts 写路径 → `66df02f` /api/generate 首轮 SSE → `03e96da` 共享流收敛到 lib/engine/stream-v3.ts（refactor）→ `2e67025` optimize/repair 路由 → `4d9af1f` 修复（completeIteration 失败收敛为 failed；META 泄漏测试改注入 provider；P2002 重放测试）。
- 验证：typecheck 0；全量 53 文件 / 579 用例通过；harness 唯一 fail 为 ACTIVE_CONTEXT 超 4KB 预算。
- 关键裁定（ledger 有全文）：
  - 记录 status 跟随迭代 status（canceled 时记录 canceled，用量排除在 completed 聚合外）。
  - finishReason `length` 视为 invalid_output 失败、不保留正文（代价：撞 8192 上限丢正文）。
  - record.title 仅 /api/generate 按 meta.title 更新，optimize/repair 不改标题（FR-6.3）。
- 踩坑：valid mock（lib/llm/mock.ts）不输出 META 分隔符，早期 META 泄漏断言空转；已改为测试内注入带 marker 的 provider。
- 踩坑：首个 Task 3 实现者 API 超时后无产出；改派全新实现者成功。
- 待办：Batch C 整分支 final review（6087412..HEAD）；minor/parked 项 triage；finishing-a-development-branch。
- 已记录的 minor：generate-v3-route 的 marker 断言仍空转（由 stream-v3-meta 覆盖）；optimize 对首轮失败记录无空源守卫；409 字面量重复。

## 2026-11-13（续：Batch C 整分支 final review）

### Completed
- [x] Batch C 整分支 final review（`6087412..HEAD`，opus verifier，只读）：APPROVE_WITH_FIXES；typecheck 0；53 文件 / 579 用例通过；冻结契约 FROZEN_OK；测试前后 data/app.db mtime 不变。
- [x] 修复 F1/F2（`e61796d`）：见 Key Decisions。新增并发追加、续写失败保留记录、running 迭代 409 三组测试；修正 2 处被旧行为固化的断言。收口 typecheck 0、53 文件 / 582 用例全过、harness 无 fail。
- [x] ledger minor triage 落 `.superpowers/sdd/2026-11-13-v3-batch-c/progress.md`：FIX-NOW 2（已完成）/ DEFER 9 / DROP 7。

### Key Decisions
- 并发互斥从记录 status 移到迭代层：同记录存在 running 迭代即视为在飞；同 requestId 重放跳过该检查，仍走 P2002 幂等重放。
- 续写失败不回滚记录状态：`failIteration` 仅在 `iterationCount===0`（首轮失败）时把记录置 failed；后续轮只标迭代，latestOutput 与 completed/canceled 状态不变，保留评分与收藏资格（FR-6.6）。
- SSE 外层 catch 将 `RecordInFlightError` 映射为 `ITERATION_IN_FLIGHT`（retryable false），其余仍 LLM_UNKNOWN。

### Pitfalls
- 记录级 running 在续写路径从未被写入，原 409 守卫形同虚设；只查 record.status 无法防并发。
- `appendIteration` 加在飞检查后，“连续追加两轮且都不完成”的旧测试会改抛 RecordInFlightError；测试需先 complete 或带同 requestId。

### Carry-over（Batch D/E）
- generate 路径的 P2002 清理空记录无测试；abort 重放不应多发 meta（仅 completed 发）；失败重放 errorCode 需迭代表加列。
- 首轮失败记录的空源守卫；空 canceled 记录列表过滤；客户端把无 done 的流按 failed；日志收敛为 error.name+code；409 字面量并入 jsonError。
- 残余风险：failIteration 自身失败时首轮记录可能停在 running，Batch D 加超时恢复。

### Integration
- [x] finishing-a-development-branch：按用户指示合入 `main`（快进 fc00f4c → 5d607b1），删除 feat/v3-result-first；合并结果复跑 typecheck 0 / 582 用例 / harness 无 fail。先误建 develop 分支，用户纠正后已删除，未 push。

## 2026-11-13 Batch D（records API Task 1）

### Completed
- [x] Batch D 计划落盘 `docs/superpowers/plans/2026-11-13-v3-batch-d.md`（5 任务：records API、templates API + 12 seed、stats-v3、Batch C DEFER、docs 同步），预检 clean，实现者串行因 `data/test.db` 单文件。
- [x] Task 1 实现 `aa6878d`：`lib/db/records.ts` 加法（RecordSummary/ListRecordsQuery/RecordNotFoundError/RecordNotReadyError/listRecords/updateRecordMeta/deleteRecord）+ `GET /api/records` + `GET/PATCH/DELETE /api/records/[id]` + 16 条集成测试。
- [x] Task 1 审查（sonnet）：Spec ✅、质量 Approved、0 Critical / 0 Important / 6 Minor；唯一确认缺陷为日期 `to` 边界。
- [x] 修复 `f616ee4`：日期筛选改上海日历日闭区间；scoped re-review 判定 ADDRESSED、无新破坏；定向 16/16、全量 598/598、typecheck 0。

### Key Decisions
- 日期筛选契约：`from` = 上海当日零点（含），`to` = 上海当日整天（实现为次日零点不含）；查询层字段改名 `fromInclusive`/`toExclusive` 并 `gte`/`lt`。理由：`lib/llm/ledger.ts` 已按 Asia/Shanghai 切日，UTC 零点会与用户看到的日期差一天。
- 6 条 minor 全部 deferred 至 Batch D final review：测试清理未覆盖 template/预算键；PATCH 400 含 zod 英文；500 未记错误类型；noStoreJson/notes 解析重复；DELETE 预检 TOCTOU；updatedAt 读后写窄竞态。

### Pitfalls
- harness-verify 的 typecheck 报错可能来自实现者编辑中间态（`parseUtcDay` 已改名仍报旧名）；控制器在 HEAD 复跑 typecheck 再判断。
- 任务审查的 Minor 不进入 fix loop；只有 spec ❌、Critical/Important 或确认的 ⚠️ 才触发修复轮。

### Carry-over
- [ ] Task 2 templates API + 12 seed（BASE `f616ee4`）；随后 Task 3 stats-v3、Task 4 Batch C DEFER、Task 5 docs。
- [ ] Batch D 整分支 final review + 6 条 deferred minor triage。
- [ ] 计划文件与记忆文件在会话末合并提交。

## 2026-11-13 Batch D（Tasks 2-5 与整批收口）

### Completed
- [x] Task 2 templates API + 12 条内置模板 seed（`121ebd3`）：`lib/db/templates.ts`、`app/api/templates` GET/POST、`[id]` DELETE、`prisma/seed.ts`（slug upsert）、`pnpm db:seed`。审查 Spec ✅ / Approved / 0 Important / 5 Minor。
- [x] Task 3 v3 成本统计（`32ceb80`）：`lib/llm/stats-v3.ts`（`V3_STAGES`、上海月 KPI、null-vs-zero、budgetUsage）、`/api/stats` 切换 `getV3Stats` 保留 503/no-store。审查 0 Important / 5 Minor。
- [x] Task 4 Batch C DEFER 收口（`e70db9e`）：重放仅 completed 发 meta；optimize/repair 空源 409 `RECORD_HAS_NO_OUTPUT`；409 收敛 `jsonError`；日志 `describeError` 只记 name+code。审查 0 Important / 4 Minor。
- [x] Task 5 docs 同步（`f8b6559`）：ARCHITECTURE §4 契约、HANDOVER、README seed 命令。审查 0 Important / 6 Minor。
- [x] 整分支 final review（`369857c..e70db9e`，fable）：With fixes，0 Critical / 1 Important（docs 真源陈旧）/ 多项 minor。
- [x] Fix wave `274df1f`（15 文件）：docs 真源同步（v3 数据/API vs v2 UI、639/59 基线、Batch E next）；search LIKE 通配符字面过滤；PATCH running 守卫；DELETE 事务内复查；月费 round6；completed 重放 meta 与 `describeError` 测试；注释/契约补全。
- [x] Scoped re-review（`e70db9e..274df1f`）：7/7 ADDRESSED，无新 Critical/Important。
- [x] 控制器终验：typecheck 0；59 文件 / 639 用例通过；harness 25 pass / 0 fail；`pnpm db:seed` 两次后内置模板 4/4/4。

### Key Decisions
- `DELETE /api/templates/[id]` 二次删除返回 404 `TEMPLATE_NOT_FOUND`，覆盖 brief Step 4 的 204 幂等注释；接口契约（`DeleteTemplateResult`）为准。代价：一条路由映射与一行测试。
- PATCH 元数据遇 running 迭代按 FR-6.6 拒绝（409），不沿用 final review 的 Minor 定级；代价是数据层与一组测试。
- 搜索词含 `%`/`_` 时改为候选行内存字面过滤，保留 substring 语义与原有 SQL 前缀过滤；本机单用户量级可接受。

### Pitfalls
- `pnpm test -- <path>` 在 pnpm 10 不过滤，会跑全量；定向用 `pnpm exec vitest run <path>`。
- harness-verify 的 typecheck 报错多为子代理编辑中间态；控制器在 HEAD 复跑再判断。
- T4/T5 并行时须核对 `git show --stat`，防索引污染；本批两提交文件集互不重叠。
- Prisma 6 的 `package.json#prisma` 与 Node MODULE_TYPELESS 警告为已知良性。

### Deferred
- 20 条任务审查 minor（6+5+5+4）已 triage：final review 采纳其中 docs/搜索/PATCH/DELETE/round6/测试缺口为 fix wave；其余为测试清理、zod 英文文案、重复 helper、常数边界、503 路径未测等，均不阻塞。
- ARCHITECTURE:229 记录未来 UI 趋势图行为（FR-9.3）为 out-of-scope，留 Batch E。

### Carry-over
- [x] 用户授权后 `feat/v3-batch-d` 合入 `main`：快进 `369857c` → `1563ada`，特性分支与 `.superpowers/sdd/2026-11-13-v3-batch-d/` 已删；merged main typecheck 0 / 59 文件 639 用例 / harness 24 pass 0 fail；未 push。
- [ ] Batch E：studio-v3 UI（i18n zh.ts、diff、R101-R108、components/studio-v3/*、Rating、替换 /studio、主题切换移顶栏）。
- [ ] 真实网关密钥端到端验证；补 DeepSeek V4.1 Flash / GPT 5.6 Luna 价格表或在设置覆盖。

## 2026-11-13 Batch E（studio-v3 工作台整批）

### Completed
- [x] 分支 `feat/v3-batch-e`（base `cdc8ebc`，plan `f688f0c`）7 个计划任务全部完成：i18n zh.ts、Markdown/diff、R101-R108 本地检查、流式 reducer/usePromptStream/API、StudioWorkspace 替换 /studio、继续优化/修复/存模板、四项导航与移动底栏。
- [x] 任务提交：`0cb096c`（T1）、`ce03a04`..`6119272`（T2）、`004423a`（T3）、`585c58a`..`6de3c2a`（T4）、`cbb463f`（T5）、`cbb463f`..`ee8a370`（T6）、`ee8a370`..`7828b16`（T7）。
- [x] Final review（fable）：1 Critical C1（canceled 空输出覆盖 `latestOutput` 导致记录从库隐藏）+ Important I1 评分焦点丢失、I2 结算失败卡死、I3 优化记录可重新生成；另有 M1/M2/M7/M8/M9/M10/M11。
- [x] Fix wave `f48833d`（20 文件，+715/-96）：C1 窄修在 `lib/db/records.ts`（canceled + 空正文才不写 latestOutput）；I1 `lib/ui/meta-coalesce.ts` 单飞合并、不原生 disable；I2 结算重试 3 次后 `settle-failed` 清 settling 并显示「用量信息不可用」；I3 `lib/ui/regenerate-guard.ts` 仅生成模式；M2 Esc 提升到 window；M7 `sawDone` 守卫；M9 文案、M10 代理对安全截断。
- [x] Scoped re-review（`7828b16..f48833d`）：11/11 ADDRESSED，无新 Critical/Important。
- [x] 控制器终验（`f48833d`）：`pnpm run typecheck` 0；78 文件 / 832 用例通过；harness 24 pass / 0 warn / 0 fail。fix 报告记录 build 与 contrast 通过。

### Key Decisions / Rulings
- 只新增 `react-markdown` + `remark-gfm` 两个依赖；jsdom/Playwright 未引入（Ruling 1）。
- I1 键盘评分用真实 Chromium 冒烟验证（4×ArrowRight 焦点保持），不新增 DOM 测试依赖。
- I2 采用「重试 3 次 + 终止态」而非加超时；无超时的悬空 fetch 仍是既有 Minor（Task 4 deferred）。
- I3 只限制 UI；`/api/records/[id]/regenerate` 仍不校验模式，属 out-of-scope 观察，未扩大 write set。
- AC-6 对比：单轮优化为「原文 vs 输出」，≥2 轮可选任意两轮；`lib/ui/compare.ts` 门控。
- cancel=canceled 保留正文；failed 丢弃草稿保留已提交输出；`sawDone` 后传输错误不再改写完成态。
- `/eval` 仅保留 URL 可达，导航与命令面板条目移除（Ruling 4）。
- `prefers-reduced-motion` 全局把 animation/transition 归零（write set 扩展 `app/globals.css`）。

### Deferred Minors
- 复核新增 3 条 Minor：命令面板与流式 Esc 同在 window 层，面板打开时一次 Esc 同时关面板并取消流；I3 说明只挂在原生 disabled 按钮 title 上，鼠标与键盘都无法触达；继续优化后结算失败会沿用上一轮 detail meta，与「用量信息不可用」同屏矛盾。
- 任务阶段遗留：diff LCS 性能、R108 12000 边界、结算 fetch 无超时、optimistic meta 被陈旧 detail 覆盖、1024px 展开轨、命令面板 backdrop-blur、无密钥路径未测等，均不阻塞。
- 提示词库与模板页仍是 v2 UI（Phase 3/4）；AC-3 仅 DB/API 层验证。
- `originTemplateId` 埋点未接线；P95 首字延迟仅 Mock 单样本 163.7ms。

### Pitfalls
- harness-verify 的 typecheck 失败多为子代理编辑中间态；以提交后 HEAD 复跑为准。
- Mock valid 画像不产出改动说明/未知值，相关分支依赖单元测试。
- 浏览器自动化无法可靠在 75ms Mock 流结束前发送 Esc；用 `slow_stream` 验证中断。
- `pnpm test -- <path>` 不过滤；定向用 `pnpm exec vitest run <path>`。

### Carry-over
- [x] 用户选择本地合并：fast-forward `cdc8ebc` → `f48833d`；merged main typecheck 0 / 78 文件 832 用例 / harness 24 pass；特性分支与 `.superpowers/sdd/2026-11-13-v3-batch-e/` 已删；未 push。
- [ ] Phase 3 提示词库 v3 UI、Phase 4 模板页 v3 UI、Phase 5 设置/成本 UI、Phase 6 v2 清理。

## 2026-11-14 Batch F（提示词库 v3 UI）

### Completed
- 分支 `feat/v3-batch-f`（base `fc7ac2f`，plan `e9206d0`）4 个任务：库查询/格式化/API 客户端；v3 列表（搜索 300ms 防抖、筛选、offset 分页、行内收藏/评分/重命名）；详情抽屉（native dialog、结果渲染/源码、时间线、任意两轮对比、检查、存模板、删除）；抽屉内继续优化/修复流 + v2 库删除 + 跨路由集成测试。
- 任务提交：`e9206d0`（plan）、`dcaaccb`、`199fbe6`、`d4b5d83`、`613072f`；final fix `618f0b2`。
- 集成测试 `tests/integration/library-v3-flow.test.ts`：搜索标题/输入/正文、收藏/已评分/模式/目标类型/上海日历日筛选、PATCH 即时反映、删除后 404 且账本匿名保留、limit/offset 分页无重复。
- Final review（fable）：0 Critical；Important I1 CheckPanel 陈旧结果/修复载荷、I2 收藏/已评分筛选归属；修复 `618f0b2`（I2 新增 `applyMetaUpdate`，RED 6 失败 → GREEN；I1 加 `key={output}`）。9 条 Minor + 9 条 declined 均裁决。
- 终验（`618f0b2`）：typecheck 0；83 文件 / 857 用例；build ✓；check:contrast ✓；生产 HTTP 冒烟（/library 200、CSS `.library-drawer`×4 与 `::backdrop`×3、/api/records 200）。

### Key Decisions / Rulings
- 集成测试首次即绿（记录 API 已在 Batch D 落地），保留为 AC-8/9/25/28 跨路由回归钉；RED 缺失已记账。
- 无 Chromium / `data/app.db` 为空：手动交互冒烟以全量验证 + 生产 HTTP 冒烟替代，交互留待人工验收。
- 抽屉卸载调用 `cancelStream()+resetStream()`：关闭即取消，服务端标记已中断并保留正文。
- `applyMetaUpdate`：筛选归属在更新时维护，避免取消收藏后行残留与总数矛盾。
- CheckPanel 以 `key={output}` 重置，防止对旧正文发起修复。

### Deferred Minors
- M1 useRecordMeta confirmed 陈旧/无差异仍发 PATCH；M2 failed 流无状态文案；M3 生成单轮仍展示对比区；M4 MetaRow 混用迭代与累计值；M5 deleting 未纳入 busy；M6 无显式停止按钮；M7 未按 updatedAt 重排；M8 行点击仅标题/死代码；M9 客户端交互无 DOM 测试。

### Pitfalls
- `task-done` 脚本会把 vitest 的 learn-more 行写进账本，需按日志修正。
- 本 harness 无 Chromium，交互与焦点只能人工验收。

### Carry-over
- [x] 用户选择本地合并：快进 `fc7ac2f` → `79a101d`，特性分支已删；merged main typecheck 0 / 83 文件 857 用例 / build ✓ / contrast ✓；未 push。
- [ ] Phase 4 模板页、Phase 5 设置/成本、Phase 6 v2 清理。

## 2026-11-14 Batch G（模板页 v3 UI）

### Completed
- v3 Phase 4（V3-40..44，AC-10/11）在 `main` 本地完成：三分类 Tabs 与计数、风格筛选、12 个内置模板卡、三套程序化 SVG 封面、「用它开始」预填、自定义模板创建/删除。
- 提交：`8b7bb6d`（studio 预填与 origin）、`0610cfd`（模板库 UI）、`3e4baa9`（内置内容质量测试）、`ebde558`（卡片高度与封面可读性）、`a92c7da`（3D 标题单行）、`83b0743`（验收 Minor 修复）。
- 关键文件：`components/templates-v3/{TemplateLibrary,TemplateCard,TemplateCover}.tsx`、`app/(workspace)/templates/page.tsx`、`lib/templates-v3.ts`、`app/(workspace)/studio/page.tsx`、`lib/i18n/zh.ts`、`prisma/seed.ts`。
- 测试钉：`tests/unit/templates-v3.test.ts`、`tests/integration/templates-{store,seed,route}.test.ts`、`tests/unit/studio-v3/{composer,template-form}.test.ts`；seed 内容质量覆盖长度、禁用标点/emoji/空词、风格覆盖与预填解析。
- 终验（`83b0743`）：typecheck 0；85 文件 / 887 用例；build ✓；check:contrast 全部通过；harness 24/0/0；CDP 冒烟 26/26；焦点与长风格专项 11/11。
- 独立验收（fable max，`7f33a55..a92c7da`）：pass，0 Critical / 0 Important / 2 Minor（删除确认焦点与名称、长风格裁切）已在 `83b0743` 修复并用浏览器复验。

### Key Decisions / Rulings
- 模板页服务端解析 `?template=<id>`：`getTemplate` + `resolveTemplatePrefill`；`originTemplateId` 只挂到匹配模式的首条产出提交，模式切换或第二次提交不带。
- 模板列表载荷不含 `body`；客户端用归一化 `TemplateCard`。分类计数基于全量，风格经 `resolveStyleSelection` 在删除最后一张后回落「全部风格」。
- 数据加载失败不阻断页面骨架：客户端错误态 + 重试。无效 `?template` 回落到空生成态。
- 封面只接受内联 SVG（text 400×240 / image 400×500 / video 400×225），`aria-hidden`，无渐变、外链或占位空壳；封面文字用 `--text-muted` 保证 4.5:1。
- 内置图片模板标题由「3D 等距插画」改为「3D 插画」，避免封面单行断裂；slug 不变。
- 长风格标签通过 `max-w-full min-w-0` 的 Chip + 内层 `min-w-0 truncate` span + `title` 截断；未改全局 Chip。
- `Button` 显式声明 React 19 的 `ref` prop，供删除确认焦点管理使用。

### Unverified / Residual
- Turbopack 生产构建未在独立克隆复验（克隆的 `node_modules` 软链在 Turbopack root 外）；webpack 构建与开发服务器均通过。
- 无真实模型调用（模板页不涉及）；无像素级截图评审，布局与对比度用 DOM/计算样式与对比脚本验证。
- 本地 main 未 push。

### Pitfalls
- CDP 冒烟选择封面时用 `article > div[aria-hidden="true"] svg`；`article svg` 会混入 24px 图标。
- `--text-faint` 在 `surface-inset` / `bg-sunken` 上低于 4.5:1，封面标签禁用。
- 400×500 图片封面下，短标题（≤5 字）才稳定单行；内置标题按此约束。

### Carry-over
- [x] 本地提交完成；未 push；特性分支无（直接在 main）。
- [ ] Phase 5 设置/成本 UI、Phase 6 v2 清理。

## 2026-11-14 Batch H（设置与成本计划）

### Planned
- v3 Phase 5（V3-50..54，AC-12/13/14/17/26）计划：`docs/superpowers/plans/2026-11-14-v3-batch-h.md`，7 个任务，尚未执行。
- 任务：settings store 模型参数 → `/api/settings` 契约（模型/参数/预算）→ 测试连接角色 → 四个 v3 路由注入参数 → 设置页双模型槽与参数表单 → 成本页切 v3 stats + 预算编辑 → 文档/全量验证/独立验收。
- 基线（2026-11-14）：typecheck 0；85 文件 / 887 用例通过。

### Key Decisions / Rulings
- 设置模型角色为 generate/optimize；`modelEvaluate` 仍保留在 store/API 直至 Phase 6，v3 设置 UI 不展示。
- 参数默认 temperature 0.7、maxTokens 8192；`llm.optimize.*` 未显式设置时继承 `llm.generate.*`，视图 source 标记 `inherited`。
- 设置页成本区改用 `getV3Stats`（generate/optimize/repair），不再用 v2 `getCostSummary`。
- 预算 KPI 未设置显示「未设置」；未知费用「—」；本月 0 次调用是已知 0。
- 设置页移除「数据」分区；移除客户端可见 `ARK_API_KEY` 文案以满足 AC-17。
- 不新增设置来源；仍为 SQLite 覆盖 > 环境变量 > 代码默认。

### Pitfalls
- `PUT /api/settings` 当前静默丢弃 `modelOptimize`，且无预算字段；改动时必须先补契约测试。
- 四个 v3 路由硬编码 `maxTokens: 8192`，且不传 temperature；改参数后需 `grep -R "maxTokens: 8192" app/api` 验证清零。
- 成本页仍 import `lib/llm/ledger.ts` 的 `getCostSummary`；切换时注意 `STAGE_LABELS` 与 v2 `compose` 阶段残留。

### Completed（2026-11-14 执行）
- [x] 任务 1-6 实现并分别提交：`04bbb7b` store 参数与继承、`9cb5a28` settings API（模型/参数/预算）、`665b4ad` 连通性 generate/optimize、`b560114` 四个 v3 路由注入参数、`09ba9a8` 设置页双槽与参数表单、`c5da7ef` v3 成本 KPI + 预算编辑（`lib/budget.ts`、`BudgetSetting`、`SettingsNav` 去数据区、`BudgetNotice` 共用阈值）。
- [x] 任务 7 文档：`2793ee4` 更新 ARCHITECTURE 设置 API 契约与 HANDOVER（v3 状态、`ARK_MODEL_OPTIMIZE`、代码地图、Phase 6 next）。
- [x] 全量验证（HEAD `2793ee4`）：typecheck 0；88 文件 / 906 用例；build ✓；contrast ✓；harness 24/0/0。
- [x] AC-17 客户端扫描：`.next/static` 无 `ARK_API_KEY` / `Bearer`；`sk-` 仅 `mask-*`、`task-list-item` 误报。
- [x] CDP 冒烟 22/22（隔离空库 `data/smoke.db`，用后删除）：生成/优化槽与参数默认 0.7/8192；四 KPI；预算 100 → 0%，清除 → 未设置；1440/1024 无横向溢出。
- [ ] 独立 verifier 未跑（会话压缩抖动，按 hook 轮转；新会话第一动作）。
- 未冒烟：stats null 分支（同目录第二个 `next dev` 被单实例锁拒绝）。

### Execution Rulings
- 设置页成本 KPI 在零调用时显示 ¥0 / 0（已知 0），未知费用仍「—」；预算使用率按 `formatBudgetUsage` 优先判定未设置。
- 预算提示阈值与百分比统一在 `lib/budget.ts`；工作台 `BudgetNotice` 改用它，i18n 去掉重复 `%`。
- `docs/HANDOVER.md` 同步到 v3 现役状态，而不只改环境变量表：原文停留在 Batch D，会误导接手者。

### Execution Pitfalls
- 裸 `grep -E "ARK_API_KEY|sk-|Bearer" .next/static` 会因 CSS `mask-*`、`task-list-item` 产生 453KB 输出；AC-17 应分模式核验。
- 同目录不能并行两个 `next dev`（Next 16 单实例锁）；隔离库冒烟需先停旧 server，或换目录跑。
- `BudgetNotice` 中 `usage` 的 null 收窄必须显式 `if (usage === null)`，不能靠 `budgetLevel` 的返回值反推类型。

### Carry-over（更新）
- [ ] 新会话派 `verifier` 验收 Batch H（AC-12/13/14/17/26），通过后收口。
- [ ] Phase 6 v2 清理。
- [ ] 本地 main 未 push。
