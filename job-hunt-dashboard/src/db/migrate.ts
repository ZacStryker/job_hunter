import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { db } from './client'

export function runMigrations(): void {
  migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('[db] Migrations complete')
}

// Run directly via: bun run src/db/migrate.ts (or `bun run db:migrate`)
if (import.meta.main) {
  runMigrations()
}
