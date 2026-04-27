# Story 24.1: Crypto Module, Mailer Module & Auth DB Schema

Status: ready-for-dev

## Story

As a system,
I want foundational auth infrastructure — encryption utilities, an email sending module, and the DB tables for users/sessions/invite keys/user secrets —
so that all subsequent auth features have a stable foundation to build on.

## Acceptance Criteria

1. **Given** `ENCRYPTION_KEY` is set as a 32-byte hex string in `.env`  
   **When** `encrypt(plaintext)` is called from `src/server/lib/crypto.ts`  
   **Then** it returns a string formatted as `hex_iv:hex_ciphertext:hex_authTag` using AES-256-GCM with a random 12-byte IV

2. **Given** a previously encrypted value  
   **When** `decrypt(ciphertext)` is called  
   **Then** it returns the original plaintext exactly

3. **Given** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `APP_URL` are set in `.env`  
   **When** `sendMail({ to, subject, html })` is called from `src/server/lib/mailer.ts`  
   **Then** it sends the email via SMTP and resolves without error

4. **Given** `bun start` runs the migration runner  
   **When** `0019_auth_schema.sql` executes  
   **Then** `users`, `invite_keys`, `user_secrets`, and `sessions` tables exist with correct constraints; migration is idempotent

5. **Given** `ENCRYPTION_KEY` is missing from `.env`  
   **When** `bun start` runs  
   **Then** the app exits with `console.error` listing the missing key — no silent default

## Tasks / Subtasks

- [ ] Install new packages (AC: #3)
  - [ ] `bun add nodemailer && bun add -D @types/nodemailer`
- [ ] Create `src/server/lib/` directory and `crypto.ts` module (AC: #1, #2, #5)
  - [ ] Implement `encrypt(plaintext: string): string` using AES-256-GCM, random 12-byte IV
  - [ ] Implement `decrypt(ciphertext: string): string` parsing `hex_iv:hex_ciphertext:hex_authTag`
  - [ ] Read key from `process.env.ENCRYPTION_KEY` (no default — runtime will catch missing at startup check)
- [ ] Add `ENCRYPTION_KEY` to required env vars in `src/index.ts` (AC: #5)
  - [ ] Add to the `REQUIRED_ENV_VARS` array alongside `PORT` and `DB_PATH`
- [ ] Create `src/server/lib/mailer.ts` module (AC: #3)
  - [ ] Implement `sendMail({ to, subject, html }: MailOptions): Promise<void>` using `nodemailer`
  - [ ] Read SMTP config from env vars at call time (not cached at module load)
- [ ] Add new Drizzle table definitions to `src/db/schema.ts` (AC: #4)
  - [ ] Add `users` table
  - [ ] Add `invite_keys` table
  - [ ] Add `user_secrets` table with composite PK on `(user_id, key_name)`
  - [ ] Add `sessions` table with text PK (hex token, not autoincrement)
  - [ ] Add `primaryKey` to drizzle-orm/sqlite-core imports
- [ ] Generate migration (AC: #4)
  - [ ] Run `bun run db:generate` to produce `0019_auth_schema.sql`
  - [ ] Verify generated SQL matches expected table structure; commit the SQL file
- [ ] Update `.env.example` with new variables
  - [ ] Add `ENCRYPTION_KEY`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - [ ] Add inline comments documenting each
- [ ] Write `src/server/lib/crypto.test.ts` (AC: #1, #2)
  - [ ] Set `process.env.ENCRYPTION_KEY` BEFORE any imports
  - [ ] Test encrypt/decrypt roundtrip returns original plaintext
  - [ ] Test output format has 3 colon-separated parts
  - [ ] Test each call produces different ciphertext (random IV)
- [ ] Manually verify migration runs idempotently (AC: #4)
  - [ ] Run `bun start` twice against the same DB; confirm no error on second run

## Dev Notes

### New Files to Create

```
src/server/lib/          ← directory does not yet exist; create it
  crypto.ts
  mailer.ts
src/server/lib/crypto.test.ts
```

No other existing files in `src/server/lib/` — this is a greenfield directory.

### Crypto Module (`src/server/lib/crypto.ts`)

Use Node.js built-in `crypto` module — **no npm package needed**. Bun fully supports `node:crypto`.

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

export function encrypt(plaintext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const [ivHex, encryptedHex, authTagHex] = ciphertext.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
}
```

- Key must be exactly 32 bytes → 64 hex chars. Generate with: `openssl rand -hex 32`
- IV: 12 bytes → 24 hex chars in output
- Auth tag: 16 bytes → 32 hex chars in output
- `ENCRYPTION_KEY` validation is handled by the startup env check in `src/index.ts` — no guard needed inside this module

### Mailer Module (`src/server/lib/mailer.ts`)

Uses `nodemailer` (add via `bun add nodemailer && bun add -D @types/nodemailer`). Bun is Node.js-compatible; nodemailer works without modification.

```typescript
import nodemailer from 'nodemailer'

interface MailOptions {
  to: string
  subject: string
  html: string
}

export async function sendMail({ to, subject, html }: MailOptions): Promise<void> {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT!, 10),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  })
}
```

- Create transport inside the function (not at module load time) — avoids startup failures if SMTP env vars are absent during test runs
- `SMTP_*` vars are NOT in `REQUIRED_ENV_VARS` for startup (they're only validated at call time implicitly by the SMTP connection failing)
- `APP_URL` is not used by the mailer itself — it's used by route handlers when constructing activation/reset email links. Do not add it to this module.
- Testing: SMTP send is integration-only. No unit test for `sendMail` — manual verification with real SMTP credentials is sufficient. The crypto module covers the testable infrastructure.

### Schema Additions (`src/db/schema.ts`)

Add `primaryKey` to the existing drizzle-orm/sqlite-core import. Add these four tables **after** the existing tables (do not modify any existing table definitions):

```typescript
import { integer, real, text, sqliteTable, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'

// ... existing tables unchanged ...

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('standard'), // 'standard' | 'admin'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  activationToken: text('activation_token'),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: text('reset_token_expires_at'),
  createdAt: text('created_at').notNull(),
})

export const inviteKeys = sqliteTable('invite_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  usedByUserId: integer('used_by_user_id').references(() => users.id),
  usedAt: text('used_at'),
})

export const userSecrets = sqliteTable('user_secrets', {
  userId: integer('user_id').notNull().references(() => users.id),
  keyName: text('key_name').notNull(),
  ciphertext: text('ciphertext').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.keyName] }),
])

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),         // 32-byte hex string; NOT autoincrement
  userId: integer('user_id').notNull().references(() => users.id),
  data: text('data'),                  // JSON blob; null is valid
  expiresAt: text('expires_at').notNull(),
})
```

**Critical**: `sessions.id` is a `text` PK (not integer autoincrement). Session IDs are generated as `randomBytes(32).toString('hex')` by the auth route handlers in story 24.2 — this story only defines the table.

### Migration Generation

After updating `schema.ts`, run:
```bash
bun run db:generate
```

This produces `src/db/migrations/0019_auth_schema.sql`. The current highest migration is `0018_discovery_source_breakdown.sql`. The generated file will be named by drizzle-kit automatically (with a slug) — rename it to `0019_auth_schema.sql` to match the naming convention of all prior migrations, then commit it.

Verify the SQL includes:
- `CREATE TABLE \`users\`` with all 9 columns
- `CREATE TABLE \`invite_keys\`` with FK reference
- `CREATE TABLE \`user_secrets\`` with composite PK
- `CREATE TABLE \`sessions\`` with text PK (no AUTOINCREMENT)
- `CREATE UNIQUE INDEX` on `users.email` and `invite_keys.key`

Drizzle migrations use `IF NOT EXISTS` semantics — idempotency is automatic.

### Env Var Changes

**`src/index.ts` — add to `REQUIRED_ENV_VARS`:**
```typescript
const REQUIRED_ENV_VARS = [
  'PORT',
  'DB_PATH',
  'ENCRYPTION_KEY',
] as const
```

**`.env.example` — append:**
```
# Auth & Encryption (Epic 24)
ENCRYPTION_KEY=         # 32-byte hex: openssl rand -hex 32
APP_URL=http://localhost:3000  # Used in email links (activation, password reset)

# SMTP Mailer (Epic 24)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=             # e.g., "Job Hunt <noreply@example.com>"
```

### Test File (`src/server/lib/crypto.test.ts`)

```typescript
// Set env BEFORE any imports — project convention for test isolation
process.env.ENCRYPTION_KEY = '0'.repeat(64) // 32 zero-bytes; valid AES-256 key for testing

import { describe, test, expect } from 'bun:test'
import { encrypt, decrypt } from './crypto'

describe('crypto', () => {
  test('roundtrip: decrypt(encrypt(x)) === x', () => {
    const plaintext = 'super-secret-api-key-123'
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  test('output format is iv:ciphertext:authTag (3 hex segments)', () => {
    const parts = encrypt('hello').split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toHaveLength(24)  // 12-byte IV = 24 hex chars
    expect(parts[2]).toHaveLength(32)  // 16-byte GCM auth tag = 32 hex chars
  })

  test('random IV: same plaintext produces different ciphertexts', () => {
    const ct1 = encrypt('same-value')
    const ct2 = encrypt('same-value')
    expect(ct1).not.toBe(ct2)
    // But both decrypt to the same value
    expect(decrypt(ct1)).toBe('same-value')
    expect(decrypt(ct2)).toBe('same-value')
  })
})
```

### Project Structure Notes

- `src/server/lib/` is a **new directory** — it does not exist yet. All prior server-side utilities are in `src/server/services/` or `src/server/middleware/`. The `lib/` directory follows the architecture spec for non-route, non-service modules.
- Do NOT put `crypto.ts` or `mailer.ts` in `services/` or `utils/` — they are infrastructure libraries, not services.
- Naming: `crypto.ts` and `mailer.ts` (kebab-case `.ts`) following the project convention for server/utility files.
- `passwordHash`, `isActive`, `activationToken` etc. — Drizzle's `casing: 'camelCase'` config means the column `password_hash` maps to `passwordHash` automatically in query results. No `.as()` aliases needed.

### Critical Do-Not-Miss Items

- **Do not add argon2 in this story** — password hashing is story 24.2. This story creates the `password_hash` column but does not hash anything.
- **Do not add `SESSION_SECRET` to required env vars** — that's for cookie signing in story 24.2.
- **Do not add auth middleware** — that's story 24.3.
- **Do not add `ADMIN_EMAIL`/`ADMIN_PASSWORD` to required vars** — those are first-deploy-only for story 24.3's bootstrap migration.
- **User isolation** (`user_id` FK on `jobs`, `search_configs`, etc.) is story 24.3, not this story. Do NOT add `userId` columns to existing tables here.
- **`data/` directory is gitignored** — never commit SQLite DB files. Only commit the migration SQL file.
- The `src/shared/schemas.ts` does NOT need changes in this story — no new API responses are defined yet. `users`, `sessions`, etc. are server-side only at this stage.

### References

- Epic 24.1 ACs: [Source: _bmad-output/planning-artifacts/epics/epic-24-authentication-and-multi-user-data-foundation.md#story-241]
- Architecture — Encryption at Rest: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#encryption-at-rest]
- Architecture — Authentication & Session: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#authentication--session]
- Architecture — Multi-Tenancy & Per-User Data Isolation: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#multi-tenancy--per-user-data-isolation]
- Project Context — Required env vars: [Source: _bmad-output/project-context.md#development-workflow-rules]
- Project Context — Testing rules: [Source: _bmad-output/project-context.md#testing-rules]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
