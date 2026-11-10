# ADR-0005 回归 shadcn/ui 组件基础库

- 状态：已接受
- 日期：2026-11-10
- 决策者：产品负责人（前端）

## 背景

`docs/ARCHITECTURE.md` 技术选型表原本写明组件层用 **shadcn/ui（Radix 底座）**，状态层用 Zustand + TanStack Query。实际实现期间确立了「零依赖基调」（不引组件库/图标库/状态库，图标内联 SVG），组件层走了手写路线：`components/ui/` 下 9 个组件全部手写，`Button` 用 `clsx + tailwind-merge` 拼 variant。

这造成规划与实现分叉：ARCHITECTURE.md 说 shadcn，代码里没有；选型表的组件/状态/图表三行都与现实不符。经确认，决定**回归规划**：组件层采纳 shadcn/ui。

## 决策

采纳 shadcn/ui 作为组件基础库，但**采纳它的工程模式，而非照搬它的 token 命名与图标集**：

1. **变体组合**：用 `class-variance-authority`（cva）替换手写 `VARIANTS`/`SIZES` 映射。
2. **asChild 合成**：引入 `@radix-ui/react-slot`，`Button`/`IconButton` 支持 `asChild`，让链接复用按钮样式（取代 `buttonStyles` 拼 Link 的 hack）。
3. **cn 工具**：沿用现有 `lib/utils.ts` 的 `cn`（本就是 shadcn 标准 `clsx + twMerge` 实现）。
4. **保留项目 token**：不改 `globals.css` 的语义令牌。shadcn 的规范 token 名（`background`/`primary`/`accent`）与本项目 `accent = 赤陶主色` 冲突，逐条映射会制造 `bg-accent` 二义。组件内部直接用项目 token（`bg-accent`/`text-on-accent`/`border-line`）。
5. **保留内联 SVG 图标**：不引入 lucide-react。图标库禁令仍然有效。

后续可按需从 shadcn 抄入 Dialog / DropdownMenu / Tooltip 等 Radix 基座组件，一律映射到项目 token。

## 后果

**正面**
- Button 层能力升级（`asChild`），变体可组合、可测试。
- 消除 ARCHITECTURE.md 与现实的分叉（组件层）。
- 为后续需要真实交互基座（菜单、对话框、提示）的组件铺路。

**负面 / 代价**
- 新增 2 个运行时依赖：`class-variance-authority`、`@radix-ui/react-slot`。
- 推翻「零依赖」约束的组件层部分（见下）。

## 约束边界（什么仍被禁）

「零依赖基调」**仅对 UI 基座组件放宽**。以下仍然禁止，不随本条 ADR 变化：

- 动效库（仍只用 CSS 两类 rise/reveal + now-pulse，见 ADR-0002）。
- CSS-in-JS。
- 图标库 / 图标字体（lucide-react 不采用）。
- 图表库（仍自绘横向条，见 ADR-0001 / ARCHITECTURE.md 图表行）。
- 状态库 Zustand / TanStack Query：本 ADR 不引入；如将来需要，另立 ADR。

## 范围外

Zustand、TanStack Query、Next.js 版本（现为 16，已高于规划）不在本次回归内。
