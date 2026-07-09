import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Message } from '@shared/schemas'
import { apiFetch } from '../lib/api'

// Mirrors Message so an optimistic `{ ...m, ...patch }` still yields a Message —
// a widened `type?: string` silently breaks that spread.
type MessagePatch = Partial<Pick<Message, 'type' | 'company' | 'jobTitle'>>

type MessageMutationContext = { previous: Message[] | undefined }

export function useMessageMutation() {
  const queryClient = useQueryClient()

  return useMutation<Message, Error, { id: number; patch: MessagePatch }, MessageMutationContext>({
    mutationFn: async ({ id, patch }) => {
      const res = await apiFetch(`/api/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
      const body = (await res.json()) as { message: Message }
      return body.message
    },
    onMutate: async ({ id, patch }) => {
      const previous = queryClient.getQueryData<Message[]>(['messages'])
      queryClient.setQueryData<Message[]>(['messages'], (old) =>
        old ? old.map((m) => (m.id === id ? { ...m, ...patch } : m)) : old
      )
      return { previous }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Message[]>(['messages'], (old) =>
        old ? old.map((m) => (m.id === updated.id ? updated : m)) : old
      )
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['messages'], context.previous)
      } else {
        queryClient.invalidateQueries({ queryKey: ['messages'] })
      }
    },
  })
}
