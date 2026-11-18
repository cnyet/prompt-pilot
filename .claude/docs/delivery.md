# Delivery And Orchestration

> On-demand project delivery details. Global orchestration policy remains in
> `~/.claude/docs/orchestration/agent-orchestration.md`.

## Task Levels

- S: direct implementation by the main agent.
- M: one specialist.
- L: specialist pipeline or fan-out.
- XL: design approval, then staged execution.

## Agent Contract

Each implementation agent receives:

1. Inputs and file boundaries.
2. Source of truth.
3. Concrete constraints.
4. Deliverables.
5. Verification commands.
6. Stop conditions.

## Verification Gates

```bash
pnpm run typecheck   # tsc --noEmit（本项目无 lint 脚本，统一用 pnpm）
pnpm test            # vitest run
```

## Memory Boundary

- `.agent/memory/` is owned by `conversation-accuracy-skill`.
- Do not create a second memory writer.
- OpenViking stores raw cross-session history.

## Backlog Placement

- Product requirements: `PRODUCT.md`（FR / NFR / AC）。
- Technical debt: `.agent/memory/todo-tracker.md` 的 Pending / Blocked 与 `docs/HANDOVER.md` 未完成工作。
- Durable task state: `.agent/memory/ACTIVE_CONTEXT.md`（当前态）与 `session-summary.md`（历史决策）。
