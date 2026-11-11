# PromptPilot 设计系统：烛光羊皮纸

> 一句话方向：把提示词工坊做成一张会发光的羊皮纸工作台。深棕分层、金色主操作、衬线标题、细描边与克制的金色 glow；奇观只出现在当前步骤与主操作，其余区域保持工具密度。
>
> 本稿整体取代旧稿的暖纸、赤陶与瑞士黑白方向。ADR-0001（暖纸刊物感）与 ADR-0004（bento 构图）的视觉结论作废；ADR-0002（只用 CSS 动效）、ADR-0003（评估判定输出）、ADR-0005（shadcn 工程模式）继续有效。方向性变更应补 ADR-0006。
>
> 参考：`~/Downloads/questui-DESIGN.md`（QuestUI）。只借视觉语法与组件规格格式，不直接复制其不达标的对比度、无中文的字体栈与深色唯一方案。
>
> 令牌值以第二节为准，实施时写入 `app/globals.css`；此后代码是运行时真相，任何改值必须同步回本文第二节。
>
> 静态样张：`docs/design-preview/questui-workbench.html`（可切换浅色与深色）；截图：`docs/assets/design-v2/workbench-light-1440.png`、`workbench-dark-1440.png`、`workbench-light-390.png`。

---

## 一、设计简报

### 1.1 功能摘要

把一句话需求扩写成结构完整、边界清晰的八字段提示词，并用真实模型试跑一次，让用户当场看到效果。

### 1.2 首要用户动作

写一句话，拿到能直接用的提示词。编辑、诊断、评估都是第二步。

### 1.3 设计方向

**烛光羊皮纸工具**：QuestUI 的材质与装饰语法，落到一个业务工具上。

三条判断：

1. 产品仍然是工具，不是游戏。奇观集中在当前步骤、主操作与关键数字，表单与正文保持可读密度。
2. 深色是主场景（烛光地下室），浅色是白天办公室的羊皮纸变体。两套主题都必须可用。
3. 中文没有 Cinzel 等价字体。中文标题走系统宋体，正文走系统无衬线，西文衬线只做回退，不加载网络字体。

### 1.4 参考与反参考

- 参考：QuestUI 的分层深棕、金色主操作、顶部金色描边、衬线标题、羊皮纸文字、2 到 8px 小圆角。
- 反参考：直接照搬 QuestUI 的低对比语义色、11px 大写 chip、无浅色方案、把 glow 铺满每个卡片。
- 产品语域从 `product` 调整为 `ornate tool`：允许装饰，但装饰必须服务层级，不做品牌表演。

### 1.5 已定论的问题

- 中文标题用系统宋体，正文用系统无衬线，零网络字体。
- 金色只做主操作、当前步骤与关键数字，不做大面积背景。
- glow 只出现在 active / selected / focus，不常驻。
- 浅色模式是羊皮纸日光变体，不是把深色简单反相。
- 图标继续用内联 SVG 线性图标，active 时金色描边，不引图标库。

---

## 二、设计令牌

### 2.1 色彩：浅色（羊皮纸日光）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--bg` | `#F3EAD8` | 页面底，羊皮纸 |
| `--bg-sunken` | `#EADFC8` | 凹陷层、代码块、输出区 |
| `--surface` | `#FBF5E9` | 卡片、面板、输入框 |
| `--surface-raised` | `#FFF9EE` | 浮层、选中项、悬停卡 |
| `--surface-inset` | `#EFE3CE` | 只读区、需求摘要 |
| `--sidebar` | `#EFE3CE` | 左轨与移动端导航 |
| `--border` | `#D8C7A8` | 容器边框 |
| `--border-strong` | `#B99F72` | 悬停、焦点边框 |
| `--border-subtle` | `#E4D7BF` | 仅分隔线 |
| `--text` | `#2A1A10` | 主文字，深棕墨 |
| `--text-muted` | `#6B4B2E` | 次级文字 |
| `--text-faint` | `#85643F` | 元信息、占位符 |
| `--accent` | `#8A5A00` | 主操作、链接、焦点 |
| `--accent-hover` | `#6F4800` | 悬停 |
| `--accent-subtle` | `#F0E2C4` | 选中行、当前步骤底 |
| `--on-accent` | `#FBF5E9` | 压在金色上的文字 |
| `--success` | `#2F6B3A` | 成功 |
| `--warning` | `#8A5A00` | 警告 |
| `--danger` | `#8F1D14` | 危险、错误 |
| `--info` | `#5B2A86` | 信息、稀有 |

浅色分区底色：

| 令牌 | 值 | 用途 |
|---|---|---|
| `--tint-gold` | `#F0E2C4` | 当前步骤、提示 |
| `--tint-red` | `#F3DFD9` | 错误、不做 |
| `--tint-green` | `#DFEBDA` | 成功、做 |
| `--tint-purple` | `#E8DDF0` | 稀有、信息 |
| `--tint-do` | `#E4EEDF` | constraints 做栏 |
| `--tint-dont` | `#F3DFD9` | constraints 不做栏 |
| `--diff-add-bg` | `#E4EEDF` | diff 新增底 |
| `--diff-add-mark` | `#CBE0C2` | diff 新增行标 |
| `--diff-del-bg` | `#F3DFD9` | diff 删除底 |
| `--diff-del-mark` | `#E8C4BB` | diff 删除行标 |

### 2.2 色彩：深色（烛光地下室）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--bg` | `#1A0F0A` | 页面底，深棕，不用纯黑 |
| `--bg-sunken` | `#120A06` | 凹陷层 |
| `--surface` | `#2C1A10` | 卡片、面板、输入框 |
| `--surface-raised` | `#3D2517` | 浮层、选中项 |
| `--surface-inset` | `#24140C` | 只读区 |
| `--sidebar` | `#24140C` | 左轨 |
| `--border` | `#5C3D2E` | 容器边框 |
| `--border-strong` | `#8A6440` | 悬停、焦点边框 |
| `--border-subtle` | `#3D2517` | 仅分隔线 |
| `--text` | `#F5E6D3` | 主文字，羊皮纸 |
| `--text-muted` | `#BFA98A` | 次级文字 |
| `--text-faint` | `#AB8D69` | 元信息、占位符 |
| `--accent` | `#CA8A04` | 主操作、链接、焦点 |
| `--accent-hover` | `#E0A21A` | 悬停 |
| `--accent-subtle` | `#3A2A12` | 选中行、当前步骤底 |
| `--on-accent` | `#1A0F0A` | 压在金色上的文字 |
| `--success` | `#22C55E` | 成功 |
| `--warning` | `#EAB308` | 警告 |
| `--danger` | `#F87171` | 危险文字 |
| `--danger-fill` | `#991B1B` | 危险按钮底，配 `--text` |
| `--info` | `#C4A5F5` | 信息、稀有 |

深色分区底色：

| 令牌 | 值 |
|---|---|
| `--tint-gold` | `#3A2A12` |
| `--tint-red` | `#3A1A16` |
| `--tint-green` | `#1E3324` |
| `--tint-purple` | `#2E1F3A` |
| `--tint-do` | `#1E3324` |
| `--tint-dont` | `#3A1A16` |
| `--diff-add-bg` | `#1E3324` |
| `--diff-add-mark` | `#2E4A35` |
| `--diff-del-bg` | `#3A1A16` |
| `--diff-del-mark` | `#4A2420` |

### 2.3 对比度实测

浅色：

| 组合 | 对比度 |
|---|---|
| `--text` / `--bg` | 14.02:1 |
| `--text` / `--surface` | 15.43:1 |
| `--text-muted` / `--surface` | 7.24:1 |
| `--text-faint` / `--surface` | 4.97:1 |
| `--accent` 文字 / `--surface` | 5.46:1 |
| `--on-accent` / `--accent` | 5.46:1 |
| `--success` / `--surface` | 5.89:1 |
| `--danger` / `--surface` | 8.22:1 |
| `--info` / `--surface` | 9.12:1 |

深色：

| 组合 | 对比度 |
|---|---|
| `--text` / `--surface` | 13.58:1 |
| `--text-muted` / `--surface` | 7.33:1 |
| `--text-faint` / `--surface` | 5.34:1 |
| `--accent` / `--bg` | 6.40:1 |
| `--on-accent` / `--accent` | 6.40:1 |
| `--success` / `--surface` | 7.30:1 |
| `--warning` / `--surface` | 8.67:1 |
| `--danger` / `--surface` | 6.01:1 |
| `--info` / `--surface` | 7.96:1 |

分区与 diff 补充组合：

| 组合 | 浅色 | 深色 |
|---|---|---|
| `--accent` / `--tint-gold` | 4.62:1 | 4.70:1 |
| `--success` / `--tint-green` | 5.19:1 | 5.93:1 |
| `--danger` / `--tint-red` | 6.95:1 | 5.67:1 |
| `--info` / `--tint-purple` | 7.56:1 | 7.32:1 |
| `--success` / `--diff-add-bg` | 5.36:1 | 5.93:1 |
| `--danger` / `--diff-del-bg` | 6.95:1 | 5.67:1 |

QuestUI 原稿的 `#991B1B` 文字（2.00:1）与 `#581C87` 文字（1.73:1）不得作为文字色使用；深色危险按钮只把 `#991B1B` 当底色，文字用 `#F5E6D3`（6.78:1）。

### 2.4 字体

```css
--font-display: "Songti SC", "Noto Serif SC", "Source Han Serif SC",
  "STSong", Georgia, "Times New Roman", serif;
--font-body: -apple-system, BlinkMacSystemFont, "PingFang SC",
  "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

- 页面级 `h1`、大陈述句、KPI 数字用 `--font-display`。
- 正文、按钮、表单、导航用 `--font-body`。
- 变量名、JSON、token 数、耗时用 `--font-mono`。
- 不加载 Cinzel、Spectral、Fira Code。西文衬线由 Georgia 回退；中文由系统宋体回退。若未来引入中文衬线子集，只能走 `next/font/local` 且只用于标题，默认不启用。
- 字重只用 400 / 500 / 600。数字一律 `tabular-nums`。

字号阶梯：

| 档位 | 字号 | 行高 | 用途 |
|---|---|---|---|
| caption | 12px | 1.4 | 元信息、状态 |
| label | 13px | 1.4 | 表单、按钮、导航 |
| body | 15px | 1.7 | 默认正文 |
| body-lg | 16px | 1.75 | 文档正文、输入区 |
| h3 | 18px | 1.35 | 字段标题、面板标题 |
| h2 | 26px | 1.25 | 区块标题 |
| display | 40px（宽屏 48px） | 1.12 | 页面标题，衬线 |
| numeral-hero | 56px | 1.05 | KPI 数字 |
| numeral-mega | 88px | 1.0 | 质量缺口、Top 序号 |

大标题必须 `text-balance`。KPI 数字用无衬线等宽？不，用 `--font-display` 的衬线数字，金色只给一个主 KPI，其余用 `--text`。

### 2.5 间距

4px 基准，8px 节奏：

| 令牌 | 值 | 用途 |
|---|---|---|
| `--space-1` | 4px | 图标与文字 |
| `--space-2` | 8px | 紧凑内边距 |
| `--space-3` | 12px | 表单内边距 |
| `--space-4` | 16px | 默认内边距 |
| `--space-5` | 20px | 卡片内边距 |
| `--space-6` | 24px | 面板内边距 |
| `--space-8` | 32px | 区块间距 |
| `--space-12` | 48px | 页面区块 |
| `--space-16` | 64px | 页面级留白 |

### 2.6 圆角

| 令牌 | 值 | 用途 |
|---|---|---|
| `--radius-chip` | 2px | chip、徽标 |
| `--radius-control` | 4px | 按钮、输入、下拉 |
| `--radius-panel` | 6px | 卡片、面板 |
| `--radius-overlay` | 8px | 弹层、抽屉 |
| `--radius-pill` | 9999px | 状态点、头像 |

### 2.7 高度与 glow

| 令牌 | 值 | 用途 |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(90,60,20,.14)` | 默认卡片 |
| `--shadow-md` | `0 2px 8px rgba(90,60,20,.18)` | 抬升卡片、下拉 |
| `--shadow-lg` | `0 8px 24px -12px rgba(90,60,20,.28)` | 弹层、抽屉 |
| `--glow-gold` | `0 0 0 1px #8A5A00, 0 0 16px rgba(138,90,0,.25)` | 当前步骤、选中项、焦点 |
| `--glow-gold-strong` | `0 0 0 1px #CA8A04, 0 0 24px rgba(202,138,4,.32)` | 主操作按下、当前阶段 |

深色把阴影换成 `rgba(0,0,0,.45/.5/.7)`，glow 换成金色。glow 只允许出现在 active / selected / focus，不常驻；同一屏同时发光的元素不超过 2 个。禁止彩色渐变、玻璃拟态、霓虹描边与 3D 斜面。

### 2.8 动效

只动 `opacity` 与 `transform`：

- `.rise` 120ms：内容首次出现。
- `.reveal` 180ms：容器展开。
- `.glow-in` 200ms：active / selected 的 glow 淡入。
- `prefers-reduced-motion: reduce` 下全部归零，glow 直接显示。

---

## 三、信息架构

```
左轨 64px：品牌印记 · 五个图标入口 · 主题切换
├─ 工作台   /studio
├─ 提示词库 /library
├─ 评估     /eval
├─ 模板     /templates
└─ 设置     /settings

顶栏 72px：页面名（中文衬线）· 日期 · 模型状态 · ⌘K · 主题
内容区 12 栏网格，最大 1440px，页面内边距 24 / 32px
```

五页骨架各不相同：

| 页面 | 骨架 |
|---|---|
| 工作台 | 时间轴 + 需求摘要 + 八字段 bento + 底部诊断 dock |
| 提示词库 | 行式列表 + 右侧详情抽屉 |
| 评估 | 创建区 + KPI 条 + 样本对照 + 判定分组 |
| 模板 | 异构卡片网格，图标块大小随场景变化 |
| 设置 | 左侧锚点导航 + 右侧分区，模型状态 hero 条 |

---

## 四、页面规格

### 4.1 工作台

- **空态**：居中 820px。衬线大标题、一句话说明、输入区、六个场景入口。主操作金色，唯一。
- **生成中**：时间轴当前阶段金色发光，字段按顺序流式填充，当前字段骨架化。「停止生成」常驻。
- **生成完成**：需求摘要条、假设 chip 行、八字段 bento。字段卡默认 `--surface` + 1px 边框 + 顶部金色 2px 描边；当前聚焦卡加 `--glow-gold`。
- **字段形态**：objective 巨型衬线陈述跨两列；audience 头像组；context 摘录块；constraints 做/不做双栏；variables 等宽表格；examples 编号样本；successCriteria 可勾选判定；output format 骨架预览。
- **诊断 dock**：底部可折叠，`⌘J`。error / warn / info 分组，错误组用 `--tint-red`，建议组用 `--tint-gold`。修复与忽略是文字按钮，不靠悬停。
- **试运行**：变量表单、输出区、耗时与 token。无模型时禁用并说明原因，不伪造输出。

### 4.2 提示词库

- 标题 + 真实统计（条数 / 版本数 / 近七天更新）。
- 行式列表：标题、单行描述、标签 chips、版本数与 v0 胜率两列衬线数字。
- 行 hover 用 `--surface-raised`，选中行用 `--accent-subtle` + 2px 金色顶边，不用左侧色条。
- 无胜率显示 `—`，不显示 0%。
- 点击行开右侧详情抽屉：版本时间线 + 基于某版本继续编辑。

### 4.3 评估

- 创建区：选提示词、按行填样本（最多 5 条）、开始评估。
- KPI 条：通过率 / v0 胜率 / 已判定样本数，衬线大数字；无数据 `—`。
- 「不满足」用 `--numeral-mega` + `--danger`，是整页唯一允许的红色大数字。
- 样本对照双栏：当前版本 vs v0 基线；判定按样本分组，每条标准一个 verdict 行。
- 无评委模型：数值留 `—`，标「待人工判定」，绝不显示 0 分（ADR-0003）。

### 4.4 模板

- 异构网格：图标块大小随场景类型变化，重要模板加顶部金色描边。
- 每张卡：图标块、名称、适用场景、示例输入、动作「用它开始」。
- 卡片必须有真实内容，不允许等尺寸空信息卡片。

### 4.5 设置

- 左侧锚点导航：模型 / 成本 / 数据 / 快捷键。
- 模型区：单行 hero 状态条（已接入真实模型 / 离线模板模式），下面四个字段，每个字段带来源标签。
- 密钥只显示末四位，永不回传明文；「清除全部覆盖」回落到环境变量。
- 成本区：四个 KPI 用衬线大数字，按阶段与模型两张表。
- 未知值显示 `—`，不写 0。

---

## 五、组件规格

### 5.1 按钮

四级：primary / secondary / ghost / destructive。尺寸 sm 32px、md 40px、lg 48px。

| 状态 | primary | secondary | ghost | destructive |
|---|---|---|---|---|
| default | 金色底、`--on-accent` 文字、1px `--accent-hover` 边、`--shadow-sm` | 透明底、`--accent` 文字、1px `--accent` 边 | 透明底、`--text-muted` 文字、无边框 | `--danger-fill` 底、`--text` 文字 |
| hover | `--accent-hover` 底 | `--accent-subtle` 底 | `--surface-raised` 底 | `#7F1D1D` 底 |
| focus-visible | 2px `--accent` 环，offset 2px | 同左 | 同左 | 2px `--danger` 环 |
| active | 金色底加深，`--glow-gold-strong` | `--accent-subtle` 底加深 | `--surface-inset` 底 | 深红加深 |
| disabled | 0.4 透明度、无 glow、边框降为 `--border-subtle` | 同左 | 同左 | 同左 |

每屏最多一个 primary。按钮内图标 15px，`sm` 为 14px。

### 5.2 输入、文本域、下拉

- 高度 40px，圆角 4px，`--surface` 底，1px `--border`。
- hover：边框 `--border-strong`。
- focus：2px `--accent` 边框 + `0 0 0 3px` 金色 25% 环。
- error：2px `--danger` 边框 + 危险色 25% 环，`aria-invalid`，错误文字贴字段下方。
- disabled：`--bg-sunken` 底，`--text-faint` 文字。
- 标签 13px / 500，helper 12px，错误 12px。
- 文本域最小高度 96px，可纵向 resize。

### 5.3 Chip

- default：`--surface` 底，1px `--border`，`--text-muted` 文字，2px 圆角，24px 高。
- hover：边框 `--border-strong`。
- selected：金色底，`--on-accent` 文字，无边框。
- success / warning / error / info：对应 tint 底 + 语义文字 + 前置圆点或图标，不能只靠颜色。
- 字号最小 12px，中文不用大写变形。

### 5.4 卡片与面板

- default：`--surface` 底，1px `--border`，6px 圆角，`--shadow-sm`，内边距 20 / 24px。
- elevated：`--surface-raised` 底，1px `--border-strong`，`--shadow-md`。
- accent：顶部 2px `--accent` 描边，用于当前字段、当前模板、重要 KPI。
- interactive hover：边框 `--border-strong`，可选 `--glow-gold`。
- 禁止给所有卡片同时加 glow 或顶部描边；装饰必须表示层级。

### 5.5 列表与表格

- 列表行高 48px，内边距 8 / 16px，1px `--border-subtle` 分隔。
- hover：`--surface-raised`；active：`--accent-subtle` + 2px 金色顶边。
- 表格表头 12px `--text-faint`，行高 44px，数字 `tabular-nums`，右对齐。
- 表格必须用语义 `table / thead / tbody`，不用 div 网格冒充表格。

### 5.6 标签页

- 默认：`--text-muted`，底部 2px 透明。
- hover：`--text`。
- active：`--text` + 底部 2px `--accent`。
- 带计数时计数用 12px `--text-faint`，`tabular-nums`。

### 5.7 弹层、抽屉、命令面板

- 遮罩：`rgba(26,15,10,.55)`，不做背景模糊。
- 面板：`--surface-raised` 底，1px `--border-strong`，8px 圆角，`--shadow-lg`。
- 打开动画 180ms `reveal`，关闭 120ms。
- 焦点陷阱由组件负责，不用手写 `querySelector().focus()`。
- 命令面板：搜索框、分组结果、键盘选中行用 `--accent-subtle` + 金色左缘 2px。

### 5.8 勾选与单选

- 尺寸 20px，未选中 2px `--border-strong` 边框，`--surface` 底。
- 选中：金色底，深色勾选或圆点。
- disabled：0.4 透明度。
- 标签与控件间距 8px，点击标签可切换。

### 5.9 时间轴

- 五段：需求 → 生成 → 试运行 → 评估 → 优化。
- 已过：`--bg-sunken` 底，`--text-muted` 文字。
- 当前：金色底，`--on-accent` 文字，`--glow-gold`，now 点 2s opacity 脉冲。
- 未到：透明底，1px `--border` 虚线。
- 诊断 error 数进当前阶段徽标，徽标用 `--danger` 文字 + `--tint-red` 底。

### 5.10 状态矩阵

| 组件 | 必须实现的状态 |
|---|---|
| Button | default / hover / focus-visible / active / disabled |
| Input / Textarea / Select | default / hover / focus / disabled / readonly / error |
| Tabs | default / hover / active / 带计数 |
| Chip | default / hover / selected / 可移除 / 四种语义 |
| Card | default / elevated / accent / interactive hover / selected |
| List row | default / hover / active / disabled |
| Lint item | error / warn / info / fixing / fixed |
| Run output | empty / streaming / done / failed / canceled |
| Empty state | 图标位 + 一句话 + 一个动作 |
| Command palette | 关闭 / 打开 / 无匹配 / 键盘选中 |

---

## 六、交互细节

1. 输入即开始，回车或 `⌘Enter` 触发生成，不需要先点按钮。
2. `Esc` 或「停止」中断流，已生成字段可编辑，未生成字段显示「未生成」+ 单独重试。
3. 诊断 150ms 防抖，不阻塞输入；点击问题滚动并选中命中文本。
4. 批量修复跳过用户手改字段；对脏字段单项修复需二次确认。
5. 字段级错误贴在字段上；全局错误才用页面级横幅。
6. 断网或无密钥时编辑、诊断、导出、浏览库全部可用；模型操作禁用并说明原因。
7. `⌘K` 打开命令面板，方向键选择，回车执行，`Esc` 关闭。
8. `\` 折叠左轨，输入框内不触发。

快捷键：

| 键 | 动作 |
|---|---|
| `⌘Enter` | 生成 / 运行 |
| `⌘K` | 命令面板 |
| `⌘S` | 保存新版本 |
| `Esc` | 中断流 / 关闭浮层 |
| `\` | 折叠左轨 |
| `⌘Z` / `⌘⇧Z` | 撤销 / 重做 |
| `⌥1..3` | 结构化 / 渲染文本 / JSON |

---

## 七、绝对禁止项

1. 禁止纯黑正文与纯黑页面底；深色用 `#1A0F0A` 一类的暖棕。
2. 禁止把 QuestUI 原稿的 `#991B1B`、`#581C87` 当作文字色；它们的对比度不达标。
3. 禁止白字压在金色上；金色主按钮用 `--on-accent` 深字。
4. 禁止彩色渐变、玻璃拟态、霓虹描边、3D 斜面、emoji 图标。
5. 禁止 glow 常驻或每个卡片都发光；同一屏发光元素不超过 2 个。
6. 禁止 11px 中文 chip 与大写变形；中文最小 12px。
7. 禁止只靠颜色表达状态；必须同时有文字或图标。
8. 禁止在按钮、标签、数据上使用衬线；衬线只给页面级标题、大陈述句与 KPI 数字。
9. 禁止等尺寸、空心信息的装饰性卡片网格；每张卡必须有自己的真实内容。
10. 禁止把模态框当第一选择，优先内联或抽屉。
11. 禁止交互组件缺 disabled / loading / error 状态。
12. 禁止界面文案用感叹号，禁止 em dash，禁止「强大」「智能」这类空词。

---

## 八、令牌变更流程

1. 改 `app/globals.css` 的 `:root` 与 `.dark`，两套主题同时改。
2. 跑对比度脚本（OKLCH/HEX → sRGB → WCAG），浅色与深色最低都不低于 4.5:1。
3. 更新本文第二节的令牌表与对比度表。
4. 跑 `pnpm run typecheck`、`pnpm test`、`pnpm build`，再出 1440 / 1024 / 390 截图，含深浅两套。
5. 若改动涉及方向性判断，先写 ADR 再改。
6. 跑测试前先停掉 3100 上的服务，测试与运行中的应用共用一个 SQLite 文件。

---

## 九、实施顺序

| 阶段 | 内容 | 验收 |
|---|---|---|
| Q0 | 本文 + 工作台静态样张 | 1440 / 390 截图，深浅两套 |
| Q1 | 令牌层 + Button / Input / Chip / Card / Panel / Tabs | 对比度脚本、typecheck、493 测试 |
| Q2 | 工作台迁移 | AC-1 / 3 / 12 / 13 |
| Q3 | 库 + 评估 | AC-6，无评委不显示 0 |
| Q4 | 模板 + 设置 + 全局 chrome | AC-11 |
| Q5 | 响应式 + 双主题 + a11y | NFR-7 / 8，三档截图 |

每阶段独立 diff。Q0 只交付文档与样张，不改应用代码。