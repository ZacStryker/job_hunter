import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConnectionTestButton } from '@/components/onboarding/ConnectionTestButton'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useInboxMappingsQuery } from '@/hooks/useInboxMappingsQuery'
import { useInboxMappingsMutation } from '@/hooks/useInboxMappingsMutation'
import { MESSAGE_TYPES } from '@shared/schemas'
import type { InboxFolderMappingInput } from '@shared/schemas'

type MessageType = typeof MESSAGE_TYPES[number]
type MappingRow = { folderPath: string; jobStatus: MessageType }

export function ProfileInboxMappingRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const { data: mappings = [] } = useInboxMappingsQuery()
  const mutation = useInboxMappingsMutation()

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

  // Only sync from server when mappings change (e.g. after a successful mutation refetch).
  // Intentionally omits editingIndex so clearing edit mode doesn't overwrite rows with stale data.
  useEffect(() => {
    if (editingIndex === null) {
      setRows(mappings.map(m => ({ folderPath: m.folderPath, jobStatus: m.jobStatus as MessageType })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappings])

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
    </div>
  )
}
