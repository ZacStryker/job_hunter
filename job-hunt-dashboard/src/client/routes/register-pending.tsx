import { useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { AuthFormCard } from '@/components/auth/AuthFormCard'

export function RegisterPendingRoute() {
  const { email: rawEmail } = useSearch({ from: '/register/pending' })
  const email = rawEmail || null
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function handleResend() {
    if (!email) return
    setResendStatus('sending')
    try {
      const res = await fetch('/auth/resend-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResendStatus(res.ok ? 'sent' : 'idle')
    } catch {
      setResendStatus('idle')
    }
  }

  return (
    <AuthFormCard>
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-zinc-100">Check your email</h1>
        <p className="text-sm text-zinc-400">
          An activation link has been sent. Click the link in the email to activate your account.
        </p>
        <Button variant="outline" onClick={handleResend} disabled={resendStatus === 'sending' || resendStatus === 'sent'}>
          Resend activation email
        </Button>
        {resendStatus === 'sent' && (
          <p className="text-xs text-zinc-400">Sent! Check your inbox.</p>
        )}
      </div>
    </AuthFormCard>
  )
}
