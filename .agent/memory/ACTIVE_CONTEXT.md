# Active Context

> Last updated: 2026-11-11T16:12:00Z

## Current Task
- Done: DESIGN Q0-Q5 收口（`5d771bb`/`d1b86e8`/`1bb2d69`）；最近使用（`8c32e9d`）；工作台输入放大、主路径模板、品牌印记、opencode 网关、成本趋势图（`4e5a856`）；设置页「测试连接」与成本分页、移动导航/评估空样本/设置窄屏分段条（未提交）。
- Goal: 维持「烛光羊皮纸」视觉与 DESIGN.md 一致；后续只做功能性欠账与真机验证。
- In progress: 无。根目录只清理 `.DS_Store` 与 `tsconfig.tsbuildinfo`，后者被 `pnpm typecheck` 重建属正常。
- Next step: 验收未提交改动后按需提交；连通性测试已用 mock 覆盖成功路径，真实联网需配置 ARK_API_KEY。
- Blockers: 环境无 ARK_API_KEY；DeepSeek V4.1 Flash / GPT 5.6 Luna 暂无价格，真实成本显示未知。

## Current Constraints
- 令牌以 `DESIGN.md` 第二节为准，代码在 `app/globals.css`；改令牌须同步文档并跑 `pnpm check:contrast`。
- 全部文字组合 ≥4.5:1（深色最低 4.70:1）；中文标题系统宋体、零网络字体；金色只给主操作/当前步骤/关键数字；glow 只给 active/selected/focus，同屏 ≤2。
- 每页只有一个 h1（AppShell 顶栏页面名），内容标题用 h2；全局 `:focus-visible` 金色 2px。
- 左轨与 MobileNav 在 1024px 切换；玻璃拟态、渐变、emoji 图标禁止。
- 组件走 cva + Radix Slot；不引动效库、图标库、CSS-in-JS、图表库、状态库。
- 界面中文；禁止感叹号与 em dash；单屏 primary 按钮 1 个。
- 跑测试前停 3100；Chrome 隔离只用 `--user-data-dir` 与 `--password-store=basic`，绝不覆盖 HOME。

## Hard Constraints
- `lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结契约。
- 未知一律 null，不写 0；无判定显示「—」+ 待人工判定。
- 密钥只存本机 SQLite，接口只回末四位。
- 冻结契约与 CI 工作流改动须 code owner 审阅（`.github/CODEOWNERS`）。

## Do Not Retry
- 直接照搬 QuestUI 原稿 | 原因: 无中文、仅深色、11px 大写、语义色对比度不达标。
- 用 `readonly:` 变体 | 原因: Tailwind v4 无此变体，必须用 `read-only:`。
- 工作台加右栏版本/对比/质量/导出 | 原因: DESIGN §4.1 + ADR-0004 不采用右栏诊断布局。
- 在 `about:blank` 上写 localStorage 再截图 | 原因: 源不同，主题不生效。
- 组件 JSX 当 null 判断 / 预览组件用 useMemo / 无条件启用 valid mock / 覆盖 HOME 跑 Chrome | 原因: 历史坑。
- 模型显示名直接当 modelId | 原因: 含空格无法过校验，用 kebab slug + `modelDisplayLabel()`。

## Current Decisions
- 默认网关 `https://opencode.ai/inference/go`，provider 用 `openai_compatible`，避免发送方舟专属参数。
- 生成 `deepseek-v4.1-flash`、评估 `gpt-5.6-luna`；显示名只走映射表。
- 成本趋势图按上海时区切日；未知金额不入折线、不补 0；图为 `role="img"` + sr-only 表。
- 左轨 64px 默认、`\` 展开 208px；顶栏持有唯一 h1。
- 对比度脚本解析 `globals.css` 变量，不硬编码。
- 项目无 `prisma/migrations/`，改 schema 用 `pnpm exec prisma db push` + `prisma generate`。
- CI 顺序：contrast → `next typegen` → typecheck → test → build。
- ADR-0001/0004 视觉结论被 ADR-0006 取代；ADR-0002/0003/0005 继续有效。

## Current References
- `DESIGN.md`、`docs/adr/0006-questui-parchment-direction.md`
- `scripts/contrast-check.mjs`、`.github/workflows/ci.yml`
- 截图：`docs/assets/design-v2/`、`docs/assets/bento-r2/`、`docs/assets/bento-r3/`、`docs/assets/bento-q4/`、`docs/assets/q5/`
- `PRODUCT.md`、`CONTEXT.md`、`docs/HANDOVER.md`
- 数据库备份：`data/app.db.bak-20261111-1430`