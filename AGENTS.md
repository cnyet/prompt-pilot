# PromptPilot Agent Instructions

These instructions are tool-agnostic and apply to coding agents.

## Project

PromptPilot converts a natural-language request into a structured, executable prompt.

- Runtime: Next.js App Router, React, TypeScript, Prisma + SQLite.
- Package manager: pnpm 10.14.0.
- Development port: 3100.

## Sources of truth

- `README.md`: human-oriented project entry and commands.
- `PRODUCT.md`: product scope, users, requirements, and acceptance criteria.
- `DESIGN.md`: UI design system and interaction constraints.
- `CONTEXT.md`: domain vocabulary and semantic boundaries.
- `docs/ARCHITECTURE.md`: technical architecture and contracts.
- `docs/HANDOVER.md`: current status, unfinished work, and recovery notes.

## Working rules

- Read the relevant source of truth before changing behavior.
- Read `DESIGN.md` before changing UI, layout, styles, or components.
- Keep domain terms consistent with `CONTEXT.md`.
- Do not add secrets or private configuration.
- Do not change unrelated files or overwrite user edits.
- Use pnpm, not npm.
- Issues live under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`; see `docs/agents/issue-tracker.md`.
- Domain decisions belong in `docs/adr/`; see `docs/agents/domain.md`.

## Verification

```bash
node ~/.claude/scripts/claude-project-harness-check.mjs .
pnpm typecheck
pnpm test
```

Report executed checks, unverified items, residual risk, and rollback path.
