import type { StatusEvent } from '@shared/schemas'

const STATUS_LABELS: Record<string, string> = {
  phone_screen: 'Phone Screen',
  interview: 'Interview',
  technical: 'Technical Round',
  offer: 'Offer Received',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  ghosted: 'Ghosted',
}

interface StatusTimelineProps {
  events: StatusEvent[]
}

export function StatusTimeline({ events }: StatusTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500">No status history yet.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Status History</p>
      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-2">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
            <div>
              <p className="text-sm text-zinc-200">
                {STATUS_LABELS[event.status] ?? event.status}
              </p>
              <p className="text-xs text-zinc-500">
                {new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(event.timestamp))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
