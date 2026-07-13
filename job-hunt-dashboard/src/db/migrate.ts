import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { join } from 'node:path'
import { db, sqlite } from './client'

// Columns added via ALTER TABLE that may be missing on databases affected by migration drift.
// Checked at every startup; adds only what's missing — safe to run repeatedly.
const JOBS_NULLABLE_COLUMNS: Array<[string, string]> = [
  ['source', 'TEXT'],
  ['location', 'TEXT'],
  ['salary', 'TEXT'],
  ['benefits', 'TEXT'],
  ['contact_name', 'TEXT'],
  ['contact_email', 'TEXT'],
  ['contact_phone', 'TEXT'],
  ['external_job_id', 'TEXT'],
  ['relevance_score', 'REAL'],
  ['analysis_status', 'TEXT'],
  ['resume_generated_at', 'TEXT'],
  ['date_analyzed', 'TEXT'],
  ['date_archived', 'TEXT'],
  ['job_reqs_met', 'TEXT'],
  ['job_reqs_missed', 'TEXT'],
  ['candidate_reqs_met', 'TEXT'],
  ['candidate_reqs_missed', 'TEXT'],
  ['generation_context', 'TEXT'],
]

// Columns added via ALTER TABLE after initial webhook_runs creation (migrations 0016–0018, 0025).
const WEBHOOK_RUNS_COLUMNS: Array<[string, string]> = [
  ['duration_ms', 'INTEGER'],
  ['input_tokens', 'INTEGER'],
  ['output_tokens', 'INTEGER'],
  ['cost_usd', 'REAL'],
  ['matched_count', 'INTEGER'],
  ['archived_count', 'INTEGER'],
  ['source_breakdown', 'TEXT'],
  ['user_id', 'INTEGER DEFAULT 1 NOT NULL REFERENCES users(id)'], // 1 = bootstrap admin user
]

// Columns added via ALTER TABLE after initial cover_letters creation (migration 0041).
const COVER_LETTERS_COLUMNS: Array<[string, string]> = [
  ["source", "TEXT DEFAULT 'generated' NOT NULL"], // 'generated' | 'edited'
]

function repairSchema(): void {
  const rows = sqlite.query('PRAGMA table_info(jobs)').all() as Array<{ name: string }>
  const cols = new Set(rows.map((r) => r.name))
  for (const [col, type] of JOBS_NULLABLE_COLUMNS) {
    if (!cols.has(col)) {
      sqlite.prepare(`ALTER TABLE jobs ADD COLUMN ${col} ${type}`).run()
      console.log(`[db] Schema repair: added jobs.${col}`)
    }
  }
}

function repairWebhookRunsSchema(): void {
  const rows = sqlite.query('PRAGMA table_info(webhook_runs)').all() as Array<{ name: string }>
  const cols = new Set(rows.map((r) => r.name))
  for (const [col, type] of WEBHOOK_RUNS_COLUMNS) {
    if (!cols.has(col)) {
      sqlite.prepare(`ALTER TABLE webhook_runs ADD COLUMN ${col} ${type}`).run()
      console.log(`[db] Schema repair: added webhook_runs.${col}`)
    }
  }
}

function repairCoverLettersSchema(): void {
  const rows = sqlite.query('PRAGMA table_info(cover_letters)').all() as Array<{ name: string }>
  // No table => nothing to repair. PRAGMA returns [] for a missing table, and without this guard the
  // loop would see no `source` column and fire ALTER TABLE against a table that does not exist.
  if (rows.length === 0) return
  const cols = new Set(rows.map((r) => r.name))
  for (const [col, type] of COVER_LETTERS_COLUMNS) {
    if (!cols.has(col)) {
      sqlite.prepare(`ALTER TABLE cover_letters ADD COLUMN ${col} ${type}`).run()
      console.log(`[db] Schema repair: added cover_letters.${col}`)
    }
  }
}

function backfillDateArchived(): void {
  const result = sqlite
    .prepare(
      `UPDATE jobs
       SET date_archived = COALESCE(date_applied, date_analyzed, date_scraped)
       WHERE archived = 1 AND date_archived IS NULL
         AND COALESCE(date_applied, date_analyzed, date_scraped) IS NOT NULL`
    )
    .run()
  if (result.changes > 0) {
    console.log(`[db] Backfill: set date_archived on ${result.changes} archived job(s)`)
  }
}

// runAnalysis marks a job 'analyzing' before the Anthropic call, so a crash or restart mid-run
// leaves the row in a state no query ever selects again. Nothing else writes 'analyzing', and no
// run can be in flight at boot, so every such row is by definition stranded.
export function reclaimStrandedAnalyzing(): void {
  const result = sqlite.prepare(`UPDATE jobs SET analysis_status = 'pending' WHERE analysis_status = 'analyzing'`).run()
  if (result.changes > 0) {
    console.log(`[db] Reclaim: reset ${result.changes} job(s) stranded at 'analyzing' to 'pending'`)
  }
}

export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(import.meta.dir, 'migrations') })
  repairSchema()
  repairWebhookRunsSchema()
  repairCoverLettersSchema()
  backfillDateArchived()
  reclaimStrandedAnalyzing()
  console.log('[db] Migrations complete')
}

// Run directly via: bun run src/db/migrate.ts (or `bun run db:migrate`)
if (import.meta.main) {
  runMigrations()
}
