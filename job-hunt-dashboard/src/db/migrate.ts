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

export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(import.meta.dir, 'migrations') })
  repairSchema()
  repairWebhookRunsSchema()
  console.log('[db] Migrations complete')
}

// Run directly via: bun run src/db/migrate.ts (or `bun run db:migrate`)
if (import.meta.main) {
  runMigrations()
}
