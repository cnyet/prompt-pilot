# prompt-pilot Claude Code Guide

> Project-level map. Global policy stays in `~/.claude/CLAUDE.md`; detailed
> project rules belong in on-demand files under `.claude/docs/`.

## Purpose

PromptPilot · 提示词工坊：把一句话需求变成结构完整、可直接投产的标准提示词。
Next.js App Router + React 19 + TypeScript 全栈单体（`pnpm dev`，端口 3100），
Prisma + SQLite（`data/`），火山方舟为默认 LLM 适配，无 key 时走 L1 离线模板模式。

## Sources Of Truth

- `README.md` for repository orientation and the documentation index.
- `docs/HANDOVER.md` for how to run, code map, and unfinished work — read this first when picking up the project.
- `.claude/docs/runtime.md` for runtime and build details.
- `.claude/docs/delivery.md` for delivery and verification rules.
- `.agent/memory/ACTIVE_CONTEXT.md` for durable task state when initialized.

## Commands

```bash
pnpm run typecheck   # tsc --noEmit
pnpm test            # vitest run
pnpm dev             # 端口 3100
```

> 本项目无 lint 脚本，包管理器统一用 pnpm（`pnpm@10.14.0`）。

## Hard Constraints

- Read the relevant source of truth before changing behavior.
- Do not copy global policy into this file.
- Do not add secrets, credentials, or private configuration values.
- Keep project-specific MCP definitions in `.mcp.json`.
- `.agent/memory/` is owned by `conversation-accuracy-skill`.

## Verification

```bash
node ~/.claude/scripts/claude-project-harness-check.mjs .
pnpm run typecheck
pnpm test
```

Report verified results, unverified items, residual risk, and rollback.
