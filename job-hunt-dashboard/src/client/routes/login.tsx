import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthFormCard } from '@/components/auth/AuthFormCard'

export function LoginRoute() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.status === 200) {
        const data = await res.json() as { onboardingComplete: boolean }
        await navigate({ to: data.onboardingComplete ? '/' : '/onboarding' })
      } else if (res.status === 401) {
        setError('Invalid email or password')
      } else if (res.status === 403) {
        setError('Account is disabled — contact your admin')
      } else {
        setError('Something went wrong — please try again')
      }
    } catch {
      setError('Could not reach the server — check your connection')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthFormCard>
      <div className="flex justify-center mb-4">
        <img src="/hl-logo.png" alt="Hit Lobster" width="400" height="400" className="w-[400px] h-[400px] object-contain" />
      </div>
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-zinc-100 tracking-widest">HITLOBSTER</h1>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
          Human in the Loop Organized Business<br />Search, Track, &amp; Evaluation Resource
        </p>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
          AI-assisted job search command center — find openings, analyze matches, tailor applications, track correspondence, and more. Closed beta coming soon.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
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
          {error && <p role="alert" className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <Button type="submit" className="w-full mt-6" disabled={isLoading}>Sign in</Button>
        <Link to="/register" className="text-sm text-zinc-500 hover:text-zinc-300 mt-4 block text-center">
          Register with Invite Key
        </Link>
      </form>
    </AuthFormCard>
  )
}
