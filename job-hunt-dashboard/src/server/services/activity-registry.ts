import type { ActivityRun, ActivityRunType, ActivityRunState, ActivityProgress } from '../../shared/schemas'

export type ActivityListener = (runs: ActivityRun[]) => void
export const RETENTION_MS = 5_000

export function createActivityRegistry() {
  const runsByUser = new Map<number, Map<string, ActivityRun>>()
  const ownerById = new Map<string, number>()
  const listenersByUser = new Map<number, Set<ActivityListener>>()

  function snapshot(userId: number): ActivityRun[] {
    return [...(runsByUser.get(userId)?.values() ?? [])]
  }

  function emit(userId: number): void {
    const listeners = listenersByUser.get(userId)
    if (!listeners) return
    const runs = snapshot(userId)
    for (const listener of [...listeners]) {
      try {
        listener(runs)
      } catch (err) {
        console.error('activity-registry listener threw', err)
      }
    }
  }

  function register({ userId, type, progress }: { userId: number; type: ActivityRunType; progress: ActivityProgress }): string {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const run: ActivityRun = { id, type, state: 'running', startedAt: now, updatedAt: now, progress }
    let userRuns = runsByUser.get(userId)
    if (!userRuns) {
      userRuns = new Map()
      runsByUser.set(userId, userRuns)
    }
    userRuns.set(id, run)
    ownerById.set(id, userId)
    emit(userId)
    return id
  }

  function progress(id: string, payload: ActivityProgress): void {
    const userId = ownerById.get(id)
    if (userId === undefined) return
    const run = runsByUser.get(userId)?.get(id)
    if (!run || run.state !== 'running') return
    run.progress = payload
    run.updatedAt = new Date().toISOString()
    emit(userId)
  }

  function finalize(id: string, state: Extract<ActivityRunState, 'done' | 'failed'>, retentionMs = RETENTION_MS): void {
    const userId = ownerById.get(id)
    if (userId === undefined) return
    const run = runsByUser.get(userId)?.get(id)
    if (!run || run.state !== 'running') return
    run.state = state
    run.updatedAt = new Date().toISOString()
    emit(userId)
    setTimeout(() => {
      runsByUser.get(userId)?.delete(id)
      ownerById.delete(id)
      emit(userId)
    }, retentionMs)
  }

  function subscribe(userId: number, listener: ActivityListener): void {
    let set = listenersByUser.get(userId)
    if (!set) {
      set = new Set()
      listenersByUser.set(userId, set)
    }
    set.add(listener)
  }

  function unsubscribe(userId: number, listener: ActivityListener): void {
    listenersByUser.get(userId)?.delete(listener)
  }

  return { register, progress, finalize, snapshot, subscribe, unsubscribe }
}

export const activityRegistry = createActivityRegistry()
