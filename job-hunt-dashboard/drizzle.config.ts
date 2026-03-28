import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  casing: 'camelCase',
  dbCredentials: { url: process.env.DB_PATH ?? './data/jobs.db' },
})
