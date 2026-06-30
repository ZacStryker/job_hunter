import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConnectionTestButton } from '@/components/onboarding/ConnectionTestButton'
import { GoogleConnectButton } from '@/components/onboarding/GoogleConnectButton'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useInboxMappingsQuery } from '@/hooks/useInboxMappingsQuery'
import { useInboxMappingsMutation } from '@/hooks/useInboxMappingsMutation'
import { useGmailConnection } from '@/hooks/useGmailConnection'
import { useGmailLabelsQuery } from '@/hooks/useGmailLabelsQuery'
import { useGmailMappingsQuery } from '@/hooks/useGmailMappingsQuery'
import { useGmailMappingsMutation } from '@/hooks/useGmailMappingsMutation'
import { MESSAGE_TYPES } from '@shared/schemas'
import type { InboxFolderMappingInput, GmailLabelMappingInput } from '@shared/schemas'

type MessageType = typeof MESSAGE_TYPES[number]
type MappingRow = { folderPath: string; jobStatus: MessageType }
type GmailMappingRow = { label: string; jobStatus: MessageType }

export function ConnectionsInboxRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const { data: mappings = [] } = useInboxMappingsQuery()
  const mutation = useInboxMappingsMutation()

  const hasGmail = status?.hasGmail ?? false
  const { connect, disconnect } = useGmailConnection()
  const { data: gmailLabels = [], isError: gmailLabelsError } = useGmailLabelsQuery({ enabled: hasGmail })
  const { data: gmailMappings = [] } = useGmailMappingsQuery()
  const gmailMutation = useGmailMappingsMutation()

  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapUser, setImapUser] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [imapTestState, setImapTestState] = useState<'idle' | 'loading' | 'pass' | 'fail'>('idle')
  const [imapTestMsg, setImapTestMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const [rows, setRows] = useState<MappingRow[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<MappingRow>({ folderPath: '', jobStatus: 'Other' })

  const [gmailRows, setGmailRows] = useState<GmailMappingRow[]>([])
  const [gmailEditingIndex, setGmailEditingIndex] = useState<number | null>(null)
  const [gmailDraft, setGmailDraft] = useState<GmailMappingRow>({ label: '', jobStatus: 'Other' })

  const callbackHandled = useRef(false)

  // Only sync from server when mappings change (e.g. after a successful mutation refetch).
  // Intentionally omits editingIndex so clearing edit mode doesn't overwrite rows with stale data.
  useEffect(() => {
    if (editingIndex === null) {
      setRows(mappings.map(m => ({ folderPath: m.folderPath, jobStatus: m.jobStatus as MessageType })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappings])

  useEffect(() => {
    if (gmailEditingIndex === null) {
      setGmailRows(gmailMappings.map(m => ({ label: m.label, jobStatus: m.jobStatus as MessageType })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailMappings])

  useEffect(() => {
    if (callbackHandled.current) return
    callbackHandled.current = true
    const result = new URLSearchParams(window.location.search).get('gmail')
    if (result === 'connected') {
      toast.success('Gmail connected')
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      queryClient.invalidateQueries({ queryKey: ['setup-status'] })
    } else if (result === 'error') {
      toast.error('Could not connect Gmail — please try again')
    }
    if (result) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function handleTestImap() {
    setImapTestState('loading')
    try {
      const res = await apiFetch('/api/onboarding/imap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: imapHost, port: imapPort, user: imapUser, pass: imapPass }),
      })
      if (res.ok) {
        setImapTestState('pass')
        setImapTestMsg('')
      } else {
        const data = await res.json() as { error: string }
        setImapTestState('fail')
        setImapTestMsg(data.error || 'Test failed')
      }
    } catch {
      setImapTestState('fail')
      setImapTestMsg('Could not reach the server')
    }
  }

  async function handleSaveImap() {
    setSaving(true)
    try {
      const res = await apiFetch('/api/onboarding/imap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: imapHost, port: imapPort, user: imapUser, pass: imapPass }),
      })
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
        await queryClient.invalidateQueries({ queryKey: ['setup-status'] })
        toast.success('IMAP settings saved')
        setImapHost(''); setImapPort(993); setImapUser(''); setImapPass('')
        setImapTestState('idle'); setImapTestMsg('')
      } else {
        const data = await res.json() as { error: string }
        toast.error(data.error || 'Save failed')
      }
    } catch { toast.error('Could not reach the server') }
    finally { setSaving(false) }
  }

  function saveAll(updated: MappingRow[]) {
    const payload: InboxFolderMappingInput = updated.map(r => ({ folderPath: r.folderPath, jobStatus: r.jobStatus }))
    mutation.mutate(payload)
  }

  function handleEdit(i: number) { setDraft(rows[i]); setEditingIndex(i) }
  function handleCancel() {
    if (editingIndex !== null && rows[editingIndex]?.folderPath === '') {
      setRows(rows.filter((_, idx) => idx !== editingIndex))
    }
    setEditingIndex(null)
  }
  function handleSaveRow(i: number) {
    const updated = rows.map((r, idx) => idx === i ? draft : r)
    setRows(updated); setEditingIndex(null); saveAll(updated)
  }
  function handleDelete(i: number) {
    const updated = rows.filter((_, idx) => idx !== i)
    setRows(updated); saveAll(updated)
  }
  function handleAddRow() {
    const newRow: MappingRow = { folderPath: '', jobStatus: 'Other' }
    const updated = [...rows, newRow]
    setRows(updated); setDraft(newRow); setEditingIndex(updated.length - 1)
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

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Inbox Mapping</h1>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-zinc-100">IMAP Connection</h2>
          {status?.hasImap
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Connected</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Not connected</span>
          }
        </div>
        <div className="flex flex-col gap-3 mb-4">
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
        <div className="mb-3">
          <ConnectionTestButton
            state={imapTestState}
            onTest={handleTestImap}
            disabled={!imapHost.trim() || !imapUser.trim() || !imapPass.trim() || imapPort < 1 || imapPort > 65535 || imapTestState === 'loading'}
          />
        </div>
        {imapTestState === 'pass' && <Alert className="mb-3"><AlertDescription>✓ Connected</AlertDescription></Alert>}
        {imapTestState === 'fail' && <Alert variant="destructive" className="mb-3"><AlertDescription>{imapTestMsg}</AlertDescription></Alert>}
        <Button disabled={imapTestState !== 'pass' || saving} onClick={handleSaveImap}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-zinc-100">Folder Mappings</h2>
          <Button variant="outline" size="sm" onClick={handleAddRow} disabled={editingIndex !== null}>
            Add mapping
          </Button>
        </div>

        {rows.length === 0 && editingIndex === null ? (
          <div className="text-sm text-zinc-400 py-4 flex items-center gap-4">
            No folder mappings configured.
            <Button variant="outline" size="sm" onClick={handleAddRow}>
              Add mapping
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="pb-2 font-medium">Folder Path</th>
                <th className="pb-2 font-medium">Job Status</th>
                <th className="pb-2 font-medium w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.folderPath || `new-${i}`} className="border-b border-zinc-800/50">
                  {editingIndex === i ? (
                    <>
                      <td className="py-2 pr-2">
                        <Input
                          value={draft.folderPath}
                          onChange={(e) => setDraft(d => ({ ...d, folderPath: e.target.value }))}
                          placeholder="INBOX/Jobs"
                          className="h-8"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={draft.jobStatus}
                          onChange={(e) => setDraft(d => ({ ...d, jobStatus: e.target.value as MessageType }))}
                          className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                        >
                          {MESSAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleSaveRow(i)} disabled={!draft.folderPath.trim()}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleCancel}>
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-2 text-zinc-200">{row.folderPath}</td>
                      <td className="py-2 pr-2 text-zinc-400">{row.jobStatus}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(i)} disabled={editingIndex !== null}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(i)} disabled={editingIndex !== null}>
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
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-zinc-100">Gmail</h2>
          {hasGmail
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Connected</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Not connected</span>
          }
        </div>

        {hasGmail ? (
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-zinc-300">{status?.gmailAddress}</span>
            <Button variant="outline" size="sm" onClick={() => disconnect()}>Disconnect</Button>
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-sm text-zinc-400 mb-3">Connect your Gmail account to sync labelled emails into your messages.</p>
            <GoogleConnectButton onClick={() => connect('config')} />
          </div>
        )}

        {hasGmail && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-zinc-300">Label Mappings</h3>
              <Button variant="outline" size="sm" onClick={handleGmailAddRow} disabled={gmailEditingIndex !== null}>
                Add mapping
              </Button>
            </div>

            {gmailLabelsError && (
              <p className="text-sm text-amber-400 mb-3">Couldn&apos;t load Gmail labels — try reconnecting.</p>
            )}

            {gmailRows.length === 0 && gmailEditingIndex === null ? (
              <div className="text-sm text-zinc-400 py-4 flex items-center gap-4">
                No label mappings configured.
                <Button variant="outline" size="sm" onClick={handleGmailAddRow}>
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
                    <tr key={row.label || `new-${i}`} className="border-b border-zinc-800/50">
                      {gmailEditingIndex === i ? (
                        <>
                          <td className="py-2 pr-2">
                            <select
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
          </>
        )}
      </section>
    </div>
  )
}
