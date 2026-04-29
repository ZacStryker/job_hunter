function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      const headers = new Headers(init.headers)
      headers.set('x-csrf-token', csrfToken)
      return fetch(url, { ...init, headers })
    }
  }
  return fetch(url, init)
}
