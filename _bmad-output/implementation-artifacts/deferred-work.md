# Deferred Work

## Deferred from: code review of 1-1-project-scaffold-and-dev-prod-scripts (2026-03-28)

- `tsconfig.node.json` not referenced in main `tsconfig.json` via a `references` field. IDEs that only load the root `tsconfig.json` may show type errors on `vite.config.ts` and `drizzle.config.ts`. Not a build or runtime issue — the split config is functional. Consider adding `"references": [{ "path": "./tsconfig.node.json" }]` and marking `tsconfig.node.json` with `"composite": true` in a future cleanup pass.

## Deferred from: code review of 1-2-database-schema-shared-types-and-boot-migrations (2026-03-28)

- `migrationsFolder` uses a CWD-relative path `'./src/db/migrations'` — breaks if process is not started from project root. Contrast with `src/index.ts` which already uses `import.meta.dir` for the dist path. Consider switching to `join(import.meta.dir, '../migrations')` in a future refactor. (By spec design for this story.)
- `runMigrations()` has no try/catch — a migration failure throws a raw unformatted exception that crashes the process. Consider wrapping in a try/catch with a structured error message before calling `process.exit(1)`. (By spec design for this story.)
- `DB_PATH` env var is used without validation — an invalid or malicious path is silently accepted. Will be addressed in Story 1.3 env validation.
- `recommendation` DB column is unconstrained `text` — the `['apply', 'investigate', 'skip']` enum is only enforced by Zod. Direct DB writes can store arbitrary values. SQLite has no native enum; could add a CHECK constraint in a future migration if stricter enforcement is needed.
- `company`/`jobTitle` in `jobInputSchema` accept empty strings (`z.string()` with no `.min(1)`). A blank-name row can be inserted and becomes a permanent block on future inserts with the same empty key. Add `.min(1)` if ingest issues arise.
- `company`/`jobTitle` uniqueness index is case-sensitive — `"Google"` and `"google"` are distinct rows. Normalization (lowercasing or collation) could be added in a future migration if duplicate detection issues arise.
- `db` SQLite singleton is never explicitly closed — on unclean process exit (SIGTERM, crash) the WAL file may not be fully flushed. Consider adding `process.on('exit', ...)` cleanup in a future story.
- Date fields (`dateScraped`, `coverLetterSentAt`, `dateApplied`) stored as raw `text` with no format enforcement beyond Zod `z.string()`. Non-ISO-8601 values can be inserted via direct DB access and will corrupt date-sorting/filtering. Add a Zod `.datetime()` or `.regex()` refinement in a future story if data integrity issues arise.
- `fitScore` has no DB-level CHECK constraint — values outside `[0, 100]` can be stored via direct DB writes. Consider adding `CHECK(fit_score BETWEEN 0 AND 100)` in a future migration.
