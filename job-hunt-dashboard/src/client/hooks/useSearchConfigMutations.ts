import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SearchConfig, SearchConfigInput } from '@shared/schemas'

export function useAddSearchConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SearchConfigInput): Promise<SearchConfig> => {
      const res = await fetch('/api/search-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error)
      }
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
      const res = await fetch(`/api/search-configs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error)
      }
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
      const res = await fetch(`/api/search-configs/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error)
      }
      return res.json() as Promise<{ id: number }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-configs'] })
    },
  })
}
