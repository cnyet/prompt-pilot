# 参与 PromptPilot

## 先读什么

- `README.md`：项目入口与文档索引。
- `docs/HANDOVER.md`：怎么跑、代码在哪、哪些约定不能碰。
- `PRODUCT.md`、`DESIGN.md`、`CONTEXT.md`：改行为或界面前必读。
- `AGENTS.md`：给编码 agent 的工作规则，同样适用于人类贡献者。

## 本地开发

需要 Node 24、pnpm 10.14.0。

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm dev            # http://localhost:3100
```

不填 `ARK_API_KEY` 也能跑通全流程，此时进入离线模板模式。

## 提交前

```bash
pnpm check:contrast
pnpm run typecheck
pnpm test
pnpm build
```

跑测试前先停掉 3100 上的开发服务，测试与运行中的应用共用同一个 SQLite 文件。

## 约束

- 不提交密钥、token、生产数据或未脱敏日志。
- `lib/engine/schema.ts` 与 `lib/llm/types.ts` 是冻结契约，改动需要单独讨论。
- 未知值一律显示 `—`，不写 0。
- 界面文案中文优先，遵守 `DESIGN.md` 的禁令与 `CONTEXT.md` 的词表。
- 每个 PR 只做一件事；改动范围超出描述时拆成多个 PR。

## 提交信息

使用祈使句，首行不超过 72 字符，必要时在正文写动机与影响。示例：

```
feat(studio): 假设 chip 支持局部重算
fix(lint): 矛盾约束不再漏报
docs(handover): 补充离线模式排障
```

## 分支与发布

- `main` 保持可构建、测试全绿。
- 功能分支从 `main` 切出，PR 合并前 CI 必须通过。
- 视觉迁移按 `DESIGN.md` 第九节的 Q0-Q5 分阶段提交。