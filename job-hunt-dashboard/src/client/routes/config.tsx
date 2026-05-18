import { useNavigate } from '@tanstack/react-router'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWebhookRunsQuery } from '@/hooks/useWebhookRunsQuery'
import { useProfileQuery } from '@/hooks/useProfileQuery'
import { usePromptsQuery } from '@/hooks/usePromptsQuery'
import type { PromptFlow } from '@shared/schemas'

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


export function ConfigRoute() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-100">Config</h1>
      <div className="grid grid-cols-2 gap-6">
        <ProfilePreviewCard />
        <PromptsPreviewCard />
      </div>
      <LogsPreviewCard />
    </div>
  )
}
