import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Job } from '@shared/schemas'
import { apiFetch } from '../lib/api'

type JobPatch = {
  applied?: boolean
  statusOverride?: string | null
  archived?: boolean
  jobDescription?: string | null
}

type MutationInput = { id: number; patch: JobPatch }

export function useJobMutation(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<Job, Error, MutationInput, { previousJobs: Job[] | undefined }>({
    mutationFn: async ({ id, patch }) => {
      const res = await apiFetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
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
      const body = await res.json() as { job: Job }
      return body.job
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] })
      const previousJobs = queryClient.getQueryData<Job[]>(['jobs'])
      queryClient.setQueryData<Job[]>(['jobs'], (old) =>
        old?.map((j) => {
          if (j.id !== id) return j
          const updated = { ...j, ...patch }
          if (patch.applied === true && !j.dateApplied) {
            updated.dateApplied = new Date().toISOString().split('T')[0]
          } else if (patch.applied === false) {
            updated.dateApplied = null
          }
          return updated
        })
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
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'events'] })
    },
  })
}
