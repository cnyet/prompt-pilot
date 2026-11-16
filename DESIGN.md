---
name: PromptPilot
description: 提示词生成与优化工作台，结果优先，过程隐身
colors:
  parchment-bg: "#f3ead8"
  parchment-sunken: "#eadfc8"
  paper-surface: "#fbf5e9"
  paper-raised: "#fff9ee"
  paper-inset: "#efe3ce"
  sidebar-parchment: "#efe3ce"
  border-warm: "#d8c7a8"
  border-strong: "#b99f72"
  border-subtle: "#e4d7bf"
  ink: "#2a1a10"
  ink-muted: "#6b4b2e"
  ink-faint: "#85643f"
  candle-gold: "#8a5a00"
  candle-gold-hover: "#6f4800"
  candle-gold-subtle: "#f0e2c4"
  on-candle: "#fbf5e9"
  success-moss: "#2f6b3a"
  warning-amber: "#8a5a00"
  danger-brick: "#8f1d14"
  info-violet: "#5b2a86"
  tint-gold: "#f0e2c4"
  tint-red: "#f3dfd9"
  tint-green: "#dfebda"
  tint-purple: "#e8ddf0"
  diff-add: "#e4eedf"
  diff-add-mark: "#cbe0c2"
  diff-del: "#f3dfd9"
  diff-del-mark: "#e8c4bb"
typography:
  display:
    fontFamily: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", Georgia, "Times New Roman", serif'
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.12
  display-lg:
    fontFamily: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", Georgia, "Times New Roman", serif'
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.1
  headline:
    fontFamily: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", Georgia, "Times New Roman", serif'
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", Georgia, "Times New Roman", serif'
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.7
  body-lg:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  chip: "2px"
  control: "4px"
  panel: "6px"
  overlay: "8px"
  pill: "9999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-8: "32px"
  space-12: "48px"
  space-16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.candle-gold}"
    textColor: "{colors.on-candle}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.candle-gold-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.candle-gold}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
    typography: "{typography.label}"
  button-destructive:
    backgroundColor: "{colors.danger-brick}"
    textColor: "{colors.on-candle}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
    typography: "{typography.label}"
  input-field:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
    typography: "{typography.label}"
  chip-default:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.chip}"
    padding: "0 10px"
    height: "24px"
    typography: "{typography.caption}"
  card-default:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.panel}"
    padding: "20px"
  nav-item-active:
    backgroundColor: "{colors.candle-gold-subtle}"
    textColor: "{colors.candle-gold}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "40px"
    typography: "{typography.label}"
  rating-star:
    backgroundColor: "transparent"
    textColor: "{colors.candle-gold}"
    size: "18px"
---

# Design System: PromptPilot

## 1. Overview

**Creative North Star: "烛光落在纸面上"**

PromptPilot 是一张会发光的羊皮纸工作台，v3 把光从流程移到结果。用户不需要看系统怎么想，只需要看写出来的提示词好不好用。因此结果面是屏幕上最亮、最大、最安静的一块纸；左轨、顶栏、输入区都退到更暗的羊皮纸层里。默认路径不超过三步：给出需求或原文，读结果，复制带走。

材质沿用 v2 的深棕分层、金色主操作、衬线标题、细描边与克制的金色 glow，但删掉多阶段时间轴、八字段 bento、假设 chip 墙、评估仪表盘这类流程表演。奇观只出现在三个位置：当前模式、主操作、当前选中项。其余区域保持工具密度，让阅读与复制成为唯一焦点。

两套主题都必须可用。深色是主场景，像夜里的一盏烛光落在深棕桌面上；浅色是白天办公室的羊皮纸变体，不是深色的简单反相。中文标题走系统宋体，正文走系统无衬线，代码与源码走等宽，零网络字体。

这套系统明确拒绝：全流程提示词工程平台（变量集、数据集、评分器、评估任务铺满首屏）、把中间过程当卖点的字段骨架与假设 chip 墙、紫色渐变、玻璃拟态、发光边框、「AI 驱动」角标、大而空的欢迎页、把每个结果塞进层层卡片、只靠颜色表达状态、emoji 图标、感叹号文案。

**Key Characteristics:**

- 结果面是屏幕上唯一的亮纸，chrome 退到 sunken 与 sidebar 层。
- 金色是稀缺资源：主操作、当前导航、焦点、一个 KPI，合计不超过单屏 10%。
- 双主题一套材质，深色是烛光变体，浅色是日光羊皮纸。
- 中文宋体只给页面标题、大陈述句与 KPI 数字；正文、按钮、标签、数据一律无衬线。
- 动效只动 opacity 与 transform（glow 的 box-shadow 过渡是唯一例外），120 到 180ms；glow 只给 active / selected / focus，同屏不超过 2 个。
- 工具密度与阅读留白并存：chrome 紧凑，结果正文 68ch 上限。

## 2. Colors: 羊皮纸与烛光

暖羊皮纸分层加一盏金色烛光。只有一个品牌强调色，其余颜色都是状态与 diff 的语义角色。

### Primary

- **Candle Gold** (#8a5a00，深色主题 #ca8a04)：主按钮、当前导航、焦点环、一个主 KPI。它必须稀缺，像黑屋里的一盏灯。
- **Candle Gold Hover** (#6f4800)：主按钮悬停与按下，只加深，不换色相。
- **Candle Gold Subtle** (#f0e2c4)：当前导航底、选中行底。它是金光的低亮度版本，不做大面积背景。

### Neutral

- **Parchment Background** (#f3ead8)：页面底。暖米白，不用纯白。
- **Parchment Sunken** (#eadfc8)：凹陷层、代码块、输出底色、只读区。
- **Paper Surface** (#fbf5e9)：卡片、面板、输入框。结果面默认这一层。
- **Paper Raised** (#fff9ee)：浮层、下拉、悬停卡。比 surface 再亮一档。
- **Paper Inset** (#efe3ce)：只读摘要、需求回显。
- **Sidebar Parchment** (#efe3ce)：左轨与移动端导航，比内容面暗一档。
- **Ink** (#2a1a10)：主文字，深棕墨，不用纯黑。
- **Ink Muted** (#6b4b2e)：次级文字、导航未选中。
- **Ink Faint** (#85643f)：元信息、占位符、时间与费用标签。
- **Border Warm** (#d8c7a8)：容器边框。
- **Border Strong** (#b99f72)：悬停边框、焦点边框。
- **Border Subtle** (#e4d7bf)：仅分隔线，不用于可交互容器。

### Semantic

- **Success Moss** (#2f6b3a)：完成、通过、已知金额为正。配 tint-green 底与文字。
- **Warning Amber** (#8a5a00)：接近预算、可优化项。与金色同族，靠文案与图标区分。
- **Danger Brick** (#8f1d14)：错误、删除、不满足。配 tint-red 底。
- **Info Violet** (#5b2a86)：中性信息、稀有状态。配 tint-purple 底。
- **Diff Add** (#e4eedf) 与 **Diff Add Mark** (#cbe0c2)：优化新增行与行标。
- **Diff Del** (#f3dfd9) 与 **Diff Del Mark** (#e8c4bb)：优化删除行与行标。

深色主题是等价变体：背景进入 #1a0f0a 一类的暖棕，文字变成羊皮纸色，金色提亮到 #ca8a04。完整对应关系在 `app/globals.css` 与 `.impeccable/design.json` 的 `colorMeta.*.darkValue`，不在正文里重复数值。未知值一律显示「—」，用 `ink-faint`，不写 0。

### Named Rules

**The One Candle Rule.** 金色在任意单屏不超过 10% 面积。如果每个卡片都在发光，就没有东西在发光。

**The Parchment Layering Rule.** 层次先靠 tonal surface 与 1px 边框建立，阴影是辅助。不要用重阴影代替分层。

**The Semantic Pair Rule.** 任何语义色必须同时有文字或图标。禁止只靠颜色表达状态。

**The Result Is the Light Rule.** 结果面用 `paper-surface` 或更亮的 `paper-raised`，chrome 用 `bg`、`bg-sunken`、`sidebar`。屏幕上最亮的纸永远是用户正在读的提示词。

## 3. Typography

**Display Font:** Songti SC 栈（"Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", Georgia, serif）
**Body Font:** 系统无衬线栈（-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif）
**Label/Mono Font:** ui-monospace（"SF Mono", Menlo, Consolas, monospace）

**Character:** 中文宋体负责「像一本工具手册」的页面级语气，系统无衬线负责所有控件与正文，等宽负责源码与数字。三者分工严格，不加载任何网络字体。

### Hierarchy

- **Display** (display, weight 600, 40px, line-height 1.12): 页面标题、空态大标题，宽屏 48px。必须 `text-balance`。
- **Headline** (display, weight 600, 26px, line-height 1.25): 区块标题。
- **Title** (display, weight 600, 18px, line-height 1.35): 面板标题、卡片标题。
- **Body** (body, weight 400, 15px, line-height 1.7): 默认正文、表单辅助文字。正文行长上限 68ch。
- **Body Large** (body, weight 400, 16px, line-height 1.75): 渲染后的 Markdown 提示词正文，行长上限 68ch。
- **Label** (label, weight 500, 13px, line-height 1.4): 按钮、导航、表单标签。
- **Caption** (body, weight 400, 12px, line-height 1.4): 元信息、状态、时间、费用。
- **Mono** (mono, weight 400, 14px, line-height 1.6): 源码视图、token 数、模型 ID、费用数字。

### Named Rules

**The Two-Voice Rule.** 衬线只给页面级标题、大陈述句与 KPI 数字。按钮、标签、表格、数据、导航一律无衬线。

**The 12px Floor Rule.** 中文最小 12px，不做大写变形。11px 中文 chip 与 `text-transform: uppercase` 都在禁止之列。

**The Tabular Numbers Rule.** 所有数字使用 `tabular-nums`，包括耗时、token、费用、评分计数与迭代序号。

**The Source Is Mono Rule.** 提示词源码、模型 ID、token、费用一律等宽。渲染视图里的代码块同样用等宽，并允许横向滚动。

## 4. Elevation

混合式：以 tonal layering 为主，柔和暖阴影为辅。卡片与面板在静止时就有 1px 边框与轻阴影，抬升与浮层加强阴影；glow 不是装饰，而是状态，只出现在当前模式、选中项与焦点上。深色主题把阴影换成黑色透明度，glow 换成更亮的金色。

### Shadow Vocabulary

- **Elevation Small** (`0 1px 3px rgba(90,60,20,.14)`): 默认卡片与面板的静止阴影，几乎不可察觉，只用来把纸从底上托起。
- **Elevation Medium** (`0 2px 8px rgba(90,60,20,.18)`): 抬升卡片、下拉、悬停浮层。
- **Elevation Large** (`0 8px 24px -12px rgba(90,60,20,.28)`): 弹层、抽屉、命令面板。
- **Glow Gold** (`0 0 0 1px #8a5a00, 0 0 16px rgba(138,90,0,.25)`): 当前导航、选中项、结果面聚焦。
- **Glow Gold Strong** (`0 0 0 1px #ca8a04, 0 0 24px rgba(202,138,4,.32)`): 主操作按下。

### Named Rules

**The Two Glows Rule.** 同屏同时发光的元素不超过 2 个。当前导航算一个，主操作或选中项算另一个。

**The State-Only Glow Rule.** glow 只出现在 active / selected / focus。禁止常驻 glow，禁止给所有卡片加顶部金边再加 glow。

**The No-Blur Rule.** 遮罩用纯色半透明，不做背景模糊。玻璃拟态在这个系统里没有位置。

## 5. Components

组件遵循 cva 加 Radix Slot 的工程模式，不引图标库、动效库、CSS-in-JS、状态库。图标全部内联 SVG，线性描边，active 时金色。

### Buttons

- **Shape:** 4px 圆角（`--radius-control`），高度 32 / 40 / 48px，图标 14 / 15 / 16px。
- **Primary:** 金色底、`on-candle` 深字、1px 深金边、轻阴影。每屏最多一个。
- **Secondary:** 透明底、金色文字、1px 金色边，用于次要动作。
- **Ghost:** 透明底、`ink-muted` 文字、无边框，悬停有 `surface-raised` 底。工具栏与图标按钮用它。
- **Destructive:** 深红底、浅色文字，只用于删除与不可逆操作。
- **States:** default / hover / focus-visible / active / disabled 全部实现。disabled 为 40% 透明度，边框降为 `border-subtle`。focus-visible 用 2px 金色环，offset 2px。

### Inputs / Fields

- **Style:** 40px 高、4px 圆角、`paper-surface` 底、1px `border-warm`。
- **Hover:** 边框转为 `border-strong`。
- **Focus:** 2px 金色边框加 3px 金色 25% 外环；不使用浏览器默认 outline。
- **Error:** 2px `danger-brick` 边框加同色 25% 环，`aria-invalid="true"`，错误文字贴字段下方。
- **Disabled / Read-only:** `bg-sunken` 底，`ink-faint` 或 `ink-muted` 文字。
- **Textarea:** 最小高度 96px，可纵向 resize。工作台主输入区可以用 160px 以上的大输入面。
- **Select:** 40px 高，保留原生能力，右侧 8px 内边距留给箭头。

### Chips

- **Style:** 2px 圆角（`--radius-chip`），最小 24px 高，12px 文字，`paper-surface` 底，1px 边框，`ink-muted` 文字。
- **Selected:** 金色底、`on-candle` 文字、无边框，用于模式、目标类型与筛选项。
- **Semantic:** success / warning / error / info 用对应 tint 底加语义文字，并带前置圆点或图标。圆点不是装饰，是第二重编码。
- **Removable:** 右侧 16px 移除按钮，`aria-label` 默认「移除」。
- **Usage:** 模式标签、目标类型、筛选项、状态、继续优化快捷建议。不要用 chip 代替按钮。

### Cards / Containers

- **Corner Style:** 6px 圆角（`--radius-panel`）。
- **Background:** `paper-surface`；抬升态用 `paper-raised`。
- **Border:** 1px `border-warm`；抬升态用 `border-strong`。
- **Shadow:** 静止用 elevation-sm；抬升用 elevation-md。
- **Padding:** 16 / 20 / 24px 三档，由内容密度决定，不统一塞 24px。
- **Accent Variant:** 顶部 2px 金色描边，只给「当前结果」「当前模板」「重要 KPI」。
- **Selected:** `candle-gold-subtle` 底加金色边框与 glow。
- **禁止:** 卡片套卡片；等尺寸、空心信息的装饰性卡片网格；所有卡片同时加金边与 glow。

### Navigation

- **Desktop:** 左侧 64px 图标轨，`\` 展开到 208px 并显示文字。四项：工作台（/studio）、提示词库（/library）、模板（/templates）、设置（/settings）。没有「评估」。
- **Item:** 40px 高、4px 圆角、18px 内联 SVG 图标。未选中用 `ink-muted`，悬停 `surface-raised`，选中 `candle-gold-subtle` 底加金色文字与 glow。
- **Top Bar:** 72px 高，持有全站唯一 `h1`（当前页面名，衬线 26px），右侧是模型状态、命令面板、主题切换。日期在挂载后计算，避免时区 hydration 不一致。
- **Mobile (<1024px):** 左轨隐藏，改为底部四项标签栏；顶栏保留页面名与模型状态。焦点顺序与桌面一致。
- **Brand Mark:** 40px 印章式 P，右上角一颗四角星。描边与星同为金色，不填色块。站点图标 `app/icon.svg` 用同一枚符号。

### Workspace Result Surface (signature)

工作台是 v3 的核心页面，只做两件事：生成与优化。默认路径极短，结果面是主角。输入区与结果面上下排在一条 960px 居中单列里：先在上方说明需求，再在下方读结果；全新提交后结果面自动滚入视野。

- **Mode Tabs:** 「优化 / 生成」两个标签（优化在前，默认选中优化），沿用 Tabs 组件，置于输入卡片顶部，底部 2px 金色描边。切换不丢另一侧输入。
- **Target Type:** 生成模式下的三选一 chip：文本 / 图片 / 视频。图片与视频在提示词中纳入构图、风格、光线、镜头维度。
- **Input Card:** 大输入面，主输入最小高度 280px，生成模式 1 到 2000 字，优化模式 1 到 8000 字并可附最多 500 字优化要求。主操作是唯一金色按钮。
- **Result Panel:** 屏幕上最亮的纸。默认渲染 Markdown，正文 16px / 1.75，68ch 上限；可切换「源码」查看原始文本，源码用等宽。顶部动作：复制、下载 .md、重新生成、停止。停止后保留已生成内容。
- **Meta Row:** 模型、耗时、输入输出 token、估算费用。未知显示「—」，不写 0。
- **Compare:** 优化模式默认看结果，切换「对比原文」显示 diff。支持并排与行内两种视图，新增、删除、修改逐行高亮；中文按字符级比较。原文永远保留，可切回原文视图。
- **Notes:** 结果下最多 3 条改动说明，用 label 字号，不进入正文，不展示推理过程。
- **Continue Bar:** 常驻继续优化输入框，右侧四个快捷 chip：更简洁、更具体、更严格、换一种风格。chip 只填入输入框，不直接提交。
- **Check Panel:** 按需展开的本地检查，不常驻、不实时刷新。error / warn / info 分组，error 用 tint-red，建议用 tint-gold。可修复项生成新迭代，不覆盖历史。
- **Actions:** 收藏、1 到 5 星评分、存为模板、复制纯文本。收藏与评分即时生效，不打断阅读。
- **Empty / No-Key:** 空态只给一句说明与一个动作。无密钥时禁用提交，说明原因并给出去设置入口，绝不伪造输出。

### Rating (signature)

- **Shape:** 5 颗 18px 星，金色填充，未选中为 `border-strong` 描边。
- **States:** 未评分显示「未评分」文字；悬停预览到当前星；点击选中并可改；可清除回未评分。禁止显示 0 星或 0 分。
- **Accessibility:** 提供 `radiogroup` 语义或等价的键盘操作，左右方向键调整；选中状态同时有文字标签，不只靠颜色。

### Library Record Row (signature)

- **Row:** 48 到 56px 高，标题加一行输入摘要，右侧模式 chip、目标类型 chip、评分、收藏图标、更新时间、模型与费用。
- **States:** 悬停 `surface-raised`；选中 `candle-gold-subtle` 底加 2px 金色顶边，不用左侧色条。
- **Empty Values:** 未评分显示「未评分」，未知费用显示「—」，不显示 0。
- **Detail Drawer:** 右侧 480 到 560px 抽屉，遮罩 `rgba(26,15,10,.55)`，不做背景模糊。内容依次为结果、迭代时间线、任意两轮对比、继续优化、复制导出、存为模板、删除。焦点陷阱由组件负责。

### Template Card (signature)

- **Grid:** 三类标签（文本 / 图片 / 视频）下的异构网格，卡片尺寸随内容与封面比例变化，不做等尺寸空壳。
- **Cover:** 程序化 SVG 或 CSS 构图，三种视觉语言：文本类用排版构成，图片类用平面色块构图，视频类用画幅与序列构成。不依赖外部图片服务，不使用渐变。
- **Content:** 标题、一句话说明、风格标签、目标类型、动作「用它开始」。生成型模板预填示例需求，优化型模板预填模板正文。
- **Featured:** 重要模板加顶部 2px 金色描边，其余卡片不加。
- **Custom:** 自定义模板与内置模板同列展示，可删除；内置模板不可删除。

### Settings Panels

- **Layout:** 左侧锚点导航（模型 / 成本），右侧分区。窄屏改为吸顶两段横向分段条。
- **Model Hero:** 单行状态条，说明「已接入真实模型」或「未配置模型」。下面两个模型槽位：生成模型、优化模型，允许相同。密钥只显示末四位。
- **Actions:** 测试连接只测已保存配置，15 秒超时；有未保存改动时禁用并说明原因。
- **Cost:** 四个 KPI 用衬线数字；近 14 天柱状折线图，柱为调用次数，线为已知金额；按模型与按阶段两张表，每页 10 行；预算条显示已用比例，80% 提示，100% 强提示但不阻断调用。
- **Unknown:** 未知金额显示「—」，趋势图没有已知金额时不画折线，不补 0。未设置预算显示「未设置」，不显示 0%。

### State Matrix

| 组件 | 必须实现的状态 |
|---|---|
| Button | default / hover / focus-visible / active / disabled |
| Input / Textarea / Select | default / hover / focus / read-only / disabled / error |
| Tabs | default / hover / active / 带计数 |
| Chip | default / hover / selected / removable / 四种语义 |
| Card | default / elevated / accent / interactive hover / selected |
| Nav Item | default / hover / active / expanded / collapsed |
| Record Row | default / hover / selected / loading |
| Check Item | error / warn / info / fixing / fixed |
| Run Output | empty / streaming / done / failed / canceled |
| Rating | unrated / hover / selected / read-only |
| Empty State | 图标位 / 一句话 / 一个动作 |

### Motion

只动 opacity 与 transform，唯一例外是 `.glow-in` 的 box-shadow 过渡，用 ease-out-quart（`cubic-bezier(0.16, 1, 0.3, 1)`）：

- `.rise` 120ms：内容首次出现。
- `.reveal` 180ms：容器展开、抽屉打开。
- `.glow-in` 200ms：active / selected 的 glow 淡入。
- `prefers-reduced-motion: reduce` 下全部归零，glow 直接显示。
- 不编排页面入场，不做滚动驱动动画，不动 layout 属性。

### Responsive

1440px 为设计基准。1280px 起左轨可展开；1024px 以下左轨隐藏，改为底部四项标签栏，内容单列。结果正文 68ch 上限，表格允许横向滚动。移动端不隐藏评分、收藏与复制。

## 6. Do's and Don'ts

### Do:

- **Do** 让结果面成为屏幕上最亮的纸，chrome 用 sunken 与 sidebar 层退后。
- **Do** 把金色限制在单屏 10% 以内：主操作、当前导航、焦点、一个 KPI。
- **Do** 每屏只给一个 primary 按钮，其余用 secondary 或 ghost。
- **Do** 让语义色同时带文字或图标，状态永远有第二重编码。
- **Do** 未知值显示「—」，未评分显示「未评分」，未设置预算显示「未设置」，不写 0。
- **Do** 所有数字用 `tabular-nums`，所有中文不小于 12px。
- **Do** 结果正文用 16px / 1.75、68ch 上限；源码视图用等宽，可横向滚动。
- **Do** 优化必须给 diff 与最多 3 条改动说明，原文永久保留。
- **Do** 完成即自动入库，用户不需要额外保存。
- **Do** 全流程键盘可达，焦点环 2px 金色，offset 2px。
- **Do** 双主题同时维护，深色是烛光变体，不是反相。
- **Do** 用 tonal surface 与 1px 边框分层，阴影只做辅助。
- **Do** 空态给一句说明与一个动作，不写「暂无数据」。

### Don't:

- **Don't** 展示结构化字段、假设 chip、JSON 视图、评估仪表盘或多阶段时间轴。PRODUCT.md 明确把这些列为反参考：全流程提示词工程平台、把中间过程当卖点的字段骨架、假设 chip 墙、评分仪表盘。
- **Don't** 使用紫色渐变、玻璃拟态、发光边框、「AI 驱动」角标。这些在 PRODUCT.md 与本文都是明确反参考。
- **Don't** 使用大而空的欢迎页，或把每个结果都塞进层层卡片。
- **Don't** 给所有卡片加金色顶部描边再加 glow；同屏发光元素最多 2 个。
- **Don't** 使用纯黑正文或纯黑页面底。深色用暖棕（#1a0f0a 一类），浅色用羊皮纸（#f3ead8 一类）。
- **Don't** 在按钮、标签、表格、数据上使用衬线。衬线只给页面级标题、大陈述句与 KPI 数字。
- **Don't** 使用 11px 中文、cheap 大写变形或 `text-transform: uppercase`。
- **Don't** 只靠颜色表达状态。红绿必须配文字或图标。
- **Don't** 使用 `border-left` 或 `border-right` 大于 1px 的彩色侧条。选中态用整块底色加顶部金边。
- **Don't** 使用 `background-clip: text` 的渐变文字。
- **Don't** 使用 emoji 图标。图标一律内联 SVG，线性描边。
- **Don't** 使用感叹号、em dash 或「强大」「智能」「一键起飞」这类空词。
- **Don't** 把模态框当第一选择。优先内联或抽屉。
- **Don't** 交付缺少 disabled / loading / error 状态的交互组件。
- **Don't** 用背景模糊做遮罩。遮罩用纯色半透明（`rgba(26,15,10,.55)`）。
- **Don't** 用 0 代替未知，用 0 星代替未评分，用 0% 代替未设置预算。
