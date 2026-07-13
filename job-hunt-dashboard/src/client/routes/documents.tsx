import { useState, useMemo } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useProfileQuery } from '../hooks/useProfileQuery'
import { useCoverLetterQuery } from '../hooks/useCoverLetterQuery'
import { useCoverLetterMutation } from '../hooks/useCoverLetterMutation'
import { buildCoverLetterHtml } from '@shared/cover-letter-html'
import { COVER_LETTER_MAX_CHARS } from '@shared/schemas'

// The only routes that host JobDrawer, so the only places Back can meaningfully return to.
const BACK_TARGETS = ['/', '/applications', '/archive', '/matches'] as const

// A focused mode, not a new visual language: same zinc surfaces, same type scale, and the preview
// keeps the drawer's `border border-zinc-800 rounded` + A4 aspect treatment so it reads as the same
// object the drawer just showed.
export function DocumentsRoute() {
  const { jobId, docType } = useParams({ from: '/_protected/documents/$jobId/$docType' })
  const { from } = useSearch({ from: '/_protected/documents/$jobId/$docType' })
  const id = Number(jobId)

  const { data: jobs = [] } = useJobsQuery()
  const job = jobs.find((j) => j.id === id)
  const { data: profile } = useProfileQuery()
  const { data: letter, isLoading, isError: loadFailed } = useCoverLetterQuery(id)
  const { mutate: save, isPending, isError, error, reset } = useCoverLetterMutation(id)

  const [draft, setDraft] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const saved = letter?.content ?? ''
  const current = draft ?? saved
  const isDirty = draft !== null && draft !== saved

  // The whole point of extracting buildCoverLetterHtml into shared/: this is the SAME function the
  // server pipes through Playwright, so the preview cannot drift from the PDF. No round-trip.
  const previewHtml = useMemo(
    () => buildCoverLetterHtml(current, profile?.personal ?? null),
    [current, profile]
  )

  // `from` arrives from the URL, so it is user-supplied. Allowlist it to the four routes that
  // actually host the drawer rather than feeding an arbitrary string into <Link to={...}>.
  const backTo = from && (BACK_TARGETS as readonly string[]).includes(from) ? from : '/'

  function handleSave() {
    const submitted = current
    save({ content: submitted }, {
      // Clear the draft ONLY if it still matches what was submitted. The textarea is disabled while
      // saving, but a restore landing mid-flight can still move `saved` underneath us — and clearing
      // unconditionally would silently discard anything that diverged.
      onSuccess: () => setDraft((d) => (d === submitted ? null : d)),
    })
  }

  function handleDiscard() {
    if (!confirmingDiscard) {
      setConfirmingDiscard(true)
      return
    }
    setDraft(null)
    setConfirmingDiscard(false)
    reset()
  }

  const backLink = (
    <Link
      to={backTo}
      search={{ job: id, tab: 'documents' }}
      className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
    >
      <ChevronLeft size={13} />
      {job ? `Back to ${job.company}` : 'Back'}
    </Link>
  )

  // Ownership before doc type: /documents/<foreign-id>/resume must read as "not found", not as
  // "not editable yet".
  if (!Number.isInteger(id) || id <= 0 || (!isLoading && !job)) {
    return (
      <div className="p-6 space-y-4">
        {backLink}
        <p className="text-sm text-zinc-500">Job not found.</p>
      </div>
    )
  }

  if (docType !== 'cover-letter') {
    // The shell is deliberately generic — the resume editor (G3) reuses this route — but the resume
    // is not editable yet: its JSON is discarded after render, so there is nothing to edit.
    return (
      <div className="p-6 space-y-4">
        {backLink}
        <p className="text-sm text-zinc-500">This document is not editable yet.</p>
      </div>
    )
  }

  // Every guard below used to read `!isLoading && …`, so during the initial fetch execution fell
  // through to the editor with an EMPTY textarea. Typing into that and saving would have written a
  // blank-ish letter over a real one.
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {backLink}
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    )
  }

  // A failed fetch is NOT an absent letter. Collapsing the two would tell a user who has a letter
  // that they have none — and the obvious next move, Generate, burns a real Anthropic call to
  // "fix" what was only a transient read error.
  if (loadFailed) {
    return (
      <div className="p-6 space-y-4">
        {backLink}
        <p className="text-sm text-red-400">Could not load this cover letter. Reload to try again.</p>
      </div>
    )
  }

  if (!letter) {
    return (
      <div className="p-6 space-y-4">
        {backLink}
        <p className="text-sm text-zinc-500">Generate a cover letter first — there is nothing to edit yet.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        {backLink}
        <div className="flex items-center gap-3">
          {isDirty && <span className="text-xs text-zinc-500">unsaved changes</span>}
          {isError && <span className="text-xs text-red-400">{error?.message || 'Failed to save'}</span>}
          {isDirty && (
            // The one genuinely irreversible act here is discarding UNSAVED text, so it is the one
            // thing that gets a confirmation — but inline, in place. The UX spec bans modals, and
            // Save needs no guard because it inserts a new version and the old one stays restorable.
            <button
              onClick={handleDiscard}
              onBlur={() => setConfirmingDiscard(false)}
              disabled={isPending}
              className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirmingDiscard ? 'Discard changes?' : 'Discard'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || isPending}
            className="px-3 py-1.5 rounded-md bg-zinc-700 border border-zinc-600 text-sm text-zinc-100 hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving…' : 'Save & Re-render'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Edit</p>
          <textarea
            value={current}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={COVER_LETTER_MAX_CHARS}
            // Disabled while saving: the PDF render takes seconds, and keystrokes typed during that
            // window would be dropped when the draft resets on success.
            disabled={isPending}
            className="w-full aspect-[210/297] bg-zinc-900 border border-zinc-800 rounded px-4 py-3 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-60"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Preview</p>
          <iframe
            srcDoc={previewHtml}
            title="Cover letter preview"
            // The letter is rendered from user-controlled text into a same-origin document that also
            // carries an inline <script>. escHtml covers today's template, but sandboxing means a
            // future escaping gap cannot become script execution in the app's origin. The preview
            // needs no scripts — only the Playwright PDF path does.
            sandbox=""
            className="w-full aspect-[210/297] border border-zinc-800 rounded bg-white"
          />
        </div>
      </div>
    </div>
  )
}
