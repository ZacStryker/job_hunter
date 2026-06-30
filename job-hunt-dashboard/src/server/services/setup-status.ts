import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { userSecrets, profile, inboxFolderMappings, gmailLabelMappings, setupDismissals } from '../../db/schema'
import { profileDataSchema, SETUP_TASK_ORDER } from '../../shared/schemas'
import type { SetupStatus, SetupTask, SetupTaskId, SetupTaskState, SetupTaskTier } from '../../shared/schemas'
import { setupHealth } from './setup-health'

export const SETUP_TASK_TIER: Record<SetupTaskId, SetupTaskTier> = {
  linkedin: 'required',
  apiKey: 'required',
  profile: 'required',
  inboxConnect: 'optional',
  inboxMapping: 'optional',
}

const DEPENDS_ON: Record<SetupTaskId, SetupTaskId | null> = {
  linkedin: null,
  apiKey: null,
  profile: null,
  inboxConnect: null,
  inboxMapping: 'inboxConnect',
}

const PROFILE_TOTAL = 6

export function computeSetupStatus(userId: number): SetupStatus {
  const secretRows = db.select({ keyName: userSecrets.keyName })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .all()
  const keys = new Set(secretRows.map((r) => r.keyName))

  const hasLinkedinAuth = keys.has('linkedin_storage_state')
  const hasAnthropicKey = keys.has('anthropic_api_key')
  const hasImap = keys.has('imap_host') && keys.has('imap_user') && keys.has('imap_pass')
  const hasGmail = keys.has('gmail_refresh_token')
  const hasInboxConnect = hasImap || hasGmail

  const profileRow = db.select({ profileData: profile.profileData })
    .from(profile)
    .where(eq(profile.userId, userId))
    .get()
  let filled = 0
  if (profileRow?.profileData) {
    let json: unknown = null
    try { json = JSON.parse(profileRow.profileData) } catch { json = null }
    const parsed = profileDataSchema.safeParse(json)
    if (parsed.success) {
      const p = parsed.data.personal
      filled = [p.fullName, p.email, p.phone, p.location, p.summary, p.skills]
        .filter((v) => typeof v === 'string' && v.trim() !== '').length
    }
  }
  const profileState: SetupTaskState = filled === PROFILE_TOTAL ? 'complete' : filled === 0 ? 'notStarted' : 'partial'

  const folderMapping = db.select({ id: inboxFolderMappings.id })
    .from(inboxFolderMappings)
    .where(eq(inboxFolderMappings.userId, userId))
    .get()
  const labelMapping = db.select({ id: gmailLabelMappings.id })
    .from(gmailLabelMappings)
    .where(eq(gmailLabelMappings.userId, userId))
    .get()
  const hasInboxMapping = Boolean(folderMapping) || Boolean(labelMapping)

  const dismissedRows = db.select({ taskId: setupDismissals.taskId })
    .from(setupDismissals)
    .where(eq(setupDismissals.userId, userId))
    .all()
  const dismissedIds = new Set(dismissedRows.map((r) => r.taskId))

  const STATE: Record<SetupTaskId, SetupTaskState> = {
    linkedin: hasLinkedinAuth ? 'complete' : 'notStarted',
    apiKey: hasAnthropicKey ? 'complete' : 'notStarted',
    profile: profileState,
    inboxConnect: hasInboxConnect ? 'complete' : 'notStarted',
    inboxMapping: hasInboxMapping ? 'complete' : 'notStarted',
  }

  for (const id of SETUP_TASK_ORDER) {
    if (STATE[id] === 'complete' && setupHealth.getHealth(userId, id) === 'broken') {
      STATE[id] = 'broken'
    }
  }

  const tasks: SetupTask[] = SETUP_TASK_ORDER.map((id) => ({
    id,
    state: STATE[id],
    tier: SETUP_TASK_TIER[id],
    dependsOn: DEPENDS_ON[id],
    dismissed: SETUP_TASK_TIER[id] === 'optional' && dismissedIds.has(id),
    progress: id === 'profile' ? { filled, total: PROFILE_TOTAL } : null,
  }))

  const anyBroken = tasks.some((t) => t.state === 'broken' && !t.dismissed)
  const requiredComplete = tasks.filter((t) => t.tier === 'required').every((t) => t.state === 'complete')
  const optionalSatisfied = tasks.filter((t) => t.tier === 'optional').every((t) => t.state === 'complete' || t.dismissed)
  const ready = !anyBroken && requiredComplete && optionalSatisfied

  return { tasks, ready }
}
