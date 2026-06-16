import { queryClient } from '@/lib/query-client'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

export function useGmailConnection() {
  async function connect(returnTo: 'config' | 'onboarding') {
    try {
      const res = await apiFetch(`/api/onboarding/gmail/connect?return=${returnTo}`)
      if (res.ok) {
        const { url } = await res.json() as { url: string }
        window.location.href = url
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast.error(data.error ?? 'Could not start Gmail connection')
      }
    } catch {
      toast.error('Could not reach the server')
    }
  }

  async function disconnect() {
    const res = await apiFetch('/api/onboarding/gmail', { method: 'DELETE' }).catch(() => null)
    if (!res || !res.ok) {
      toast.error('Could not disconnect Gmail')
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    await queryClient.invalidateQueries({ queryKey: ['gmail-mappings'] })
    await queryClient.invalidateQueries({ queryKey: ['gmail-labels'] })
    toast.success('Gmail disconnected')
  }

  return { connect, disconnect }
}
