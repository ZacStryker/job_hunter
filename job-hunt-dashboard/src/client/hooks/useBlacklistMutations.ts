import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { BlacklistEntry, BlacklistEntryInput } from '@shared/schemas'

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string }
    return body.error ?? (res.statusText || `HTTP ${res.status}`)
  } catch {
    return res.statusText || `HTTP ${res.status}`
  }
}

export function useAddToBlacklist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BlacklistEntryInput): Promise<BlacklistEntry> => {
      const res = await apiFetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(await extractError(res))
      return res.json() as Promise<BlacklistEntry>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist'] })
    },
  })
}

export function useRemoveFromBlacklist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const res = await apiFetch(`/api/blacklist/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await extractError(res))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist'] })
    },
  })
}
