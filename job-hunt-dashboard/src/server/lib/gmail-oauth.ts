import { randomBytes } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { encrypt, decrypt } from './crypto'

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

export class GmailNotConfiguredError extends Error {
  constructor() {
    super('Gmail not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET')
    this.name = 'GmailNotConfiguredError'
  }
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function getOAuthClient(): OAuth2Client {
  if (!isGmailConfigured()) throw new GmailNotConfiguredError()
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/onboarding/gmail/callback`,
  })
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const client = getOAuthClient()
  client.setCredentials({ refresh_token: refreshToken })
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Failed to obtain Gmail access token')
  return token
}

export interface OAuthState {
  uid: number
  nonce: string
  exp: number
  ret: 'onboarding' | 'config'
}

export function encodeState(payload: Pick<OAuthState, 'uid' | 'ret'>): string {
  const state: OAuthState = {
    uid: payload.uid,
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60_000,
    ret: payload.ret,
  }
  return encrypt(JSON.stringify(state))
}

export function decodeState(raw: string): OAuthState | null {
  let parsed: OAuthState
  try {
    parsed = JSON.parse(decrypt(raw)) as OAuthState
  } catch {
    return null
  }
  if (typeof parsed.uid !== 'number' || typeof parsed.exp !== 'number') return null
  if (parsed.exp < Date.now()) return null
  return parsed
}
