import { test, expect, mock, beforeEach } from 'bun:test'

let mockFetch: ReturnType<typeof mock>

beforeEach(() => {
  mockFetch = mock(() => Promise.resolve(new Response('', { status: 200 })))
  global.fetch = mockFetch as unknown as typeof fetch
})

// Import after mocking global fetch
const { getAccessToken } = await import('./oauth-client')

test('valid token response → returns access_token string', async () => {
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ access_token: 'ya29.test-token' }), { status: 200 })
    )
  )

  const token = await getAccessToken()
  expect(token).toBe('ya29.test-token')
})

test('non-2xx response → throws "OAuth token expired or invalid"', async () => {
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    )
  )

  await expect(getAccessToken()).rejects.toThrow('OAuth token expired or invalid')
})

test('2xx response missing access_token → throws "OAuth token expired or invalid"', async () => {
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ expires_in: 3599 }), { status: 200 })
    )
  )

  await expect(getAccessToken()).rejects.toThrow('OAuth token expired or invalid')
})
