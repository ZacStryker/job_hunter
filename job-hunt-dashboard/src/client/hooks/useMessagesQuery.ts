import { useQuery } from '@tanstack/react-query'
import type { Message } from '@shared/schemas'

export async function fetchMessages(): Promise<Message[]> {
  const res = await fetch('/api/messages')
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON error body — use statusText
    }
    throw new Error(message)
  }
  const body = (await res.json()) as { messages: Message[] }
  return body.messages
}

export function useMessagesQuery() {
  return useQuery<Message[], Error>({ queryKey: ['messages'], queryFn: fetchMessages })
}
