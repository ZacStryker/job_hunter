import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useBlacklistQuery } from '@/hooks/useBlacklistQuery'
import { useAddToBlacklist, useRemoveFromBlacklist } from '@/hooks/useBlacklistMutations'

export function SourcesBlacklistRoute() {
  const { data: entries = [], isPending, isError } = useBlacklistQuery()
  const addMutation = useAddToBlacklist()
  const removeMutation = useRemoveFromBlacklist()
  const [company, setCompany] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (addMutation.isPending) return
    const trimmed = company.trim()
    if (!trimmed) return
    addMutation.mutate(
      { companyName: trimmed },
      {
        onSuccess: () => {
          setCompany('')
          toast.success('Company blacklisted')
        },
        onError: (err: Error) => {
          toast.error(err.message)
        },
      }
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Blacklist</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 items-end mb-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="bl-company" className="text-xs text-zinc-400">Company name</label>
          <input
            id="bl-company"
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme Corp"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1 rounded bg-zinc-700 text-zinc-100 text-sm hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!company.trim() || addMutation.isPending || removeMutation.isPending}
        >
          Add
        </button>
      </form>
      {isError && <p className="text-sm text-red-400">Failed to load blacklist</p>}
      {isPending && <p className="text-sm text-zinc-400">Loading…</p>}
      {!isPending && !isError && entries.length === 0 && (
        <p className="text-sm text-zinc-400">No companies blacklisted yet</p>
      )}
      {!isPending && entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-1 border-b border-zinc-800 last:border-0">
              <span className="text-sm text-zinc-300">{entry.companyName}</span>
              <button
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={removeMutation.isPending}
                onClick={() =>
                  removeMutation.mutate(entry.id, {
                    onSuccess: () => toast.success('Removed from blacklist'),
                    onError: (err: Error) => toast.error(err.message),
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
