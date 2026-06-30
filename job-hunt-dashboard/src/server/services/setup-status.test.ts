process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { computeSetupStatus } = await import('./setup-status')
const { setupHealth } = await import('./setup-health')
const { db: prodDb } = await import('../../db/client')
const sqlite = (prodDb as unknown as { $client: Database }).$client

const DDL = [
  `CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )`,
  `CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    profile_data TEXT,
    UNIQUE(user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS inbox_folder_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder_path TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gmail_label_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    job_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS setup_dismissals (
    user_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, task_id)
  )`,
]

const COMPLETE_PROFILE = JSON.stringify({
  personal: { fullName: 'Jane', email: 'j@x.com', phone: '123', location: 'NYC', summary: 'hi', skills: 'ts' },
  experience: {},
})

const PARTIAL_PROFILE = JSON.stringify({
  personal: { fullName: 'Jane', email: 'j@x.com', phone: null, location: null, summary: null, skills: null },
  experience: {},
})

function addSecret(userId: number, keyName: string) {
  sqlite.run(
    'INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (?, ?, ?, ?)',
    [userId, keyName, 'CIPHER', '2026-01-01T00:00:00.000Z'],
  )
}

function setProfile(userId: number, json: string) {
  sqlite.run('INSERT INTO profile (user_id, profile_data) VALUES (?, ?)', [userId, json])
}

beforeAll(() => {
  for (const stmt of DDL) sqlite.run(stmt)
})

beforeEach(() => {
  sqlite.run('DELETE FROM user_secrets')
  sqlite.run('DELETE FROM profile')
  sqlite.run('DELETE FROM inbox_folder_mappings')
  sqlite.run('DELETE FROM gmail_label_mappings')
  sqlite.run('DELETE FROM setup_dismissals')
  for (const id of ['apiKey', 'inboxConnect', 'inboxMapping', 'linkedin'] as const) {
    setupHealth.clear(1, id)
    setupHealth.clear(2, id)
  }
})

describe('computeSetupStatus', () => {
  test('all empty ⇒ every task notStarted and ready false', () => {
    const status = computeSetupStatus(1)
    expect(status.tasks.every((t) => t.state === 'notStarted')).toBe(true)
    expect(status.ready).toBe(false)
  })

  test('tasks returned in fixed order', () => {
    const status = computeSetupStatus(1)
    expect(status.tasks.map((t) => t.id)).toEqual(['linkedin', 'apiKey', 'profile', 'inboxConnect', 'inboxMapping'])
  })

  test('tier assignments and dependency', () => {
    const status = computeSetupStatus(1)
    const byId = Object.fromEntries(status.tasks.map((t) => [t.id, t]))
    expect(byId.linkedin.tier).toBe('required')
    expect(byId.apiKey.tier).toBe('required')
    expect(byId.profile.tier).toBe('required')
    expect(byId.inboxConnect.tier).toBe('optional')
    expect(byId.inboxMapping.tier).toBe('optional')
    expect(byId.inboxMapping.dependsOn).toBe('inboxConnect')
    expect(byId.linkedin.dependsOn).toBeNull()
    expect(byId.apiKey.dependsOn).toBeNull()
    expect(byId.profile.dependsOn).toBeNull()
    expect(byId.inboxConnect.dependsOn).toBeNull()
  })

  test('linkedin and apiKey derived from secrets', () => {
    addSecret(1, 'linkedin_storage_state')
    addSecret(1, 'anthropic_api_key')
    const byId = Object.fromEntries(computeSetupStatus(1).tasks.map((t) => [t.id, t]))
    expect(byId.linkedin.state).toBe('complete')
    expect(byId.apiKey.state).toBe('complete')
  })

  test('profile partial returns progress { filled, total: 6 }', () => {
    setProfile(1, PARTIAL_PROFILE)
    const profile = computeSetupStatus(1).tasks.find((t) => t.id === 'profile')!
    expect(profile.state).toBe('partial')
    expect(profile.progress).toEqual({ filled: 2, total: 6 })
  })

  test('profile complete when all 6 present', () => {
    setProfile(1, COMPLETE_PROFILE)
    const profile = computeSetupStatus(1).tasks.find((t) => t.id === 'profile')!
    expect(profile.state).toBe('complete')
    expect(profile.progress).toEqual({ filled: 6, total: 6 })
  })

  test('only profile carries progress', () => {
    const status = computeSetupStatus(1)
    for (const t of status.tasks) {
      if (t.id === 'profile') expect(t.progress).not.toBeNull()
      else expect(t.progress).toBeNull()
    }
  })

  test('inboxConnect complete via IMAP creds', () => {
    addSecret(1, 'imap_host')
    addSecret(1, 'imap_user')
    addSecret(1, 'imap_pass')
    const t = computeSetupStatus(1).tasks.find((t) => t.id === 'inboxConnect')!
    expect(t.state).toBe('complete')
  })

  test('inboxConnect complete via Gmail refresh token', () => {
    addSecret(1, 'gmail_refresh_token')
    const t = computeSetupStatus(1).tasks.find((t) => t.id === 'inboxConnect')!
    expect(t.state).toBe('complete')
  })

  test('inboxMapping complete via folder mapping or label mapping', () => {
    sqlite.run("INSERT INTO inbox_folder_mappings (user_id, folder_path, job_status, created_at) VALUES (1, 'INBOX', 'Submitted', '2026-01-01T00:00:00.000Z')")
    expect(computeSetupStatus(1).tasks.find((t) => t.id === 'inboxMapping')!.state).toBe('complete')
    sqlite.run('DELETE FROM inbox_folder_mappings')
    sqlite.run("INSERT INTO gmail_label_mappings (user_id, label, job_status, created_at) VALUES (1, 'Jobs', 'Submitted', '2026-01-01T00:00:00.000Z')")
    expect(computeSetupStatus(1).tasks.find((t) => t.id === 'inboxMapping')!.state).toBe('complete')
  })

  test('ready false when required complete but optionals not done', () => {
    addSecret(1, 'linkedin_storage_state')
    addSecret(1, 'anthropic_api_key')
    setProfile(1, COMPLETE_PROFILE)
    expect(computeSetupStatus(1).ready).toBe(false)
  })

  test('ready true when required complete and optionals dismissed', () => {
    addSecret(1, 'linkedin_storage_state')
    addSecret(1, 'anthropic_api_key')
    setProfile(1, COMPLETE_PROFILE)
    sqlite.run("INSERT INTO setup_dismissals (user_id, task_id, dismissed_at) VALUES (1, 'inboxConnect', '2026-01-01T00:00:00.000Z')")
    sqlite.run("INSERT INTO setup_dismissals (user_id, task_id, dismissed_at) VALUES (1, 'inboxMapping', '2026-01-01T00:00:00.000Z')")
    const status = computeSetupStatus(1)
    expect(status.tasks.find((t) => t.id === 'inboxConnect')!.dismissed).toBe(true)
    expect(status.ready).toBe(true)
  })

  test('dismissal flag is ignored for required tasks', () => {
    sqlite.run("INSERT INTO setup_dismissals (user_id, task_id, dismissed_at) VALUES (1, 'linkedin', '2026-01-01T00:00:00.000Z')")
    expect(computeSetupStatus(1).tasks.find((t) => t.id === 'linkedin')!.dismissed).toBe(false)
  })

  test('per-user isolation — another user\'s signals do not leak', () => {
    addSecret(2, 'linkedin_storage_state')
    setProfile(2, COMPLETE_PROFILE)
    const status = computeSetupStatus(1)
    expect(status.tasks.find((t) => t.id === 'linkedin')!.state).toBe('notStarted')
    expect(status.tasks.find((t) => t.id === 'profile')!.state).toBe('notStarted')
  })
})

describe('computeSetupStatus health-cache override', () => {
  test('present credential + cached broken ⇒ task broken and ready false', () => {
    addSecret(1, 'linkedin_storage_state')
    addSecret(1, 'anthropic_api_key')
    setProfile(1, COMPLETE_PROFILE)
    sqlite.run("INSERT INTO setup_dismissals (user_id, task_id, dismissed_at) VALUES (1, 'inboxConnect', '2026-01-01T00:00:00.000Z')")
    sqlite.run("INSERT INTO setup_dismissals (user_id, task_id, dismissed_at) VALUES (1, 'inboxMapping', '2026-01-01T00:00:00.000Z')")
    // Without the cache this user would be ready:true
    expect(computeSetupStatus(1).ready).toBe(true)

    setupHealth.markBroken(1, 'apiKey')
    const status = computeSetupStatus(1)
    expect(status.tasks.find((t) => t.id === 'apiKey')!.state).toBe('broken')
    expect(status.ready).toBe(false)
  })

  test('absent credential + cached broken ⇒ unaffected (stays notStarted)', () => {
    setupHealth.markBroken(1, 'apiKey')
    const apiKey = computeSetupStatus(1).tasks.find((t) => t.id === 'apiKey')!
    expect(apiKey.state).toBe('notStarted')
  })

  test('cached healthy does not change a present credential (stays complete)', () => {
    addSecret(1, 'anthropic_api_key')
    setupHealth.markHealthy(1, 'apiKey')
    expect(computeSetupStatus(1).tasks.find((t) => t.id === 'apiKey')!.state).toBe('complete')
  })

  test('profile is never broken via the cache', () => {
    setProfile(1, COMPLETE_PROFILE)
    // profile is not a health-checked task; even a broken apiKey leaves profile complete
    setupHealth.markBroken(1, 'apiKey')
    expect(computeSetupStatus(1).tasks.find((t) => t.id === 'profile')!.state).toBe('complete')
  })

  test('cached broken for one user does not affect another', () => {
    addSecret(1, 'anthropic_api_key')
    addSecret(2, 'anthropic_api_key')
    setupHealth.markBroken(1, 'apiKey')
    expect(computeSetupStatus(1).tasks.find((t) => t.id === 'apiKey')!.state).toBe('broken')
    expect(computeSetupStatus(2).tasks.find((t) => t.id === 'apiKey')!.state).toBe('complete')
  })
})
