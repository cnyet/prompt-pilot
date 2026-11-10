Run the repository verification gates from the project root and report each
command with its verbatim exit status.

1. Run the project harness checker:

```bash
node ~/.claude/scripts/claude-project-harness-check.mjs .
```

2. Run the project checks (no lint script in this repo; pnpm only):

```bash
pnpm run typecheck
pnpm test
```

Report failures with the root cause and the narrowest next command. Do not
claim completion when a required command was not run.
