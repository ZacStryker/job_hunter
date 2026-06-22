import { Mail } from 'lucide-react'
import type { StatusEvent } from '@shared/schemas'

function extractSenderName(fromAddress: string): string {
  const match = fromAddress.match(/^(.+?)\s*<[^>]+>$/)
  return match ? match[1].trim() : fromAddress
}

const STATUS_LABELS: Record<string, string> = {
  // Manual override values
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  other: 'Other',
  // Message types
  Submitted: 'Submitted',
  Rejected: 'Rejected',
  Screening: 'Screening',
  Interview: 'Interview',
  Offer: 'Offer',
  Other: 'Other',
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
              <p className="text-sm text-zinc-200 flex items-center gap-1.5">
                {new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(event.timestamp))}
                {' — '}
                {STATUS_LABELS[event.status] ?? event.status}
                {event.source === 'email' && (
                  <Mail size={12} className="text-zinc-500 shrink-0" />
                )}
              </p>
              {(event.emailSender || event.emailSubject) && (
                <p className="text-xs text-zinc-500">
                  {event.emailSender && extractSenderName(event.emailSender)}
                  {event.emailSender && event.emailSubject && ' — '}
                  {event.emailSubject}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
