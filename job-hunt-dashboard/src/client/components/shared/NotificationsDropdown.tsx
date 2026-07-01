import { useState, useRef, useEffect } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import {
  Bell,
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  Loader2,
  Briefcase,
  KeyRound,
  User,
  Inbox,
  FolderTree,
  type LucideIcon,
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import { useDismissSetupTaskMutation } from '@/hooks/useDismissSetupTaskMutation'
import { useWebhookStream, type WebhookStreamState } from '@/hooks/useWebhookStream'
import { cn } from '@/lib/utils'
import type { SetupTask, SetupTaskId } from '@shared/schemas'

type ToPath = LinkProps['to']

export const ROW_META: Record<SetupTaskId, { label: string; verb: string; to: ToPath }> = {
  linkedin: { label: 'LinkedIn', verb: 'Connect', to: '/config/connections/linkedin' },
  apiKey: { label: 'API key', verb: 'Add', to: '/config/connections/api-key' },
  profile: { label: 'Profile', verb: 'Complete', to: '/config/profile' },
  inboxConnect: { label: 'Inbox', verb: 'Connect', to: '/config/connections/inbox' },
  inboxMapping: { label: 'Inbox mapping', verb: 'Map', to: '/config/connections/inbox' },
}

const ROW_ICON: Record<SetupTaskId, LucideIcon> = {
  linkedin: Briefcase,
  apiKey: KeyRound,
  profile: User,
  inboxConnect: Inbox,
  inboxMapping: FolderTree,
}

export function rowMeta(id: SetupTaskId): { label: string; verb: string; to: ToPath } {
  return ROW_META[id]
}

export function rowVerb(task: SetupTask): string {
  return task.state === 'broken' ? 'Reconnect' : ROW_META[task.id].verb
}

export function isLocked(task: SetupTask, tasks: SetupTask[]): boolean {
  if (!task.dependsOn) return false
  const dep = tasks.find((t) => t.id === task.dependsOn)
  return !!dep && dep.state !== 'complete'
}

export function progressMeter(tasks: SetupTask[]): { show: boolean; done: number; total: number } {
  const total = tasks.filter((t) => t.tier === 'required').length
  const done = tasks.filter((t) => t.tier === 'required' && t.state === 'complete').length
  const hasBroken = tasks.some((t) => t.state === 'broken' && !t.dismissed)
  return { show: !hasBroken && done < total, done, total }
}

function BadgeDot({ badge, justReady }: { badge: 'none' | 'dot' | 'alert'; justReady: boolean }) {
  if (justReady) {
    return (
      <span aria-hidden className="pointer-events-none absolute -right-1.5 -top-1.5 text-green-500">
        <Check className="h-3 w-3" />
      </span>
    )
  }
  if (badge === 'none') return null
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full',
        badge === 'alert' ? 'bg-amber-500' : 'bg-zinc-500',
      )}
    />
  )
}

function ProgressMeter({ done, total }: { done: number; total: number }) {
  return (
    <div className="mb-2 border-b border-zinc-800 pb-2">
      <div className="mb-1 text-xs text-zinc-400">Setup {done}/{total} required</div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-zinc-200" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </div>
  )
}

function TaskRow({
  task,
  tasks,
  onNavigate,
  dismiss,
}: {
  task: SetupTask
  tasks: SetupTask[]
  onNavigate: () => void
  dismiss: ReturnType<typeof useDismissSetupTaskMutation>
}) {
  const meta = ROW_META[task.id]
  const Icon = ROW_ICON[task.id]

  if (isLocked(task, tasks)) {
    return (
      <div
        title="Connect your inbox first"
        className="flex cursor-not-allowed items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-600"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{meta.label}</span>
      </div>
    )
  }

  const broken = task.state === 'broken'

  return (
    <Link
      to={meta.to}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
        broken ? 'text-amber-400 hover:bg-amber-950/30' : 'text-zinc-200 hover:bg-zinc-800',
      )}
    >
      {broken ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{meta.label}</span>
      <span className={cn('inline-flex items-center gap-0.5 text-xs', broken ? 'text-amber-400' : 'text-zinc-400')}>
        {rowVerb(task)}
        <ArrowRight className="h-3 w-3" />
      </span>
      {task.tier === 'optional' && (
        <button
          type="button"
          aria-label={`Dismiss ${meta.label}`}
          title="Dismiss"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dismiss.mutate(task.id)
          }}
          className="shrink-0 text-zinc-500 hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </Link>
  )
}

function ReadyLaunchpad({ discovery }: { discovery: WebhookStreamState }) {
  if (discovery.isPending) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
        Starting…
      </div>
    )
  }

  if (discovery.isSuccess) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300">
        <Check className="h-4 w-4 shrink-0 text-green-500" />
        All set
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => discovery.trigger()}
        className="flex w-full items-center justify-center gap-1 rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
      >
        Start hunting
        <ArrowRight className="h-4 w-4" />
      </button>
      {discovery.isError && (
        <span className="px-2 text-xs text-amber-400">{discovery.error ?? 'Discovery failed'}</span>
      )}
    </div>
  )
}

export function NotificationsDropdown() {
  const { tasks, ready, badge } = useSetupStatus()
  const [open, setOpen] = useState(false)
  const dismiss = useDismissSetupTaskMutation()
  const discovery = useWebhookStream('/api/webhooks/discovery')

  const prevBadge = useRef(badge)
  const [justReady, setJustReady] = useState(false)
  useEffect(() => {
    const wasNonNone = prevBadge.current !== 'none'
    prevBadge.current = badge
    if (wasNonNone && badge === 'none') {
      setJustReady(true)
      const timer = setTimeout(() => setJustReady(false), 2000)
      return () => clearTimeout(timer)
    }
    if (badge !== 'none') setJustReady(false)
  }, [badge])

  const incomplete = tasks.filter((t) => t.state !== 'complete' && !t.dismissed)
  const meter = progressMeter(tasks)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <span className="relative inline-flex items-center justify-center">
            <Bell className="h-5 w-5" />
            <BadgeDot badge={badge} justReady={justReady} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        {meter.show && <ProgressMeter done={meter.done} total={meter.total} />}
        {ready ? (
          <ReadyLaunchpad discovery={discovery} />
        ) : (
          <ul className="flex flex-col gap-1">
            {incomplete.map((task) => (
              <li key={task.id}>
                <TaskRow task={task} tasks={tasks} onNavigate={() => setOpen(false)} dismiss={dismiss} />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
