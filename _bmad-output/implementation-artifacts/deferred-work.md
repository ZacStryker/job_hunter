# Deferred Work

## Deferred from: code review of 1-1-project-scaffold-and-dev-prod-scripts (2026-03-28)

- `tsconfig.node.json` not referenced in main `tsconfig.json` via a `references` field. IDEs that only load the root `tsconfig.json` may show type errors on `vite.config.ts` and `drizzle.config.ts`. Not a build or runtime issue — the split config is functional. Consider adding `"references": [{ "path": "./tsconfig.node.json" }]` and marking `tsconfig.node.json` with `"composite": true` in a future cleanup pass.
