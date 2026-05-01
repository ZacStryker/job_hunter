import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { AdminUser } from '@shared/schemas'

type PatchPayload = {
  id: number
  data: { name?: string; email?: string; role?: string; isActive?: boolean }
}

export function useAdminUserPatchMutation() {
  const queryClient = useQueryClient()
  return useMutation<AdminUser, Error & { status?: number }, PatchPayload>({
    mutationFn: async ({ id, data }) => {
      const res = await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        const err = new Error(body.error ?? `PATCH failed: ${res.status}`) as Error & { status?: number }
        err.status = res.status
        throw err
      }
      return res.json() as Promise<AdminUser>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}
