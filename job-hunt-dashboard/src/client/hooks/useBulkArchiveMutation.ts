import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Job } from '@shared/schemas'
import { apiFetch } from '../lib/api'

export function useBulkArchiveMutation() {
  const queryClient = useQueryClient()

  return useMutation<{ archived: number }, Error, number[], { previousJobs: Job[] | undefined }>({
    mutationFn: async (ids) => {
      const res = await apiFetch('/api/jobs/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
      return res.json()
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] })
      const previousJobs = queryClient.getQueryData<Job[]>(['jobs'])
      queryClient.setQueryData<Job[]>(['jobs'], (old) =>
        old?.map((j) => ids.includes(j.id) ? { ...j, archived: true } : j)
      )
      return { previousJobs }
    },
    onError: (_err, _input, context) => {
      if (context?.previousJobs !== undefined) {
        queryClient.setQueryData<Job[]>(['jobs'], context.previousJobs)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
