import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SearchConfig, SearchConfigInput } from '@shared/schemas'
import { apiFetch } from '../lib/api'

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string }
    return body.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

export function useAddSearchConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SearchConfigInput): Promise<SearchConfig> => {
      const res = await apiFetch('/api/search-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(await extractError(res))
      return res.json() as Promise<SearchConfig>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-configs'] })
    },
  })
}

export function useUpdateSearchConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: SearchConfigInput & { id: number }): Promise<SearchConfig> => {
      const res = await apiFetch(`/api/search-configs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(await extractError(res))
      return res.json() as Promise<SearchConfig>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-configs'] })
    },
  })
}

export function useDeleteSearchConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number): Promise<{ id: number }> => {
      const res = await apiFetch(`/api/search-configs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await extractError(res))
      return res.json() as Promise<{ id: number }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-configs'] })
    },
  })
}
