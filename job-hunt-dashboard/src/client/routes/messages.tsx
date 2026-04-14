import { Loader2 } from 'lucide-react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useMessagesQuery } from '../hooks/useMessagesQuery'
import { useMessagesSyncMutation } from '../hooks/useMessagesSyncMutation'
import { MessagesTable } from '../components/messages/MessagesTable'
import { Button } from '../components/ui/button'

export function MessagesRoute() {
  const { data: messages = [], isPending, isError, error } = useMessagesQuery()
  const { data: jobs = [] } = useJobsQuery()
  const syncMutation = useMessagesSyncMutation()

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
        >
          {syncMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing…
            </>
          ) : (
            'Sync Emails'
          )}
        </Button>
      </div>

      {syncMutation.isError && (
        <div className="text-sm text-red-400">{syncMutation.error.message}</div>
      )}

      {isPending && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center py-16">
          <p className="text-sm text-zinc-400">Loading…</p>
        </div>
      )}
      {isError && <div className="text-sm text-red-400">{error.message}</div>}
      {!isPending && !isError && messages.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center py-16">
          <p className="text-sm text-zinc-400">
            No messages. Click &ldquo;Sync Emails&rdquo; to load from inbox.
          </p>
        </div>
      )}
      {!isPending && !isError && messages.length > 0 && (
        <MessagesTable messages={messages} jobs={jobs} />
      )}
    </div>
  )
}
