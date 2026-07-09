import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

export const sqlite = new Database(process.env.DB_PATH ?? './data/jobs.db')

// busy_timeout first: switching journal mode requires no other open connection, so it is
// the one statement that most needs the bounded wait rather than an immediate SQLITE_BUSY.
// WAL then lets readers proceed against the single writer. Both are no-ops on ':memory:'.
sqlite.exec('PRAGMA busy_timeout = 5000')
sqlite.exec('PRAGMA journal_mode = WAL')

export const db = drizzle(sqlite, { schema })
