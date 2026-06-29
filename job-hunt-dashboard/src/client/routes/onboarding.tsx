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
import { useGmailLabelsQuery } from '@/hooks/useGmailLabelsQuery'
import { useGmailMappingsQuery } from '@/hooks/useGmailMappingsQuery'
import { useGmailMappingsMutation } from '@/hooks/useGmailMappingsMutation'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'
import { MESSAGE_TYPES } from '@shared/schemas'
import type { GmailLabelMappingInput } from '@shared/schemas'

type MessageType = typeof MESSAGE_TYPES[number]
type GmailMappingRow = { label: string; jobStatus: MessageType }

export function OnboardingRoute() {
  const navigate = useNavigate()
  const { data: status } = useOnboardingStatusQuery()
  const { connect } = useGmailConnection()
  const { data: featureSettings } = useFeatureSettingsQuery()
  const emailEnabled = !!featureSettings?.emailFeatures
  const hasGmail = status?.hasGmail ?? false
  const showLabelStep = emailEnabled && hasGmail
  const labelStep = 3
  const readyStep = emailEnabled ? (hasGmail ? 4 : 3) : 2
  const totalSteps = emailEnabled ? (hasGmail ? 5 : 4) : 3
  const [step, setStep] = useState(() => {
    if (typeof window === 'undefined') return 0
    const g = new URLSearchParams(window.location.search).get('gmail')
    if (g === 'connected') return labelStep
    if (g === 'error') return 2
    return 0
  })
  const callbackHandled = useRef(false)
  const arrivedFromGmail = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('gmail') === 'connected'
  )
  // On the OAuth return we synchronously land on labelStep before status/featureSettings
  // resolve. Hold a loader until they do, so we never flash the Ready screen or a step that
  // renders nothing while hasGmail is still false.
  const awaitingGmailReturn = arrivedFromGmail.current && (status === undefined || featureSettings === undefined)

  const { data: gmailLabels = [], isError: gmailLabelsError } = useGmailLabelsQuery({ enabled: hasGmail })
  const { data: gmailMappings = [] } = useGmailMappingsQuery()
  const gmailMutation = useGmailMappingsMutation()

  const [gmailRows, setGmailRows] = useState<GmailMappingRow[]>([])
  const [gmailEditingIndex, setGmailEditingIndex] = useState<number | null>(null)
  const [gmailDraft, setGmailDraft] = useState<GmailMappingRow>({ label: '', jobStatus: 'Other' })

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
  const labelStepRef = useRef<HTMLHeadingElement>(null)
  const readyRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (step === 1) step1Ref.current?.focus()
    else if (emailEnabled && step === 2) step2Ref.current?.focus()
    else if (showLabelStep && step === labelStep) labelStepRef.current?.focus()
    else if (step === readyStep) readyRef.current?.focus()
  }, [step, emailEnabled, showLabelStep, readyStep])

  useEffect(() => {
    if (gmailEditingIndex === null) {
      setGmailRows(gmailMappings.map(m => ({ label: m.label, jobStatus: m.jobStatus as MessageType })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailMappings])

  // Once status/featureSettings have resolved, never leave the user stranded on the label
  // step when it isn't actually available (e.g. Gmail not connected) — advance to Ready.
  useEffect(() => {
    if (status !== undefined && featureSettings !== undefined && step === labelStep && !showLabelStep) {
      setStep(readyStep)
    }
  }, [status, featureSettings, step, showLabelStep, readyStep])

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
    // Intentionally do NOT strip the ?gmail param here. A native history.replaceState is
    // observed by TanStack Router and re-runs this route's beforeLoad; with the param gone
    // and onboarding already "complete" (Anthropic key set), the guard would redirect to '/'
    // mid-flow. Keeping the param keeps `returningFromGmail` true; it clears when the user
    // leaves onboarding for the dashboard.
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

  function saveAllGmail(updated: GmailMappingRow[]) {
    const payload: GmailLabelMappingInput = updated.map(r => ({ label: r.label, jobStatus: r.jobStatus }))
    gmailMutation.mutate(payload)
  }

  function handleGmailEdit(i: number) { setGmailDraft(gmailRows[i]); setGmailEditingIndex(i) }
  function handleGmailCancel() {
    if (gmailEditingIndex !== null && gmailRows[gmailEditingIndex]?.label === '') {
      setGmailRows(gmailRows.filter((_, idx) => idx !== gmailEditingIndex))
    }
    setGmailEditingIndex(null)
  }
  function handleGmailSaveRow(i: number) {
    const updated = gmailRows.map((r, idx) => idx === i ? gmailDraft : r)
    setGmailRows(updated); setGmailEditingIndex(null); saveAllGmail(updated)
  }
  function handleGmailDelete(i: number) {
    const updated = gmailRows.filter((_, idx) => idx !== i)
    setGmailRows(updated); saveAllGmail(updated)
  }
  function handleGmailAddRow() {
    const newRow: GmailMappingRow = { label: '', jobStatus: 'Other' }
    const updated = [...gmailRows, newRow]
    setGmailRows(updated); setGmailDraft(newRow); setGmailEditingIndex(updated.length - 1)
  }

  if (awaitingGmailReturn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">Finishing Gmail setup…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8">
        <StepIndicator currentStep={step} totalSteps={totalSteps} />
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
                  Gmail connected — {status.gmailAddress}. Continue to map your labels.
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
              <Button onClick={() => setStep(showLabelStep ? labelStep : readyStep)}>Skip for now</Button>
              <Button disabled={imapTestState !== 'pass'} onClick={() => setStep(showLabelStep ? labelStep : readyStep)}>Continue</Button>
            </div>
          </div>
        )}

        {showLabelStep && step === labelStep && (
          <div>
            <h2 ref={labelStepRef} tabIndex={-1} className="text-xl font-semibold mt-6">Gmail Label Mappings</h2>
            <p className="text-zinc-400 mt-2 text-sm">
              Map your Gmail labels to job statuses so labelled emails sync to the right place.
              This is optional — you can change these anytime in Config.
            </p>

            {gmailLabelsError && (
              <p className="text-sm text-amber-400 mt-3">Couldn&apos;t load Gmail labels — try reconnecting.</p>
            )}

            <div className="flex items-center justify-between mt-5 mb-3">
              <h3 className="text-sm font-medium text-zinc-300">Label Mappings</h3>
              <Button variant="outline" size="sm" onClick={handleGmailAddRow} disabled={gmailEditingIndex !== null || gmailLabels.length === 0}>
                Add mapping
              </Button>
            </div>

            {gmailRows.length === 0 && gmailEditingIndex === null ? (
              <div className="text-sm text-zinc-400 py-4 flex items-center gap-4">
                No label mappings configured.
                <Button variant="outline" size="sm" onClick={handleGmailAddRow} disabled={gmailLabels.length === 0}>
                  Add mapping
                </Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                    <th className="pb-2 font-medium">Label</th>
                    <th className="pb-2 font-medium">Job Status</th>
                    <th className="pb-2 font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gmailRows.map((row, i) => (
                    <tr key={`${row.label}-${i}`} className="border-b border-zinc-800/50">
                      {gmailEditingIndex === i ? (
                        <>
                          <td className="py-2 pr-2">
                            <select
                              aria-label="Gmail label"
                              value={gmailDraft.label}
                              onChange={(e) => setGmailDraft(d => ({ ...d, label: e.target.value }))}
                              className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                            >
                              <option value="" disabled>Select a label…</option>
                              {gmailLabels.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              aria-label="Job status"
                              value={gmailDraft.jobStatus}
                              onChange={(e) => setGmailDraft(d => ({ ...d, jobStatus: e.target.value as MessageType }))}
                              className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                            >
                              {MESSAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => handleGmailSaveRow(i)} disabled={!gmailDraft.label.trim()}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleGmailCancel}>
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-2 text-zinc-200">{row.label}</td>
                          <td className="py-2 pr-2 text-zinc-400">{row.jobStatus}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleGmailEdit(i)} disabled={gmailEditingIndex !== null}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleGmailDelete(i)} disabled={gmailEditingIndex !== null}>
                                Delete
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Button className="w-full mt-6" onClick={() => setStep(readyStep)} disabled={gmailEditingIndex !== null}>Continue</Button>
          </div>
        )}

        {step === readyStep && (
          <div className="text-center">
            <h2 ref={readyRef} tabIndex={-1} className="text-xl font-semibold mt-6">Your account is ready</h2>
            <p className="text-zinc-400 mt-2">You&apos;re all set. Head to your dashboard to start tracking jobs.</p>
            <Button className="w-full mt-6" onClick={() => navigate({ to: '/' })}>Go to Dashboard</Button>
          </div>
        )}
      </div>
    </div>
  )
}
