import { useQuery } from '@tanstack/react-query'
import type { AdminUser } from '@shared/schemas'

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users')
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
  return res.json() as Promise<AdminUser[]>
}

export function useAdminUsersQuery() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
  })
}
