import { useMutation, useQueryClient } from '@tanstack/react-query'

interface AddJobInput {
  company: string
  jobTitle: string
  location: string | null
  sourceUrl: string
}

export function useAddJobMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AddJobInput) => {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error ?? 'Failed to add job')
      }
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}
