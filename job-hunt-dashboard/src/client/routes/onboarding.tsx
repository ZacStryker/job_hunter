import { useState, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StepIndicator } from '@/components/onboarding/StepIndicator'
import { ConnectionTestButton } from '@/components/onboarding/ConnectionTestButton'
import { GoogleConnectButton } from '@/components/onboarding/GoogleConnectButton'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useGmailConnection } from '@/hooks/useGmailConnection'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'

export function OnboardingRoute() {
  const navigate = useNavigate()
  const { data: status } = useOnboardingStatusQuery()
  const { connect } = useGmailConnection()
  const { data: featureSettings } = useFeatureSettingsQuery()
  const emailEnabled = !!featureSettings?.emailFeatures
  const readyStep = emailEnabled ? 3 : 2
  const [step, setStep] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gmail') ? 2 : 0
  )
  const callbackHandled = useRef(false)

  const [apiKey, setApiKey] = useState('')
  const [apiKeyTestState, setApiKeyTestState] = useState<'idle' | 'loading' | 'pass' | 'fail'>('idle')
  const [apiKeyTestMsg, setApiKeyTestMsg] = useState('')

  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapUser, setImapUser] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [imapTestState, setImapTestState] = useState<'idle' | 'loading' | 'pass' | 'fail'>('idle')
  const [imapTestMsg, setImapTestMsg] = useState('')

  const [liveMsg, setLiveMsg] = useState('')

  const step1Ref = useRef<HTMLHeadingElement>(null)
  const step2Ref = useRef<HTMLHeadingElement>(null)
  const step3Ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (step === 1) step1Ref.current?.focus()
    else if (emailEnabled && step === 2) step2Ref.current?.focus()
    else if (step === readyStep) step3Ref.current?.focus()
  }, [step, emailEnabled, readyStep])

  useEffect(() => {
    if (callbackHandled.current) return
    callbackHandled.current = true
    const result = new URLSearchParams(window.location.search).get('gmail')
    if (result === 'connected') {
      toast.success('Gmail connected')
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    } else if (result === 'error') {
      toast.error('Could not connect Gmail — please try again')
    }
    if (result) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function handleTestAnthropicKey() {
    setApiKeyTestState('loading')
    setLiveMsg('')
    try {
      const res = await apiFetch('/api/onboarding/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (res.ok) {
        setApiKeyTestState('pass')
        setApiKeyTestMsg('')
        setLiveMsg('Connection successful')
      } else {
        const data = await res.json() as { error: string }
        setApiKeyTestState('fail')
        setApiKeyTestMsg(data.error || 'Test failed')
        setLiveMsg(data.error || 'Test failed')
      }
    } catch {
      setApiKeyTestState('fail')
      setApiKeyTestMsg('Could not reach the server')
      setLiveMsg('Could not reach the server')
    }
  }

  async function handleTestImap() {
    setImapTestState('loading')
    setLiveMsg('')
    try {
      const res = await apiFetch('/api/onboarding/imap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: imapHost, port: imapPort, user: imapUser, pass: imapPass }),
      })
      if (res.ok) {
        setImapTestState('pass')
        setImapTestMsg('')
        setLiveMsg('Connection successful')
      } else {
        const data = await res.json() as { error: string }
        setImapTestState('fail')
        setImapTestMsg(data.error || 'Test failed')
        setLiveMsg(data.error || 'Test failed')
      }
    } catch {
      setImapTestState('fail')
      setImapTestMsg('Could not reach the server')
      setLiveMsg('Could not reach the server')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8">
        <StepIndicator currentStep={step} totalSteps={emailEnabled ? 4 : 3} />
        <div aria-live="polite" className="sr-only">{liveMsg}</div>

        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold mt-6">Welcome</h2>
            <p className="text-zinc-400 mt-2">Let&apos;s get your account set up. This takes under 5 minutes.</p>
            <Button className="w-full mt-6" onClick={() => setStep(1)}>Get Started</Button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 ref={step1Ref} tabIndex={-1} className="text-xl font-semibold mt-6">Anthropic API Key</h2>
            <p className="text-zinc-400 mt-2 text-sm">
              Enter your Anthropic API key. Find it at{' '}
              <span className="text-zinc-300">console.anthropic.com</span>.
            </p>
            <div className="mt-4">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setApiKeyTestState('idle'); setApiKeyTestMsg('') }}
                className="mt-1 font-mono"
                placeholder="sk-ant-..."
              />
            </div>
            <div className="mt-4">
              <ConnectionTestButton
                state={apiKeyTestState}
                onTest={handleTestAnthropicKey}
                disabled={!apiKey.trim() || apiKeyTestState === 'loading'}
              />
            </div>
            {apiKeyTestState === 'pass' && (
              <Alert className="mt-3">
                <AlertDescription>Connection successful</AlertDescription>
              </Alert>
            )}
            {apiKeyTestState === 'fail' && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{apiKeyTestMsg}</AlertDescription>
              </Alert>
            )}
            <Button
              className="w-full mt-6"
              disabled={apiKeyTestState !== 'pass'}
              onClick={() => setStep(emailEnabled ? 2 : readyStep)}
            >
              Continue
            </Button>
          </div>
        )}

        {emailEnabled && step === 2 && (
          <div>
            <h2 ref={step2Ref} tabIndex={-1} className="text-xl font-semibold mt-6">Email Setup</h2>
            <p className="text-zinc-400 mt-1 text-sm">Optional — lets the app detect reply emails.</p>

            {status?.hasGmail ? (
              <Alert className="mt-4">
                <AlertDescription>
                  Gmail connected — {status.gmailAddress}. You can manage label mappings later in Config.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="mt-4">
                <GoogleConnectButton onClick={() => connect('onboarding')} className="w-full" />
              </div>
            )}

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-xs text-zinc-500">or use IMAP</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>

            <p className="text-xs text-zinc-500 mb-1">Use imap.gmail.com port 993 for Gmail</p>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <Label htmlFor="imapHost">IMAP Host</Label>
                <Input id="imapHost" value={imapHost}
                  onChange={(e) => { setImapHost(e.target.value); setImapTestState('idle'); setImapTestMsg('') }}
                  placeholder="imap.gmail.com" />
              </div>
              <div>
                <Label htmlFor="imapPort">Port</Label>
                <Input id="imapPort" type="number" min={1} max={65535} value={imapPort}
                  onChange={(e) => { setImapPort(Number(e.target.value)); setImapTestState('idle'); setImapTestMsg('') }} />
              </div>
              <div>
                <Label htmlFor="imapUser">Username / Email</Label>
                <Input id="imapUser" type="email" value={imapUser}
                  onChange={(e) => { setImapUser(e.target.value); setImapTestState('idle'); setImapTestMsg('') }} />
              </div>
              <div>
                <Label htmlFor="imapPass">Password / App Password</Label>
                <Input id="imapPass" type="password" value={imapPass}
                  onChange={(e) => { setImapPass(e.target.value); setImapTestState('idle'); setImapTestMsg('') }} />
              </div>
            </div>
            <div className="mt-4">
              <ConnectionTestButton
                state={imapTestState}
                onTest={handleTestImap}
                disabled={!imapHost.trim() || !imapUser.trim() || !imapPass.trim() || imapPort < 1 || imapPort > 65535 || imapTestState === 'loading'}
              />
            </div>
            {imapTestState === 'pass' && (
              <Alert className="mt-3"><AlertDescription>Connection successful</AlertDescription></Alert>
            )}
            {imapTestState === 'fail' && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{imapTestMsg}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>Skip for now</Button>
              <Button disabled={imapTestState !== 'pass'} onClick={() => setStep(3)}>Continue</Button>
            </div>
          </div>
        )}

        {step === readyStep && (
          <div className="text-center">
            <h2 ref={step3Ref} tabIndex={-1} className="text-xl font-semibold mt-6">Your account is ready</h2>
            <p className="text-zinc-400 mt-2">You&apos;re all set. Head to your dashboard to start tracking jobs.</p>
            <Button className="w-full mt-6" onClick={() => navigate({ to: '/' })}>Go to Dashboard</Button>
          </div>
        )}
      </div>
    </div>
  )
}
