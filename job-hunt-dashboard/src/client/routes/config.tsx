import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useLinkedinAuthMutation } from '@/hooks/useLinkedinAuthMutation'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWebhookRunsQuery } from '@/hooks/useWebhookRunsQuery'
import { useProfileQuery } from '@/hooks/useProfileQuery'
import { usePromptsQuery } from '@/hooks/usePromptsQuery'
import { useSearchConfigsQuery } from '@/hooks/useSearchConfigsQuery'
import { useAddSearchConfigMutation, useDeleteSearchConfigMutation, useUpdateSearchConfigMutation } from '@/hooks/useSearchConfigMutations'
import { SCRAPER_SOURCES } from '@shared/schemas'
import type { PromptFlow, ScraperSource } from '@shared/schemas'

function ConnectionsCard() {
  const { data: status } = useOnboardingStatusQuery()
  const uploadMutation = useLinkedinAuthMutation()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showHowTo, setShowHowTo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isConnected = status?.hasLinkedinAuth ?? false

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null)
    uploadMutation.reset()
  }

  function handleUpload() {
    if (!selectedFile) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      uploadMutation.mutate(content, {
        onSuccess: () => {
          toast.success('LinkedIn session uploaded')
          setSelectedFile(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
        },
      })
    }
    reader.onerror = () => {
      toast.error('Failed to read file')
    }
    reader.readAsText(selectedFile)
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h2 className="text-base font-semibold text-zinc-100 mb-3">Connections</h2>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-300">LinkedIn</span>
          <span className={`text-xs ${isConnected ? 'text-emerald-500' : 'text-zinc-500'}`}>
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? selectedFile.name : 'Choose file'}
          </Button>
          <Button
            size="sm"
            disabled={!selectedFile || uploadMutation.isPending}
            onClick={handleUpload}
          >
            {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Upload'}
          </Button>
        </div>
      </div>

      {uploadMutation.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{uploadMutation.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="mt-3">
        <button
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          onClick={() => setShowHowTo(h => !h)}
        >
          {showHowTo ? '▾' : '▸'} How to generate linkedin.json
        </button>
        {showHowTo && (
          <div className="mt-2 text-xs text-zinc-400 bg-zinc-900 rounded p-3">
            <p className="mb-2">Run this command from the <code>job-hunt-dashboard/</code> directory to open a browser and log in to LinkedIn. The session file will be saved as <code>linkedin.json</code>.</p>
            <code className="text-zinc-200">node scripts/generate-linkedin-auth.js</code>
          </div>
        )}
      </div>
    </div>
  )
}

function parseName(name: string): { workflow: string; job: string } {
  if (name.startsWith('Cover Letter - ')) return { workflow: 'Cover Letter', job: name.slice(15) }
  if (name.startsWith('Resume - ')) return { workflow: 'Resume', job: name.slice(9) }
  return { workflow: name, job: '' }
}

function LogsPreviewCard() {
  const navigate = useNavigate()
  const { data: runs = [], isPending } = useWebhookRunsQuery()
  const preview = [...runs].sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime()).slice(0, 5)

  return (
    <div
      role="button"
      tabIndex={0}
      className="border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-zinc-600 transition-colors"
      onClick={() => navigate({ to: '/logs' })}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate({ to: '/logs' }) }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-zinc-100">Logs</h2>
        <span className="text-xs text-zinc-500">View all →</span>
      </div>
      {isPending && <p className="text-sm text-zinc-400">Loading…</p>}
      {!isPending && runs.length === 0 && (
        <p className="text-sm text-zinc-400">No webhook runs yet.</p>
      )}
      {!isPending && runs.length > 0 && (
        <table className="w-full text-sm">
          <TableHeader>
            <TableRow className="border-zinc-800">
              <TableHead className="text-zinc-400 bg-zinc-900 px-3 py-2">Run Date</TableHead>
              <TableHead className="text-zinc-400 bg-zinc-900 px-3 py-2">Workflow</TableHead>
              <TableHead className="text-zinc-400 bg-zinc-900 px-3 py-2">Job</TableHead>
              <TableHead className="text-zinc-400 bg-zinc-900 px-3 py-2">Success</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((run) => {
              const { workflow, job } = parseName(run.name)
              return (
                <TableRow key={run.id} className="border-zinc-800">
                  <TableCell className="px-3 py-2 text-zinc-300">
                    {new Date(run.runAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-zinc-300">{workflow}</TableCell>
                  <TableCell className="px-3 py-2 text-zinc-300">
                    {job || <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    {run.success ? (
                      <span className="text-green-400">✓</span>
                    ) : (
                      <span className="text-red-400">✗</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </table>
      )}
    </div>
  )
}

function ProfilePreviewCard() {
  const navigate = useNavigate()
  const { data, isLoading } = useProfileQuery()

  return (
    <div
      role="button"
      tabIndex={0}
      className="border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-zinc-600 transition-colors"
      onClick={() => navigate({ to: '/profile' })}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate({ to: '/profile' }) }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-zinc-100">Profile</h2>
        <span className="text-xs text-zinc-500">View all →</span>
      </div>
      {isLoading && <p className="text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Full Name', value: data?.name },
            { label: 'Email', value: data?.email },
            { label: 'Phone', value: data?.phone },
            { label: 'Location', value: data?.location },
            { label: 'LinkedIn URL', value: data?.linkedinUrl },
            { label: 'GitHub URL', value: data?.githubUrl },
          ].map(({ label, value }) => (
            <div key={label}>
              <label className="block text-xs text-zinc-400 mb-1">{label}</label>
              <p className="text-sm text-zinc-100">{value ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const PROMPT_FLOW_LABELS: Record<PromptFlow, string> = {
  analysis: 'Analysis',
  cover_letter: 'Cover Letter',
  resume: 'Resume',
}

function PromptsPreviewCard() {
  const navigate = useNavigate()
  const { data, isPending } = usePromptsQuery()

  return (
    <div
      role="button"
      tabIndex={0}
      className="border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-zinc-600 transition-colors"
      onClick={() => navigate({ to: '/prompts' })}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate({ to: '/prompts' }) }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-zinc-100">Prompts</h2>
        <span className="text-xs text-zinc-500">View all →</span>
      </div>
      {isPending && <p className="text-sm text-zinc-400">Loading…</p>}
      {!isPending && (data ?? []).length === 0 && (
        <p className="text-sm text-zinc-400">No prompts configured.</p>
      )}
      {!isPending && (data ?? []).length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {(data ?? []).map((p) => (
            <div key={p.flow} className="text-sm text-zinc-100 bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
              {PROMPT_FLOW_LABELS[p.flow]}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type SortCol = 'source' | 'query' | 'location'
type SortDir = 'asc' | 'desc'

const SORT_COL_LABELS: Record<SortCol, string> = {
  source: 'Source', query: 'Query', location: 'Location',
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span aria-hidden="true" className="ml-1 text-zinc-600">↕</span>
  return <span aria-hidden="true" className="ml-1 text-zinc-300">{dir === 'asc' ? '↑' : '↓'}</span>
}

function SearchConfigCard() {
  const { data: configs = [], isPending } = useSearchConfigsQuery()
  const addMutation = useAddSearchConfigMutation()
  const updateMutation = useUpdateSearchConfigMutation()
  const deleteMutation = useDeleteSearchConfigMutation()

  const [source, setSource] = useState<ScraperSource>('linkedin')
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSource, setEditSource] = useState<ScraperSource>('linkedin')
  const [editQuery, setEditQuery] = useState('')
  const [editLocation, setEditLocation] = useState('')

  const [sortCol, setSortCol] = useState<SortCol>('source')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function startEdit(row: { id: number; source: ScraperSource; query: string; location: string | null }) {
    updateMutation.reset()
    setEditingId(row.id)
    setEditSource(row.source)
    setEditQuery(row.query)
    setEditLocation(row.location ?? '')
  }

  function cancelEdit() {
    updateMutation.reset()
    setEditingId(null)
  }

  function handleSaveEdit(id: number) {
    updateMutation.mutate(
      { id, source: editSource, query: editQuery, location: editLocation.trim() || null },
      { onSuccess: () => setEditingId(null) }
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    addMutation.mutate(
      { source, query, location: location.trim() || null },
      {
        onSuccess: () => {
          setQuery('')
          setLocation('')
        },
      }
    )
  }

  const inputCls = 'bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-full'

  const sorted = [...configs].sort((a, b) => {
    const av = (a[sortCol] ?? '').toLowerCase()
    const bv = (b[sortCol] ?? '').toLowerCase()
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-zinc-100">Discovery Searches</h2>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 items-end flex-wrap mb-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="sc-source" className="text-xs text-zinc-400">Source</label>
          <select
            id="sc-source"
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
            value={source}
            onChange={(e) => setSource(e.target.value as ScraperSource)}
          >
            {SCRAPER_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sc-query" className="text-xs text-zinc-400">Query</label>
          <input
            id="sc-query"
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. genai ml python"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sc-location" className="text-xs text-zinc-400">Location (optional)</label>
          <input
            id="sc-location"
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. remote"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1 rounded bg-zinc-700 text-zinc-100 text-sm hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!query.trim() || addMutation.isPending}
        >
          Add
        </button>
      </form>
      {addMutation.isError && (
        <p className="text-sm text-red-400 mb-2">Add failed: {(addMutation.error as Error).message}</p>
      )}
      {isPending && <p className="text-sm text-zinc-400">Loading…</p>}
      {!isPending && configs.length === 0 && (
        <p className="text-sm text-zinc-400">No search targets configured.</p>
      )}
      {!isPending && configs.length > 0 && (
        <table className="w-full text-sm">
          <TableHeader>
            <TableRow className="border-zinc-800">
              {(['source', 'query', 'location'] as SortCol[]).map((col) => (
                <TableHead
                  key={col}
                  aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`text-zinc-400 bg-zinc-900 px-3 py-2 select-none transition-colors ${editingId !== null ? 'cursor-default opacity-50' : 'cursor-pointer hover:text-zinc-200'}`}
                  onClick={() => editingId === null && toggleSort(col)}
                >
                  {SORT_COL_LABELS[col]}
                  <SortIcon active={sortCol === col} dir={sortDir} />
                </TableHead>
              ))}
              <TableHead aria-label="Actions" className="text-zinc-400 bg-zinc-900 px-3 py-2"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) =>
              editingId === row.id ? (
                <TableRow key={row.id} className="border-zinc-800">
                  <TableCell className="px-3 py-1">
                    <select
                      className={inputCls}
                      value={editSource}
                      onChange={(e) => setEditSource(e.target.value as ScraperSource)}
                    >
                      {SCRAPER_SOURCES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="px-3 py-1">
                    <input
                      className={inputCls}
                      type="text"
                      value={editQuery}
                      onChange={(e) => setEditQuery(e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-1">
                    <input
                      className={inputCls}
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="optional"
                    />
                  </TableCell>
                  <TableCell className="px-3 py-1 whitespace-nowrap">
                    <button
                      aria-label="Save"
                      className="text-zinc-300 hover:text-green-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mr-2"
                      disabled={!editQuery.trim() || updateMutation.isPending}
                      onClick={() => handleSaveEdit(row.id)}
                    >
                      ✓
                    </button>
                    <button
                      aria-label="Cancel"
                      className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={updateMutation.isPending}
                      onClick={cancelEdit}
                    >
                      ✕
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={row.id} className="border-zinc-800">
                  <TableCell className="px-3 py-2 text-zinc-300">{row.source}</TableCell>
                  <TableCell className="px-3 py-2 text-zinc-300">{row.query}</TableCell>
                  <TableCell className="px-3 py-2 text-zinc-300">
                    {row.location ?? <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell className="px-3 py-2 whitespace-nowrap">
                    <button
                      aria-label="Edit"
                      className="text-zinc-500 hover:text-zinc-300 transition-colors mr-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={deleteMutation.isPending || editingId !== null}
                      onClick={() => startEdit({ ...row, source: row.source as ScraperSource })}
                    >
                      ✎
                    </button>
                    <button
                      aria-label="Delete"
                      className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={deleteMutation.isPending || editingId !== null}
                      onClick={() => deleteMutation.mutate(row.id)}
                    >
                      ✕
                    </button>
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </table>
      )}
      {updateMutation.isError && (
        <p className="text-sm text-red-400 mt-2">Save failed: {(updateMutation.error as Error).message}</p>
      )}
      {deleteMutation.isError && (
        <p className="text-sm text-red-400 mt-2">Delete failed: {(deleteMutation.error as Error).message}</p>
      )}
    </div>
  )
}

export function ConfigRoute() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-100">Config</h1>
      <ConnectionsCard />
      <SearchConfigCard />
      <div className="grid grid-cols-2 gap-6">
        <ProfilePreviewCard />
        <PromptsPreviewCard />
      </div>
      <LogsPreviewCard />
    </div>
  )
}
