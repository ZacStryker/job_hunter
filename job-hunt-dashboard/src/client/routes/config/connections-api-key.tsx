import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConnectionTestButton } from '@/components/onboarding/ConnectionTestButton'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'

export function ConnectionsApiKeyRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const [apiKey, setApiKey] = useState('')
  const [testState, setTestState] = useState<'idle' | 'loading' | 'pass' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleTest() {
    setTestState('loading')
    try {
      const res = await apiFetch('/api/onboarding/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (res.ok) { setTestState('pass'); setTestMsg('') }
      else { const d = await res.json() as { error: string }; setTestState('fail'); setTestMsg(d.error || 'Test failed') }
    } catch { setTestState('fail'); setTestMsg('Could not reach the server') }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await apiFetch('/api/onboarding/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
        await queryClient.invalidateQueries({ queryKey: ['setup-status'] })
        toast.success('API key saved')
        setApiKey(''); setTestState('idle'); setTestMsg('')
      } else {
        const d = await res.json() as { error: string }
        toast.error(d.error || 'Save failed')
      }
    } catch { toast.error('Could not reach the server') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-md">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">API Key</h1>
        {status?.hasAnthropicKey
          ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
          : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
        }
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Enter your Anthropic API key. Find it at <span className="text-zinc-300">console.anthropic.com</span>.
      </p>
      <div className="mb-4">
        <Label htmlFor="apiKey">API Key</Label>
        <Input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setTestState('idle'); setTestMsg('') }}
          className="mt-1 font-mono"
          placeholder={status?.hasAnthropicKey ? '••••••••' : 'sk-ant-...'}
        />
      </div>
      <div className="mb-3">
        <ConnectionTestButton state={testState} onTest={handleTest} disabled={!apiKey.trim() || testState === 'loading'} />
      </div>
      {testState === 'pass' && <Alert className="mb-3"><AlertDescription>✓ Connected</AlertDescription></Alert>}
      {testState === 'fail' && <Alert variant="destructive" className="mb-3"><AlertDescription>{testMsg}</AlertDescription></Alert>}
      <Button disabled={testState !== 'pass' || saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
