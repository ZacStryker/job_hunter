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
  ['analysis_status', 'TEXT'],
  ['resume_generated_at', 'TEXT'],
  ['date_analyzed', 'TEXT'],
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

export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(import.meta.dir, 'migrations') })
  repairSchema()
  console.log('[db] Migrations complete')
}

// Run directly via: bun run src/db/migrate.ts (or `bun run db:migrate`)
if (import.meta.main) {
  runMigrations()
}
