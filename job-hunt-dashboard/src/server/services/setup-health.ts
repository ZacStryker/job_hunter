import { eq } from 'drizzle-orm'
import { ImapFlow } from 'imapflow'
import { db } from '../../db/client'
import { userSecrets, inboxFolderMappings, gmailLabelMappings } from '../../db/schema'
import { decrypt } from '../lib/crypto'
import { getAccessToken } from '../lib/gmail-oauth'
import { activityRegistry } from './activity-registry'
import { computeSetupStatus } from './setup-status'
import type { SetupStatus, SetupTaskId } from '../../shared/schemas'

export type ProbeResult = 'healthy' | 'broken' | 'inconclusive'
type HealthState = 'healthy' | 'broken'
type HealthTaskId = Extract<SetupTaskId, 'apiKey' | 'inboxConnect' | 'inboxMapping' | 'linkedin'>

export const HEALTH_INTERVAL_MS = 5 * 60_000

interface ImapCreds { host: string; port: number; user: string; pass: string }

export interface HealthProbes {
  probeAnthropic(apiKey: string): Promise<ProbeResult>
  probeImap(creds: ImapCreds): Promise<ProbeResult>
  probeGmailToken(refreshToken: string): Promise<ProbeResult>
  probeInboxMapping(userId: number, creds: { gmailRefreshToken?: string; imapCreds?: ImapCreds }): Promise<ProbeResult>
}

export async function probeAnthropic(apiKey: string): Promise<ProbeResult> {
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return 'inconclusive'
  }
  if (res.status === 401) return 'broken'
  if (res.ok) return 'healthy'
  return 'inconclusive'
}

export async function probeImap(creds: ImapCreds): Promise<ProbeResult> {
  const client = new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  })

  let connected = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('IMAP timeout'), { name: 'TimeoutError' })), 10000)
  })

  try {
    await Promise.race([client.connect(), timeoutPromise])
    connected = true
    await client.logout()
    return 'healthy'
  } catch (err) {
    if (connected) return 'healthy'
    const e = err as Error
    if (e.name === 'TimeoutError') return 'inconclusive'
    const msg = e.message?.toLowerCase() ?? ''
    if (msg.includes('auth') || msg.includes('authentication') || msg.includes('login') || msg.includes('credentials')) {
      return 'broken'
    }
    return 'inconclusive'
  } finally {
    if (timer) clearTimeout(timer)
    // Tear down the socket even when the timeout won the race: the pending
    // connect() may still resolve later and would otherwise leak its connection.
    client.close()
  }
}

export async function probeGmailToken(refreshToken: string): Promise<ProbeResult> {
  try {
    await getAccessToken(refreshToken)
    return 'healthy'
  } catch (err) {
    const msg = (err as Error).message?.toLowerCase() ?? ''
    if (msg.includes('invalid_grant')) return 'broken'
    return 'inconclusive'
  }
}

export async function probeInboxMapping(
  userId: number,
  creds: { gmailRefreshToken?: string; imapCreds?: ImapCreds },
): Promise<ProbeResult> {
  let verified = false

  const labelRows = db.select({ label: gmailLabelMappings.label })
    .from(gmailLabelMappings)
    .where(eq(gmailLabelMappings.userId, userId))
    .all()

  if (labelRows.length > 0 && creds.gmailRefreshToken) {
    try {
      const accessToken = await getAccessToken(creds.gmailRefreshToken)
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return 'inconclusive'
      const { labels } = await res.json() as { labels?: Array<{ id: string; name: string }> }
      const live = new Set((labels ?? []).map((l) => l.name))
      for (const row of labelRows) {
        if (!live.has(row.label)) return 'broken'
      }
      verified = true
    } catch {
      return 'inconclusive'
    }
  }

  const folderRows = db.select({ folderPath: inboxFolderMappings.folderPath })
    .from(inboxFolderMappings)
    .where(eq(inboxFolderMappings.userId, userId))
    .all()

  if (folderRows.length > 0 && creds.imapCreds) {
    const client = new ImapFlow({
      host: creds.imapCreds.host,
      port: creds.imapCreds.port,
      secure: true,
      auth: { user: creds.imapCreds.user, pass: creds.imapCreds.pass },
      logger: false,
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('IMAP timeout'), { name: 'TimeoutError' })), 10000)
    })
    try {
      await Promise.race([client.connect(), timeoutPromise])
    } catch {
      client.close()
      return 'inconclusive'
    } finally {
      if (timer) clearTimeout(timer)
    }
    try {
      for (const row of folderRows) {
        let lock
        try {
          lock = await client.getMailboxLock(row.folderPath)
        } catch {
          // A lock failure means "broken" only if the connection is still alive
          // (the folder is genuinely missing). A dropped connection mid-loop is a
          // transient failure ⇒ inconclusive, never a false flap (AC6).
          if (!client.usable) return 'inconclusive'
          return 'broken'
        }
        await lock.release()
      }
      verified = true
    } finally {
      await client.logout().catch(() => {})
      client.close()
    }
  }

  // Reached only when no applicable target was actually verified (e.g. mapping
  // rows exist but the matching credential is absent) — report inconclusive
  // rather than a false healthy.
  return verified ? 'healthy' : 'inconclusive'
}

const defaultProbes: HealthProbes = { probeAnthropic, probeImap, probeGmailToken, probeInboxMapping }

export interface SetupHealthDeps {
  probes?: HealthProbes
  computeStatus?: (userId: number) => SetupStatus
  emit?: (userId: number, status: SetupStatus) => void
}

export function createSetupHealth(deps: SetupHealthDeps = {}) {
  const probes = deps.probes ?? defaultProbes
  const computeStatus = deps.computeStatus ?? computeSetupStatus
  const emit = deps.emit ?? ((userId, status) => activityRegistry.emitSetupStatus(userId, status))

  const cache = new Map<number, Map<HealthTaskId, { state: HealthState; checkedAt: string }>>()
  const refcounts = new Map<number, number>()
  const timers = new Map<number, ReturnType<typeof setInterval>>()

  function getHealth(userId: number, taskId: SetupTaskId): HealthState | null {
    return cache.get(userId)?.get(taskId as HealthTaskId)?.state ?? null
  }

  function setState(userId: number, taskId: HealthTaskId, state: HealthState): void {
    let userCache = cache.get(userId)
    if (!userCache) {
      userCache = new Map()
      cache.set(userId, userCache)
    }
    const prev = userCache.get(taskId)
    userCache.set(taskId, { state, checkedAt: new Date().toISOString() })
    if (!prev || prev.state !== state) {
      // Order matters: cache is written above before the snapshot is computed,
      // so computeSetupStatus reflects this transition.
      try {
        emit(userId, computeStatus(userId))
      } catch (err) {
        console.error('setup-health: failed to emit setup-status transition', err)
      }
    }
  }

  function markBroken(userId: number, taskId: HealthTaskId): void {
    setState(userId, taskId, 'broken')
  }

  function markHealthy(userId: number, taskId: HealthTaskId): void {
    setState(userId, taskId, 'healthy')
  }

  function clear(userId: number, taskId: HealthTaskId): void {
    cache.get(userId)?.delete(taskId)
  }

  function apply(userId: number, taskId: HealthTaskId, result: ProbeResult): void {
    if (result === 'broken') markBroken(userId, taskId)
    else if (result === 'healthy') markHealthy(userId, taskId)
    // 'inconclusive' leaves the prior state untouched (no-flap, AC6)
  }

  async function checkUserHealth(userId: number): Promise<void> {
    const rows = db.select({ keyName: userSecrets.keyName, ciphertext: userSecrets.ciphertext })
      .from(userSecrets)
      .where(eq(userSecrets.userId, userId))
      .all()
    const byKey = new Map(rows.map((r) => [r.keyName, r.ciphertext]))
    const has = (k: string): boolean => byKey.has(k)
    const dec = (k: string): string | null => {
      const c = byKey.get(k)
      if (c === undefined) return null
      try { return decrypt(c) } catch { return null }
    }

    if (has('anthropic_api_key')) {
      try {
        const key = dec('anthropic_api_key')
        apply(userId, 'apiKey', key ? await probes.probeAnthropic(key) : 'inconclusive')
      } catch (err) {
        console.error('setup-health: apiKey probe threw', err)
      }
    } else {
      clear(userId, 'apiKey')
    }

    const hasImap = has('imap_host') && has('imap_user') && has('imap_pass')
    const hasGmail = has('gmail_refresh_token')
    const imapCreds = hasImap
      ? ((): ImapCreds | null => {
          const host = dec('imap_host'); const user = dec('imap_user'); const pass = dec('imap_pass')
          if (host === null || user === null || pass === null) return null
          return { host, port: Number(dec('imap_port')) || 993, user, pass }
        })()
      : null
    const gmailRefreshToken = hasGmail ? dec('gmail_refresh_token') : null

    if (hasImap || hasGmail) {
      try {
        let result: ProbeResult = 'inconclusive'
        if (imapCreds) result = await probes.probeImap(imapCreds)
        else if (gmailRefreshToken) result = await probes.probeGmailToken(gmailRefreshToken)
        apply(userId, 'inboxConnect', result)
      } catch (err) {
        console.error('setup-health: inboxConnect probe threw', err)
      }
    } else {
      clear(userId, 'inboxConnect')
    }

    const hasFolderMapping = db.select({ id: inboxFolderMappings.id })
      .from(inboxFolderMappings).where(eq(inboxFolderMappings.userId, userId)).get()
    const hasLabelMapping = db.select({ id: gmailLabelMappings.id })
      .from(gmailLabelMappings).where(eq(gmailLabelMappings.userId, userId)).get()

    if (hasFolderMapping || hasLabelMapping) {
      try {
        apply(userId, 'inboxMapping', await probes.probeInboxMapping(userId, {
          gmailRefreshToken: gmailRefreshToken ?? undefined,
          imapCreds: imapCreds ?? undefined,
        }))
      } catch (err) {
        console.error('setup-health: inboxMapping probe threw', err)
      }
    } else {
      clear(userId, 'inboxMapping')
    }
  }

  function startForUser(userId: number): void {
    const next = (refcounts.get(userId) ?? 0) + 1
    refcounts.set(userId, next)
    if (next === 1) {
      const run = (): void => {
        checkUserHealth(userId).catch((err) => console.error('setup-health: checkUserHealth threw', err))
      }
      run()
      timers.set(userId, setInterval(run, HEALTH_INTERVAL_MS))
    }
  }

  function stopForUser(userId: number): void {
    const next = (refcounts.get(userId) ?? 0) - 1
    if (next <= 0) {
      refcounts.delete(userId)
      const timer = timers.get(userId)
      if (timer) {
        clearInterval(timer)
        timers.delete(userId)
      }
    } else {
      refcounts.set(userId, next)
    }
  }

  return {
    getHealth, markBroken, markHealthy, clear, checkUserHealth, startForUser, stopForUser,
  }
}

export const setupHealth = createSetupHealth()
