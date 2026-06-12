import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthFormCard } from '@/components/auth/AuthFormCard'

export function RegisterRoute() {
  const navigate = useNavigate()
  const [inviteKey, setInviteKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [inviteKeyError, setInviteKeyError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setInviteKeyError(null)
    setEmailError(null)
    setConfirmPasswordError(null)
    setGeneralError(null)
    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteKey: inviteKey.trim(), email, password }),
      })
      if (res.status === 201) {
        await navigate({ to: '/register/pending', search: { email } })
      } else if (res.status === 400) {
        const data = await res.json().catch(() => ({ error: '' })) as { error: string }
        const msg = typeof data.error === 'string' ? data.error : ''
        if (msg.includes('Invite key')) {
          setInviteKeyError(msg)
        } else if (msg.includes('Email already')) {
          setEmailError('Email already in use — sign in instead')
        } else {
          setGeneralError(msg || 'Registration failed — please try again')
        }
      } else {
        setGeneralError('Something went wrong — please try again')
      }
    } catch {
      setGeneralError('Could not reach the server — check your connection')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthFormCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="inviteKey">Invite Key</Label>
          <Input
            id="inviteKey"
            type="text"
            value={inviteKey}
            onChange={(e) => setInviteKey(e.target.value)}
            className="font-mono"
            placeholder="XXXX-XXXX-XXXX"
            required
          />
          {inviteKeyError && <p role="alert" className="text-xs text-red-400 mt-1">{inviteKeyError}</p>}
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {emailError && <p role="alert" className="text-xs text-red-400 mt-1">{emailError}</p>}
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          {confirmPasswordError && <p role="alert" className="text-xs text-red-400 mt-1">{confirmPasswordError}</p>}
        </div>
        {generalError && <p role="alert" className="text-xs text-red-400 mt-1">{generalError}</p>}
        <Button type="submit" className="w-full mt-6" disabled={isLoading}>Create account</Button>
        <Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-300 mt-4 block text-center">
          Already have an account? Sign in
        </Link>
        <Link to="/tour" className="text-sm text-zinc-500 hover:text-zinc-300 mt-2 block text-center">
          See how it works →
        </Link>
      </form>
    </AuthFormCard>
  )
}
