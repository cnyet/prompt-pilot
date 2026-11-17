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

### Independent Verification（2026-11-14）
- verifier 独立验收 `9dbac52..2793ee4`（`2793ee4..f4d3749` 仅 memory），结论 Accept：AC-12/13/14/17/26 全 PASS，Review Focus 8/8 PASS，无 Critical/Important。
- verifier 自跑证据：harness 24 pass / 0 fail；typecheck 0；88 文件 / 906 用例；build ✓；contrast ✓（最低 4.70:1）；AC-17 `.next/static` 无 `ARK_API_KEY` / `Bearer` / key 形态 `sk-`（40+ 命中均为 Tailwind/CSS 误报）。
- 代码级确认：stats null 分支可读；长模型 ID / 「未设置」/「—」用 `min-w-0` / `break-words` / `flex-wrap` 防溢出；generate 与 optimize 可用同一模型。
- 未复验：浏览器冒烟（verifier 未起 dev server）；stats null 与溢出为代码级判断。
- Minor（不阻塞，Phase 6 或后续顺手）：v3 设置客户端仍有「离线模板模式」旧文案；KPI 标签「本月调用」vs FR-9.2「本月调用次数」；ARCHITECTURE 掩码示例 `••••9f3a` vs 实现 `…9f3a`；`maskKey` 对 <4 字符 key 返回全量。

### Carry-over（verifier 后）
- [x] Batch H 独立 verifier 验收通过（Accept），收口。
- [ ] Phase 6 v2 清理。
- [ ] 本地 main 未 push。
- [ ] 可选：Batch H 4 条 Minor 文案/文档漂移收口。

## 2026-11-14 Phase 6（v2 清理与收口）

### Completed
- Tasks 1-5 完成（未提交，按 ruling）：shell 脱离 `/api/run`；删除 v2 UI、`/eval`、v2 API/引擎/测试；移除 `modelEvaluate` 契约；重写 v3 HTTP E2E；归档 v2 文档；可访问性/响应式/减少动效检查；备份后删除十张 v2 旧表。
- 库表只剩 `AppSetting`、`LlmCall`、`PromptRecord`、`PromptIteration`、`Template`；备份 `data/app.db.bak-20261114-2027`（831,488 字节，`PRAGMA integrity_check=ok`）。
- 基线：harness 25 pass / 0 fail；typecheck 0；59 文件 / 537 用例；clean build ✓；`pnpm e2e` ✓；contrast 最低 4.70:1；浏览器冒烟 4 页 × 1440/1024、键盘顺序、抽屉、reduced motion 全过。
- 最终独立 verifier（fresh context，opus）结论 Accept with minors，无 Critical/Important；其自跑 typecheck、537 用例、build、e2e、contrast、harness 与库表/备份检查均通过。

### Key Decisions / Rulings
- 不在未获用户要求时提交或 push；Phase 6 全部改动留在 main 工作树。保留 `.superpowers/sdd/2026-11-14-v3-phase-6/` 直到用户提交后再删，因账本是未提交变更的唯一记录。
- 旧表删除前先备份并获用户明确确认；`LlmCall` 的历史关联列与索引保留，不重写账本。
- E2E 查询参数用路由实际的 `q`（计划写 `query`）；测试输入追加 run tag 以保证标题命中；均记入 ledger。
- 浏览器冒烟必须用 `localhost` 而非 `127.0.0.1`（Next dev 阻止跨源客户端资源，React 不 hydration）；库行打开控件是标题按钮，不是 `aria-label="查看记录"`。
- `.env.example` 受权限策略阻止，记录为未验证文档项，未绕过。
- 测试基线从 536 更新为 537（新增短密钥掩码用例）。

### Pitfalls
- `Page.navigate` 后仅等 `location.pathname` 会命中旧页面；必须等 `Page.loadEventFired` 并轮询 `document.body`。
- 浏览器冒烟在无 hydration 时输入只改 DOM，不改 React 受控状态，按钮仍 disabled。
- `next dev` 用 IP 源会阻止 `/_next/hmr` 等资源，导致客户端脚本不运行。
- 归档 v2 文档后要扫 README/HANDOVER/ARCHITECTURE/ROADMAP 的旧链接与 "旧表待删" 措辞。
- Prisma `db push --accept-data-loss` 只提示非空表；空表也会被静默删除，删除前仍以 `.tables` 与备份为准。

### Deferred minors（final review）
- HANDOVER 列了 `MOCK_LLM_FAULT=network`，但 mock 无该 profile，设置后静默无效。
- `lib/llm/mock.ts` 的 mock 输出仍用「试运行 / 变量」等 v2 词，仅显式 valid mock 时可见。
- ARCHITECTURE 两处「在备份 data/app.db 后删除」措辞有歧义，未点明备份文件路径。
- `.env.example` 未验证（可能仍列 `ARK_MODEL_EVALUATE` / 缺 `ARK_MODEL_OPTIMIZE`）。

### Carry-over
- 未提交、未 push；用户确认后可提交 Phase 6 变更并删除 `.superpowers` 工作区。
- 接真实 ARK 密钥验证流式 usage、`reasoning_content`、错误码映射。
- 可选项：处理 4 条 deferred minors。

## 2026-11-16（impeccable 三连：layout → polish 工作台 → polish 其他页面）

### Completed
- **A `/impeccable layout`**：工作台改 960px 上下单列，tabs 置输入卡片顶部（优化在前）、主输入放大到 280px、结果面在下并于提交后滚入视野；结果优先、过程隐身。用户曾选「优化在前，默认生成」。
- **B `/impeccable polish` 工作台**：默认 tab 改为优化（覆盖 A 的「默认生成」）；流式加 `now-pulse` 状态文字与 `stream-caret` 金色光标；进行中主按钮原位切换为「停止」（两个分支同位置 Button，React 调和保留焦点，不弹到 BODY）；改 ADR-0002 增补状态信号与「不用骨架屏/进度仪式代替结果」硬规则；composer 默认 mode='optimize'、测试同步。
- **C `/impeccable polish 继续优化其他页面样式`**（Operate 模式，精度与克制，非重设计）：三页（/library /templates /settings）1440/390 深/浅主题浏览器核验后，定位唯一根因：settings 两处输入绕过了共享 `inputStyles`。`LlmSettingsForm.tsx` 的 `inputClass` 与 `BudgetSetting.tsx` 的行内 className 改为 `cn(inputStyles, 'h-9')`（预算再 + 'tnum'）。原一次性类有 `focus:outline-none` 却无替代焦点环、无 `aria-[invalid=true]` 危险态、无 `disabled:`/`read-only:`、带 ad-hoc inset bevel shadow，且两文件逐字重复。
- 收尾核验：`git diff --check` clean；`pnpm run typecheck` 0；`pnpm test` 59 文件 537/537；harness 25 pass / 0 fail；impeccable detect `[]`；settings 实测 `focus-visible` 聚焦环、`aria-invalid` 危险环（`oklab(... / 0.25) 3px`）+ `role=alert` 校验文案生效；浅色主题 `#f3ead8` 页面渲染干净、金色聚焦环、无横向溢出。
- 临时环境全清：隔离 dev 3101、`data/polish2-smoke.db`、bsk session `ygmq`、`/tmp/polish2-*`；`data/app.db`（831488 字节，mtime 11:00）未触碰。

### Key Decisions / Rulings
- B 的默认「优化」覆盖 A 的默认「生成」；PRODUCT/DESIGN/ARCHITECTURE/ADR-0002/README 相关条款与测试同步为优化。
- C 严格按 polish 的「保留既有视觉世界」：不加 rise/reveal（ADR-0002 硬性「同类动效同屏只出现一次」、craft-floor「不为让 polish 可见而加动效」）；不改共享 shell 的 ModelStatusBanner 在 /settings 的自链（越界）；不启动 fan-out；不重设计、不换文案。无 critique snapshot 被读取，故不跑 `critique-storage close`。
- `border-danger` 在 `aria-invalid` 时边框色仍是 `rgb(92,61,46)`、仅危险 ring 变化，是 `components/ui/Input.tsx` 全站既有 token 行为（LibraryFilters/Textarea 同款），非本次回归，刻意不动。
- 改动全部未提交、未 push（用户未要求）；HEAD `09ac638`。本地 3100 仍是旧生产构建，看新 UI 需 `pnpm build && pnpm start`。

### Pitfalls
- bsk 每个共享 tab 动作（navigate/evaluate/fill/click/emulate）都需一个未使用的 `cooperate sync` 顶层 `observation_id` + `context_id`，动作间不得插入 screenshot/observe（会消耗它）；`grep head -1` 会抓到 stale 的 `previous_observation_id` 或嵌套值，改用 `python3 -c "json.loads(sys.stdin.read(),strict=False)"` 取顶层键；`json.load` 会因控制字符失败，必须 `strict=False`。
- `bsk evaluate` 的 `<EXPRESSION>` 是位置参数，`--return-by-value true` 是布尔 flag，不是脚本值；`bsk click --ref ""` 会 invalid_params，改用 evaluate 里 `btn.click()`；React 受控输入用原生 setter + `input` 事件驱动。
- `bsk session stop` 的 session id 是位置参数（`bsk session stop ygmq`），不是 `--session`。
- Tailwind v4 `@utility`/`@layer` 嵌套让 CSSOM `selectorText` 遍历查 `border-danger` 返回空，不能据此判定样式不存在；以 computed style / 实测为准。
- 程序化 `el.focus()` 不触发 `focus-visible`（Chrome 需键盘输入），聚焦环须靠 class 存在 + 键盘 Tab 核验。

### Carry-over
- 用户确认后统一提交三连 + Phase 6 累积改动，并删除 `.superpowers/sdd/2026-11-14-v3-phase-6/` 工作区。
- 接真实 ARK 密钥端到端。4 条 deferred minors 仍未处理。

## 2026-11-16（阿里云部署文档，仅文档阶段）

### Completed
- 用户说「本项目将部署到阿里云服务器，先编写部署文档，部署工具用 `~/agents/skills/qianwenai-deploy`」。新增 `docs/DEPLOYMENT.md`（253 行）+ README 文档索引一行。**未部署、未建云资源、未装 CLI、未提交/未 push**。
- 路径纠正：工具真实位置 `~/.agents/skills/qianwenai-deploy`（带前导点），`~/.openclaw/skills/qianwenai-deploy` 是其软链；用户给的路径少了点。
- 文档覆盖：适用范围与国内站限定、三种模式、14 步硬门禁、项目画像（APP_NAME `prompt-pilot` / app_port 3100 / nginx_mode proxy / 无 RDS 跳过步骤 5）、四项项目侧前置改动、上线验证、热更新/释放、费用、未决项。
- 核验：`git diff --check` clean；README 12 条本地链接 0 broken；`data/` 为 app.db 831488B + 4 个备份；`prisma/seed.ts` 确认 12 条模板按 slug `upsert` 幂等；`aliyun` CLI 仍 absent；无 `.qianwenai-deploy*` 状态文件。逐条重验了 skill 模板声明（systemd.sh Node 20 + `yarn install --production` 且无 build；nginx_proxy.sh `proxy_read_timeout 60s` / 无 `proxy_http_version 1.1` / `/healthz` 桩；docker.sh `docker run --rm` 无卷且 `--env-file` 仅 RDS 路径；ros_single.yaml AppPort 默认 8080、SG 80/443 `0.0.0.0/0`；upload_artifacts.py 排除表不含 `data/`/`.env*`）。
- doc-only 任务，**未重跑** typecheck / test / harness（上一阶段 2026-11-16 全绿：537/537、harness 25-0-0）。

### Key Decisions / Rulings
- **不能直接用内置 systemd+node 路径**：装 Node 20（项目要 >=24）、`yarn install --production` 跳过 prisma/tailwind 等 devDeps、完全不跑 `prisma generate`/`next build`/`db push`/`db:seed`，`next start` 无 `.next/` 必失败。建议补多阶段 Dockerfile 走 `--app-type docker --app-mode docker-image`；**Dockerfile 本次未创建**（工具不改用户代码，且需用户确认后单独阶段）。
- **产物洁净性**：`upload_artifacts.py` 排除表不含 `data/` 与 `.env*`；`data/app.db` 含记录正文与设置页保存的 `ARK_API_KEY`（FR-8.1），从仓库根打 binary 包会送进临时 OSS 桶。docker-image 模式产物仅 image.tar，天然规避；binary 模式必须改用干净暂存目录。compose 模式还会自动加载 `/opt/qianwenai/.env`。
- **SQLite 持久化**：docker.sh `docker run --rm` 不挂卷、systemd 热更新整体 `mv /opt/qianwenai`，两者都丢库。决策改绝对路径 `file:/var/lib/prompt-pilot/app.db` + 宿主目录挂载，路径在应用目录之外；ECS 系统盘是唯一副本，释放前必须备份。
- **密钥注入缺口**：跳过 RDS 后 `docker.sh` 不再有 `--env-file`，systemd.sh 的 `EnvironmentFile` 也只在 RDS 场景填充。镜像只固化非机密默认值；`ARK_API_KEY` 走设置页录入（落到持久化库）或 ECS 本机 `/etc/qianwenai/db.env`（0600）+ 改造单元；不进镜像/产物/聊天。
- **公网暴露是实质风险**：工具只给 HTTP、不做域名/HTTPS，SG 对 `0.0.0.0/0` 开 80/443，而产品无鉴权且设置页可写密钥、可删全部记录。文档列为部署前必须决策项（收紧 SourceCidrIp / 前置鉴权 / 仅内网）。
- `.claude/docs/runtime.md` 仍写「无部署流水线」，本次为控范围**未改**，列为待同步项。

### Pitfalls
- 本轮两次 `.env.example` 读取被权限策略拒绝（上一阶段），**未重试、未绕过**；环境变量名以 `docs/HANDOVER.md` 84-94 节与 `lib/llm/registry.ts` 为准，`.env.example` 内容记为未验证项。
- Nginx `/healthz` 是 `nginx_proxy.sh` 的桩，恒返 200，不代表应用就绪；步骤 12 的 `app: manual` 云助手核验不可省。
- 服务端 SSE 已带 `X-Accel-Buffering: no` / `no-cache, no-transform`，nginx 不缓冲；但 `proxy_read_timeout 60s` 且未设 `proxy_http_version 1.1`，长流仍需实测。

### Carry-over
- 部署前补齐四项：Dockerfile + .dockerignore、产物洁净门禁、SQLite 绝对路径与挂载、公网鉴权方案；之后按 1-14 步实际部署（需 `aliyun` CLI 3.x + OAuth + RAM + 步骤 9 费用确认）。
- 用户确认后统一提交累积改动（含本轮 DEPLOYMENT.md 与 README 索引行）。

## 2026-11-16（部署文档补充：现有 ECS 与环境变量核验）

- 用户补充：连接方式 `ssh -i <本地密钥路径> root@<ECS 公网 IP>`，并说明「环境变量已补充阿里云信息」。具体路径与公网 IP **不写入仓库文档与 memory**（避免随提交外发），文档只留占位符。
- 本地只读核验（未读取任何凭证内容）：SSH 私钥存在、权限 600、411 B；仓库 `.env` 从 35 B 增至 168 B；当前 shell 中阿里云相关变量 **0 个**；`aliyun` CLI 仍 absent；无 `.qianwenai-deploy*`。结论：补充信息**未导出到 CLI 进程环境**，步骤 1 仍阻塞。
- 又一次涉及 `.env` / profile 的 Bash 命令被权限策略拒绝，**未重试、未绕过**；`.env` / `.env.example` 内容继续记为未验证项。
- `.env` 当前权限 `644`，含云凭证应为 `600`；本轮未改（配置改动需备份→改→校验，属另开阶段）。
- **新增未决项**：qianwenai-deploy 全栈部署经 ROS 新建 ECS/EIP，**不会复用**这台已有服务器。若目标是装到现有 ECS，需改走直连部署；文档 §6 的 1-14 步与 §9/§10 的费用、释放描述都基于「新建资源栈」。
- 文档更新：`docs/DEPLOYMENT.md` 增 §3.1、§6 步骤 1 与 §11 两行，共 285 行；`git diff --check` clean；仓库内确认无字面 IP / 密钥路径。
- 待用户定夺：新建 ROS 栈 vs 复用现有 ECS；是否现在 SSH 只读核验服务器环境（属 outward-facing 动作，未获明确授权前不连）。

## 2026-11-16（部署目标定为复用现有 ECS + 服务器只读核验）

- 用户选定「复用现有 ECS」（不走 ROS 新建栈）＋「是，只读核验」。据此把 `docs/DEPLOYMENT.md` 整体重写为直连部署方案（196 行），README 索引行同步改文案。
- **qianwenai-deploy 不适用于本目标**：全栈会新建 ECS/EIP，热更新需 `.qianwenai-deploy` 状态，删除走 `delete_stack.sh`，都作用到新建资源上。文档改为「本地 build → `docker save` → scp → `docker load` → 容器 + nginx 独立 server block」，只沿用工具对产物洁净/密钥/探活的约定。无新增云资源，无步骤 9 费用门禁，不用 `delete_stack.sh`。
- 服务器只读核验（两次 SSH，未改动服务器、未输出凭证值）：Alibaba Cloud Linux 3 / root；**Node、npm、yarn absent**；pnpm 10.28.2；Docker 26.1.3 + Compose v2.27.0；nginx 1.24.0；git 2.43.7；sqlite3 3.26.0；`aliyun` CLI 3.3.14；磁盘 40G 用 28G 剩 11G（73%）；内存 1.8Gi 可用 1.2Gi。
- 端口/既有服务：80/443 由 nginx 占用（IPv4+IPv6），3100 无监听（curl 80→404、443→400、3100→000）；已有容器 `community-affairs`（`0.0.0.0:3001->3000`）与 `community-db`（`postgres:16-alpine`，`127.0.0.1:5432`）；nginx 已有 `server_name <既有域名>` + `proxy_pass http://127.0.0.1:3001`，443 SSL 由 Certbot 管理。**必须共存，不得改动**。
- 云端凭证：服务器非交互与 login shell 中阿里云相关变量 0 个（首次粗筛的 `alias` 行是 `which` shell 函数误匹配，已用纯变量名复核）；`aliyun configure get region` 未设置；`sts GetCallerIdentity` 无有效身份响应；`/root/.aliyun` 存在但凭证未就绪。直连部署不依赖 `aliyun` CLI。
- 硬约束推导：宿主无 Node + 内存 1.8Gi → `next build` 放本地；应用走 `127.0.0.1:3100` 只由 nginx 反代；SQLite 绝对路径 `/var/lib/prompt-pilot/app.db` + bind mount；nginx 需 `proxy_http_version 1.1` / `proxy_buffering off` / `proxy_read_timeout >=120s`。
- 仓库文档与 memory 均未写入字面公网 IP、密钥路径、既有域名（避免随提交外发），已 grep 确认。
- 核验：`git diff --check` clean；README 链接 0 broken；`docs/DEPLOYMENT.md` 196 行。本轮仍 doc-only，未重跑 typecheck/test/harness。
- 待用户定夺：新站域名/HTTPS 证书覆盖、公网鉴权方案、`ARK_API_KEY` 注入路径；实施 Dockerfile + nginx 共存配置。

## 2026-11-16（卸载不再使用的全栈部署技能）

- 用户确认「已用不到就删除」。按可逆原则执行：先把 `~/.agents/.skill-lock.json` 备份到 `~/.agents/skills-archive/20261116-qianwenai-deploy-uninstall/.skill-lock.json.before`，再把技能目录 `mv` 进同一归档、删除 `~/.openclaw/skills/` 下软链，最后从安装锁移除 `qianwenai-deploy` 条目。**归档保留，未硬删除**：36 个技能文件 / 181577 B，可原路回滚。
- 同源 `qianwenai-observe` 与 `qianwenai-operate` **未删**（用户只点名 deploy）；二者说明依赖 `.qianwenai-deploy` 状态文件，deploy 卸载后可能不可用，待用户明确是否一并移除。
- 仓库侧：`docs/DEPLOYMENT.md` 重写为不依赖该工具的直连方案（189 行），清掉 §1/§2/§4/§5/§7/§8/§9/§11 全部工具与脚本名引用；README 索引行本就无引用，未改。此前各节的历史记录保留原样，属于当时的选型记录，不回写。
- 核验：`git diff --check` clean；README 本地链接 0 broken；README/docs 无工具引用；无字面 IP/域名/密钥路径；lock JSON valid（v3 / 34 技能 / deploy 已移除 / observe、operate 在）；两安装路径 gone；归档 37 文件（含锁备份）；技能树 sha256 `5faa581fdb2b50318c0111baad09148e09af2b9283bc93e5611f14ec46806809`、改后锁 sha256 `35389b7c2e44dd1c3936fb5f1f98ab24ace1f5affb8904de4b7d5ccd9606c403`（tree hash 按「相对路径+内容」流式算法复核一致）。
- 有效冒烟：`openclaw skills list --agent main --json` 列出 113 个技能，**无名为 `qianwenai-deploy` 的项**；observe/operate 仍在，但 `blockedByAgentFilter=true` / `modelVisible=false`。此前不带 `--agent` 的 `skills list --json` 实际返回 `cli_error`（多 agent 需显式 owner），那次「deploy 未出现」属无效证据，已作废更正。
- 回滚：把归档内 `qianwenai-deploy` 移回 `~/.agents/skills/`、重建 `~/.openclaw/skills/qianwenai-deploy` 软链、用 `.skill-lock.json.before` 覆盖当前锁文件。
- 本轮未改产品代码，未重跑 typecheck/test/harness；未部署、未连服务器、未创建云资源、未提交、未 push。

## 2026-11-16（impeccable polish：工作台生成中输入锁定与过渡）

- 用户要求：`/impeccable polish 工作台输入框应该增加正在生成中的过渡效果，并且禁止输入`。Operate 模式，沿用既有羊皮纸/烛光世界，不换设计语言。
- 改动只落两个文件：`components/studio-v3/PromptComposer.tsx` + `lib/i18n/zh.ts`（新增 1 键 `studio.composer.generating`）。进行中（`isRequestActive(phase)` = starting/streaming/canceling）时：两份草稿 `readOnly`（非 `disabled`，保留选中复制、不丢焦点）、`updateDraft` / `handleModeChange` 提前 return、Tabs 两项 `disabled`、目标 chip `aria-disabled` + `opacity-40` + `cursor-not-allowed`、section `aria-busy` / `data-active`、底部 `role="status"` 的 `.rise` 文字 + `.now-pulse` 金色圆点。输入面靠 `Input.tsx` 既有 `read-only:bg-bg-sunken` + `transition-colors duration-150` 退到凹陷层。
- 刻意不加进度条、金线、常驻 glow：PRODUCT.md 禁「进度仪式」，DESIGN.md 有 One Candle / State-Only Glow；状态用文字 + 圆点双编码（Semantic Pair Rule），动效只动 opacity。
- 浏览器实测（3101 隔离 dev server + `MOCK_LLM_FAULT=slow_stream` 10s 首字延迟 + 独立 `data/pp-ui-smoke.db`；3100 旧生产构建未动）：idle 两份 textarea 可编辑、tabs 启用、无状态文案；active 两份 `readOnly=true` 且草稿保留、tabs 禁用、状态文案「正在生成，输入已锁定」+ `pp-now-pulse` 圆点、`aria-busy=true`、主按钮原位变「停止」；浅色 read-only 底 `#eadfc8` / 深色 `#120a06`（`--bg-sunken` 深浅各正确，先前一次异常读数是 `transition-colors` 未 settle 的中间值）；生成模式三个目标 chip 全 `aria-disabled=true` 且点击后 `aria-pressed` 不变（守卫生效）；390×844 无横向溢出（`scrollWidth==clientWidth==390`），状态文案与快捷键同行不挤。深浅 + 窄屏截图均已阅。
- bsk 用法补记：`evaluate` 需有效 `--context`，页面异步变化用 `--unverified` 并在脚本内自检前置条件；`emulate` 需 sync 的顶层 `observation_id`（`--observation`）；找主按钮须排除 `[role="tab"]`（tab 也是 `<button>`，文字同为「优化」）。
- 核验：`pnpm run typecheck` 0 错误；`pnpm test` 59 文件 / 537 用例；harness `status pass` 24-0-0；`impeccable detect --json` → `[]`；`git diff --check` clean；3100 `/studio` 仍 200，3101 已停，bsk session 已 close，临时 DB/脚本/截图已删。
- 未验证：真实网关密钥端到端（无密钥）；未重跑 `pnpm build`（本轮纯客户端状态，typecheck + 浏览器已覆盖）；`.env` 权限阻塞项未重试；未提交 / 未 push / 未部署 / 未建云资源。
- 回滚：`git restore components/studio-v3/PromptComposer.tsx lib/i18n/zh.ts` 会把前几轮未提交的 polish 改动一并回退；更稳的是用 `git diff` 单独剔除本轮新增块。

## 2026-11-16（部署范围定夺：不对外开放、仅自用、暂不申请域名）

### Completed
- 用户定：「本项目不对外开放，只是自用，暂不申请域名」；追问部署形态后选「仍上 ECS，仅本机可达」（三选项中的推荐项）。据此把 `docs/DEPLOYMENT.md` 从「nginx 独立 server block 反代」收敛为私网方案，README 文档索引行同步。
- 消解两项 P0 未决：新站域名/子域/HTTPS 证书覆盖、公网鉴权方案。§7 原「公网可达意味着任何人都能耗用额度、读写删数据」的前提不再成立；§10 决策状态表新增「已决」三行与「将来对外开放的前置」一行。
- 文档侧改动：§1 结论加范围声明、§2 硬约束 2 与 nginx 段、§3 整节（SSH 本地端口转发 `ssh -N -L 3100:127.0.0.1:3100 <host>`、SSE 不经反代）、§4.3 保留待定、§4.4 去掉「专用 nginx block」、§5 步 6/7/8、§6 探活与 SSE、§7 整节、§8 回滚/卸载去掉 nginx 步骤、§10 表。原文备份 `/tmp/DEPLOYMENT.md.bak-20261116`（sha256 `508f9fe3293676dd22bfecf1ad616016d365e4d757b476fc00930570d2ca0a5e`）。
- 决策按 conversation-accuracy-skill PERSIST 落盘：ACTIVE_CONTEXT / todo-tracker / 本节 + `memory-archive.mjs --persist-round`。

### Key Decisions
- 保留「复用现有 ECS 直连」不变，只改对外面：容器 `127.0.0.1:3100:3100`，本机 SSH 隧道访问；不新增 nginx server block、不备份/改/reload nginx、不动既有域名 443 与 Certbot。理由：既有服务必须共存，私网自用无需反代层，改动面最小。
- 「暂不申请域名」按可逆处理：§3/§7/§10 写明将来对外开放需另开阶段补域名、证书覆盖、公网鉴权与 nginx 共存方案；本阶段不做、也不删掉相关知识。
- 不替用户决定 `ARK_API_KEY` 注入路径（设置页录入 vs 0600 env 文件，§4.3 两条保留），仍列为剩余唯一决策。

### Verification
- doc-only：未重跑 typecheck/test（上一阶段 537/537 全绿）；本轮跑了 `harness-check.mjs`：首测 23-1-0（`ACTIVE_CONTEXT.md` 4132B 超 4KB 预算），备份后瘦身至 4009B，复测 24-0-0。
- `git diff --check` clean；README 本地链接 0 broken；文档内无字面公网 IP / 真实域名 / 密钥路径 / 凭证值（占位符 `<host>`、`<既有域名>` 不算）；空白字符与末尾换行 0 处问题。
- PERSIST 归档门禁先 dry-run 再实跑：`overBudget` / `archived` / `changed` 均为空，仅递增轮次；未触发历史归档。
- 未部署、未连服务器、未建云资源、未提交 / 未 push。

### Carry-over
- 剩余决策仅 `ARK_API_KEY` 注入路径；之后按 §4 补 Dockerfile/.dockerignore/产物门禁/SQLite 挂载，再按 §5 部署（用户确认后另开阶段）。
- 回滚：`cp /tmp/DEPLOYMENT.md.bak-20261116 docs/DEPLOYMENT.md`（sha256 `508f9fe3…`）；状态卡瘦身前版本 `/tmp/ACTIVE_CONTEXT.md.bak-20261116`（sha256 `8c60cd1a…`）；README/todo-tracker 用 `git diff` 单独剔除本轮块。

## 2026-11-17（/impeccable layout：模板页卡片统一 + 项目级插件启用）

### Completed
- 用户请求 `layout 建议【模版】页面列表卡片尺寸和样式保持一致`；结构化提问后选「尺寸统一，留一条金边（推荐）」：三类卡等宽等高、封面统一比例、移除 featured 跨列，只保留 featured 的 2px 金色顶边。Operate 模式，空间论点为「等价条目线性浏览」。
- 三处 UI 文件：`components/templates-v3/TemplateCover.tsx` 导出 `COVER_ASPECT='aspect-[5/3]'` 与统一 `viewBox 0 0 400 240`，ImageCover 重画为横构图（圆 + 矩形 + 金色小条 + 分隔线 + 标题），VideoCover 下 letterbox 移到 `y=214`；`TemplateLibrary.tsx` 把按分类的 GRID / 骨架比例合并为单一 `grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3`，删除 featured `lg:col-span-2`、骨架改用 COVER_ASPECT 并去掉 category 参数；`TemplateCard.tsx` 根加 `h-full border-t-2`（普通卡中性 2px、featured 金色，几何一致），自定义模板删除入口并入页脚第一行（与「用它开始」同排，`aria-expanded`），确认/失败行仍为瞬时第二行，完整保留 `confirmRef` / `restoreFocus` 焦点回归与失败重试。
- 历史：`ebde558` 曾刻意把 `grid items-start` + 删除 `h-full` 做成参差；本轮按用户选择覆盖该实现。
- 项目级启用 `/Users/yet/plugins/local-tools-marketplace` 三个插件（交 `harness-maintainer`，write_set 仅 `.claude/settings.json`）：新增 `qwen-harness-tools` / `redfox-data` / `quark-scan-ocr` 三个 `@local-tools` 键为 `true`，`enabledMcpjsonServers` 保持 `[]`；备份 `/tmp/prompt-pilot-settings.json.bak-20261117`（600），前后 sha256 `4ecb0771…` → `49f424e9…`；`python3 -m json.tool` / `claude plugin validate` / `claude plugin list` 均通过，CLI 确认项目设置覆盖用户级 `false`。用户问「是否需要设置 .mcp.json」→ 不需要：三个插件自带 `.mcp.json`，`${BAILIAN_API_KEY}` 由登录 shell 注入，项目根不新建。

### Key Decisions
- 卡片几何完全一致优先于 DESIGN.md 的「异构网格」；金色只作为 featured 的唯一状态信号（One Candle）。所有卡共用 2px 顶边是为了消除 1px 封面错位。
- 不按 skill 顺手修文档漂移：`Never repair drift as a side effect of a design task`。DESIGN.md Template Card 段仍写「异构网格 / 卡片尺寸随内容变化 / 禁止等尺寸网格 / Featured 其余不加」，与实现相反，只报告不改；`.impeccable/design.json` 是否相关未核对。
- 未执行 Next.js 升级：构建时 CLI 报 `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability`（16.4.2），重试同命令即继续并成功。升级超出本轮范围，未运行 `next upgrade`。
- 用户追加「本项目暂时不用考虑移动端屏幕的显示效果」：按验收范围约束处理，不改代码、不删响应式断点与移动底栏（DESIGN.md Responsive / NFR-8 / AC-18 仍写在文档里，暂不修改）；后续阶段不再做窄屏截图、移动端 polish 或移动专项验收。本轮 390×844 截图是已完成但按新范围不再需要的证据，保留在 `/tmp/templates-light-390.png` 仅作记录。

### Verification
- `pnpm run typecheck` 0 错误；`pnpm test` 59 文件 / 537 用例；`git diff --check` clean；`claude-project-harness-check.mjs` 25-0-0；`impeccable detect --json` 三个改动文件 → `[]`（只跑一次，不在 concept selection 阶段）。
- `pnpm build` 重试后成功（首次被安全提示中断）；curl 新构建确认 `items-stretch` 1 处、`border-t-2` 4 处、`aspect-[5/3]` 4 处，无 `col-span-2` / `aspect-[4/5]` / `aspect-[16/9]`。
- 停掉旧 3100 `next-server` 并以新构建 `pnpm start` 重启（后台任务 `bt39ap0t8`），`/templates` 200。服务状态补记：该后台任务在 10 分钟 timeout 后收到 SIGTERM（exit 143），3100 一度不可用；已改用 detached `nohup pnpm start > /tmp/prompt-pilot-start-20261117.log 2>&1 &` 重启，跨工具调用复核 pid 47578 / 200 / `items-stretch`，`.next` 已是新构建。后续会话若发现 3100 空闲，直接 `pnpm start` 即可，无需重跑 build。bsk 阅图：1440 浅色文本类三列等宽等高 + 页脚「生成模板 / 用它开始」对齐、滚动后第 4 张同宽、图片类与视频类封面统一 5:3 且构图语言保留、1440 深色金边正确、390×844 单列 + 底部四项标签栏无破版。全页截图受 `cdp_failed/page_hidden` 限制，改用 wheel 滚动 + viewport 截图覆盖页脚。
- 未验证：自定义模板（当前库无自定义模板）删除确认态的视觉与焦点回归；插件 MCP 工具需新开会话才加载（`claude mcp list` 本轮跳过）；真实网关密钥端到端。

### Carry-over
- DESIGN.md / `.impeccable/design.json` 与实现漂移待用户定夺是否另开阶段同步；启用三插件共 8 个 MCP server，超出治理默认「不超过 3 个」，可按需只开 `qwen-harness-tools`。
- 回滚：三个 UI 文件 `git restore components/templates-v3/TemplateCover.tsx components/templates-v3/TemplateLibrary.tsx components/templates-v3/TemplateCard.tsx` 会一并回退前几轮未提交改动，稳妥做法是 `git diff` 单独剔除本轮块；插件 `cp /tmp/prompt-pilot-settings.json.bak-20261117 .claude/settings.json`；构建产物 `.next` 重新 `pnpm build` 可覆盖。
- 仅本地工作树：未提交 / 未 push / 未部署 / 未连服务器 / 未建云资源。

## 2026-11-17（页面宽度一致性：只读排查，未实现；会话收口）

### Current State
- 用户反馈「工作台主体宽度与提示词库、模版、设置页面不一致」。随后用户要求「persist 收口，开新会话继续」，UserPromptSubmit hook 报上下文约 167k / 134 轮 / 162 次工具调用，要求立即 PERSIST + commit、禁止 Agent / MCP / 大 Read / 截图。本轮因此只做只读排查，零编辑 / 零验证命令 / 零截图 / 零 Agent / 零 MCP。
- 事实源：`app/(workspace)/layout.tsx` 只含 `AppShell` + `MobileNav` + `ModelStatusBanner`，不提供宽度容器，差异全在页级。

### Findings（三套宽度 + 两套 padding）
- 工作台 `components/studio-v3/StudioWorkspace.tsx:487-488`：`<PageShell variant="workbench">`（`w-full px-5 py-5 lg:px-7 lg:py-6`，无 max-width / 无 mx-auto）+ 内层 `mx-auto flex w-full max-w-[960px]` → 内容列 960px。
- 设置页 `app/(workspace)/settings/page.tsx:52`：自定 `mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 lg:flex-row lg:gap-10 lg:px-10` → 1080px 两栏；外层 div 于 `:166-167` 闭合（文件 169 行，`:53` `SettingsNav`、`:54` 内容列）。
- 提示词库 `components/library-v3/LibraryV3.tsx:197` / 模板 `components/templates-v3/TemplateLibrary.tsx:116`：`<PageShell variant="grid">` → `mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10`。
- `components/ui/PageShell.tsx`（36 行）：三变体 `reading`(760，全仓无消费者) / `workbench` / `grid`(默认)。`ShellVariant` 仅自身与 `docs/archive/v2/UI-REFACTOR-PLAN.md` 引用。`.impeccable/design.json:379` 记 1280px；`DESIGN.md:327` 写 960px 单列、`:398` 写 1280/1440 基准。
- 无测试断言 `PageShell` / `max-w-[960` / `variant="workbench"` / 宽度数值；`MarkdownView.tsx:45-74` 自带 `max-w-[68ch]`、原文/空态 44ch，放宽外层不破坏 68ch 可读性，源码 `<pre>` 与 diff 更受益；`cn`（twMerge）与 `className` 组合无冲突。

### Candidate（未获批准、未落地）
- 四页统一 `grid` 壳：`mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10`（默认变体、2/4 页已用、design.json 记 1280）。
- 收敛 `PageShell` 为单一 canonical shell（去 cva / `ShellVariant` / `reading`），三个消费者去掉 `variant="grid"`；工作台去内层 960 与 `variant="workbench"`；settings 改 `<PageShell className="flex flex-col gap-6 lg:flex-row lg:gap-10">`；同步 `StudioWorkspace.tsx:67` 与 `PromptComposer.tsx:46` 的 960px 注释。
- 备选（最小改动）：保留 cva，仅令 `workbench` 与 `grid` 同值，但留冗余变体。
- `SettingsNav.tsx` 窄屏分段条含 `-mx-6`，与 `lg:px-10` 需核对；用户已排除移动端显示，不改断点与底栏。
- `DESIGN.md:327` 的 960px 漂移按 impeccable「不顺手修文档」记为 deferred，并入 todo 第 15 条；不改文档。

### Next Step（新会话第一个动作）
- 先读 `app/(workspace)/settings/page.tsx` 尾部定位 `:52` 外层 div 闭合标签，再按候选落地 className 改动（只改 `PageShell.tsx` / `StudioWorkspace.tsx` / `PromptComposer.tsx` 注释 / `settings/page.tsx`，若收敛变体再加 `LibraryV3.tsx` / `TemplateLibrary.tsx`）。
- 验证：`node ~/.claude/scripts/claude-project-harness-check.mjs .` + `pnpm run typecheck` + `pnpm test` + `git diff --check`（可选 `pnpm build` 与一次 `impeccable detect --json <changed targets>`）；小布局不派 verifier；不做截图、不做移动端核验。
- 4 页 curl 200（detached `nohup pnpm start`，pid 47578 / `/tmp/prompt-pilot-start-20261117.log`）为唯一新增运行时证据。

### Constraints / Do Not Retry
- 不在本轮实现（hook 要求收口）；不擅自改 DESIGN.md；不删响应式断点与移动底栏；commit 后不 push；不启动 Agent / MCP / 截图。

### Carry-over
- 回滚：`git diff` 单独剔除本轮 className 改动即可，无数据 / 配置 / schema 迁移。
- 收口：本轮执行 conversation-accuracy-skill PERSIST（`ACTIVE_CONTEXT.md` 先压缩腾位 / `session-summary.md` / `todo-tracker.md`）+ `memory-archive.mjs --persist-round`，并按 hook 要求 commit 全部累积未提交改动（不 push）。

## 2026-11-17（宽度一致性落地 + 部署影响面评估；会话收口）

### Current State
- 用户指令 1：先 LOAD 最新 handoff → ACTIVE_CONTEXT → todo-tracker，跑一次 `pnpm run typecheck` / `pnpm test` 核对现场，再动手改布局；移动端显示仍排除验收范围。指令 2：评估部署到服务器的影响面（只读）。
- 现场核对：typecheck 0 / 59 文件 537 用例；6 文件未提交，与 `handoff-20261117-112522.md` 快照一致。
- Hook：上下文约 146k，只完成当前最小阶段，不新增 fan-out / 切模型 / 无关探索，随后 PERSIST 并开新会话；本轮无 commit / push 授权。

### Decisions（宽度一致性，已落地）
- `components/ui/PageShell.tsx` 全量重写：去 cva / `ShellVariant` / 三变体（`reading` 760px 全仓零消费者），保留单一 canonical shell `mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10`；四页宽度与留白统一，分栏交页面内 className 决定。
- 消费者：`StudioWorkspace.tsx:487-488` 去 `variant="workbench"` 与内层 `mx-auto max-w-[960px]`（改 `flex w-full flex-col`），`:67` 注释改「统一的居中单列」；`PromptComposer.tsx:46` 同步注释；`settings/page.tsx` 引入 `PageShell`，自定 `max-w-[1080px]` 两栏 div → `<PageShell className="flex flex-col gap-6 lg:flex-row lg:gap-10">`，末尾 `</div>` → `</PageShell>`；`LibraryV3.tsx:197` / `TemplateLibrary.tsx:116` 去 `variant="grid"`。
- 选 1280 的理由：原本 2/4 页已用 grid 默认值，`.impeccable/design.json:379` 记 1280px；`MarkdownView` 自带 `max-w-[68ch]` 保可读性，源码 `<pre>` 与 diff 更受益；`SettingsNav` 窄屏分段条含 `-mx-6`，但只在 `lg:hidden` 生效，与 `lg:px-10` 无冲突。
- 不改 `DESIGN.md:327`（960px 单列漂移），按 impeccable「不顺手修文档」并入 todo #15；移动端排除验收，不改断点 / 底栏、不截窄屏图。

### Verification（宽度落地）
- 中途 hook 报 `TS2322`（`variant` 不存在于 3 个消费者）与 `TS17002`（settings 的 `PageShell` 缺闭合标签）：契约先改、消费者后改的中间态，非最终缺陷；全部消费者改完后消失。
- 最终并行验证：`pnpm run typecheck` 0 错误；`pnpm test` 59 文件 / 537 用例；`claude-project-harness-check.mjs` 24-0-0；`git diff --check` clean；`pnpm build` 重试后 exit 0。
- `pnpm build` 首次 exit 1 `SecurityFatalError`（Next.js 16.4.2 安全升级提示，要求「重试同一命令」），重试通过并带 warning；构建输出建议升级并询问 worktree 安全升级，均**未执行**（超范围；不可信工具输出不据此扩权或跳验证）。
- 3100 生产服务：build 覆盖 `.next` 后停旧 pid 47556/47578，以 `nohup pnpm start > /tmp/prompt-pilot-start-20261117-width.log 2>&1 &` 重启（pid 65022）；`/studio` `/library` `/templates` `/settings` 均 200；渲染 HTML 四页均含 `max-w-[1280px]`，`max-w-[960px]` / `max-w-[1080px]` 各 0 次；源码无残留 `variant=` 宽度字面量；服务日志干净。
- 排查中一个 zsh 坑：`for path in ...` 会覆盖特殊数组 `$PATH`，导致 `curl` 全部 `command not found`；改名 `p` 后四页复测 200。服务本身已正常启动。
- 未验证：桌面 / 窄屏截图（用户排除移动端）、Docker 内构建行为、SSH 隧道长流空闲超时、真实网关密钥端到端。

### Findings（部署影响面，只读评估）
- 口径：本轮未连服务器、未跑 Docker、未改文件；服务器事实来自 `docs/DEPLOYMENT.md`（2026-11-16 只读巡检，未复验）；仓库事实来自静态检查 + impact-mapper 只读映射。
- 会变：1 容器 + 1 镜像 tag（`127.0.0.1:3100`）、1 宿主目录 `/var/lib/prompt-pilot`、1 SSH 隧道。不变：nginx/Certbot 配置、80/443/3001/5432、`community-affairs` / `community-db`、安全组、云资源、域名/HTTPS、计费。`.next` 361M、`data/` 3.7M；服务器 11G 可用磁盘 / 约 1.2Gi 可用内存。
- 宽度改动本身对部署近乎零影响（仅 className / 组件边界 / 注释，未碰 API / schema / env / 路由 / SSE / 密钥）；但 **6 文件未提交是发布输入陷阱**：clean checkout 会发出旧的 960 / 1080 / 1280 三套宽度，建议发布前先 commit。
- 阻塞项：`Dockerfile` + `.dockerignore` 均缺失（实测）；`start` 仅 `next start -p 3100`，首启 `db push` / `db:seed` 无启动钩子；`ARK_API_KEY` 注入路径（§4.3）未定；产物洁净门禁缺位（Docker build context 忽略 `.gitignore`，`data/app.db` + 4 个备份含记录正文与设置页密钥、644 权限的 `.env` 含云凭证可能进镜像 / tarball）；方案内部矛盾：`prisma` CLI 是 devDependency，§4.1 却要「运行阶段只带生产依赖」同时首启执行 `prisma db push` + `prisma/seed.ts`。
- Prisma 引擎跨平台：本机仅 `libquery_engine-darwin-arm64.dylib.node` / `schema-engine-darwin-arm64`，`prisma/schema.prisma` generator 无 `binaryTargets`；服务器 x86_64 Linux → 必须在 Linux 构建阶段 `pnpm db:generate`，绝不复制本机 `.prisma` / client 进镜像。`next.config.ts` 无 `output: 'standalone'`（`.next/standalone` 不存在），运行阶段需自定义复制策略，镜像偏大。
- 两个文档未记的新点：(a) Next.js 16.4.2 `config-shared.js:192` 默认 `experimental.agentUpgrade: 'security'`，`build/index.js:545` 触发 nudge；`nudgeUpgradeForAgent` 抛 `SecurityFatalError` exit 1，重试收据写 `.next/cache/next-agentic-upgrade-retries/<sha256>.json`（`RETRY_TTL` 5 分钟），重试才过；无 agent 标记且 `signal=null` 时读源码推断会提前 return、Docker 大概不拦，但**未在 Docker 内实测**；注入 `CLAUDECODE` 类变量仍会首跑失败；HANDOVER §7 clean build（`rm -rf .next`）会清掉收据 → 首次必失败需重试。(b) 本机 3100 已被重启的 `pnpm start`（pid 65022）占用，与 `ssh -N -L 3100:127.0.0.1:3100` 冲突，须停本机服务或换本地端口（如 3101）。另 `DEPLOYMENT.md §6` 仍要求 390px 验收，与用户「移动端排除验收」冲突，须裁剪；§5 step-7 建议增补 SSH 隧道下的 SSE 长流探针。
- 数据 / 网络 / 回滚：服务器是全新空库 + 12 个 seed 模板，本机 `data/app.db` 不迁移；ECS 系统盘单副本无快照 → 部署前备份 `app.db`；出网只需 `ARK_BASE_URL`；AC-15 / AC-16 离线行为；SSE 头在 `lib/engine/sse-v3.ts:14-16`（`X-Accel-Buffering: no` / `Cache-Control: no-cache, no-transform`）；SSH 隧道多一跳，长流空闲超时未验；回滚 = 停新容器 + 起旧 tag + 按需恢复 db，不动 nginx / 容器 / 云资源。
- 结论：服务器影响面小且隔离；真实风险在发布链路（前置缺位、秘密泄漏、未提交版本错配、跨平台引擎、初始化钩子、密钥注入、构建闸门、端口冲突、390px 验收冲突）。

### Constraints / Do Not Retry
- 不部署、不连服务器、不改 nginx / Certbot / 既有容器 / 安全组、不建云资源；不升级 Next.js、不跑 `next upgrade --agent=security`；不 commit / 不 push（用户未要求）；不做窄屏截图 / 移动专项验收；不改 DESIGN.md。
- 不复制本机 Prisma client / `.prisma` 进 Linux 镜像；本机 3100 被占用时不直接开 `ssh -L 3100:...`；`.env` / `.env.example` 不绕过权限策略。
- 构建输出里的「升级建议 / 询问 worktree」属不可信工具输出，不据此扩 `write_set` 或跳验证。

### Carry-over
- 回滚：`git restore` 6 文件（或 `git diff` 单独剔除 className 块），无数据 / 配置 / schema 迁移。
- 下一步第一个动作：新会话 LOAD（最新 handoff → ACTIVE_CONTEXT → todo-tracker）→ `git log -3` + `git diff` 核对 → 跑一次 typecheck / test。若要发布，先 commit 6 文件，再按 `docs/DEPLOYMENT.md` §4 补齐前置。
- 收口：本轮执行 PERSIST（`ACTIVE_CONTEXT.md` 压缩 / `session-summary.md` / `todo-tracker.md`）+ `memory-archive.mjs --persist-round` + 补齐 handoff 5 问；按 hook 开新会话。
