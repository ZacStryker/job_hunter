import { useState, useMemo, useRef, useEffect } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { useJobsQuery } from '../hooks/useJobsQuery'
import { useProfileQuery } from '../hooks/useProfileQuery'
import { useCoverLetterQuery } from '../hooks/useCoverLetterQuery'
import { useCoverLetterMutation } from '../hooks/useCoverLetterMutation'
import { useResumeDataQuery } from '../hooks/useResumeDataQuery'
import { useResumeMutation } from '../hooks/useResumeMutation'
import { useResumeTemplateQuery } from '../hooks/useResumeTemplateQuery'
import { buildCoverLetterHtml } from '@shared/cover-letter-html'
import { buildResumeHtml } from '@shared/resume-html'
import { COVER_LETTER_MAX_CHARS } from '@shared/schemas'
import type { Job, ResumeData } from '@shared/schemas'

// The only routes that host JobDrawer, so the only places Back can meaningfully return to.
const BACK_TARGETS = ['/', '/applications', '/archive', '/matches'] as const

// A focused mode, not a new visual language: same zinc surfaces, same type scale, and the preview
// keeps the drawer's `border border-zinc-800 rounded` treatment so it reads as the same object the
// drawer just showed.
export function DocumentsRoute() {
  const { jobId, docType } = useParams({ from: '/_protected/documents/$jobId/$docType' })
  const { from } = useSearch({ from: '/_protected/documents/$jobId/$docType' })
  const id = Number(jobId)

  const { data: jobs = [], isLoading: jobsLoading } = useJobsQuery()
  const job = jobs.find((j) => j.id === id)

  // `from` arrives from the URL, so it is user-supplied. Allowlist it to the four routes that
  // actually host the drawer rather than feeding an arbitrary string into <Link to={...}>.
  const backTo = from && (BACK_TARGETS as readonly string[]).includes(from) ? from : '/'

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
  if (!Number.isInteger(id) || id <= 0 || (!jobsLoading && !job)) {
    return (
      <div className="p-6 space-y-4">
        {backLink}
        <p className="text-sm text-zinc-500">Job not found.</p>
      </div>
    )
  }

  if (docType === 'cover-letter') {
    return <CoverLetterEditor id={id} backLink={backLink} />
  }

  if (docType === 'resume') {
    return <ResumeEditor id={id} job={job} jobsLoading={jobsLoading} backLink={backLink} />
  }

  return (
    <div className="p-6 space-y-4">
      {backLink}
      <p className="text-sm text-zinc-500">This document is not editable.</p>
    </div>
  )
}

// ── Cover letter ────────────────────────────────────────────────────────────────────────────────

function CoverLetterEditor({ id, backLink }: { id: number; backLink: React.ReactNode }) {
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

  // Every guard below used to read `!isLoading && …`, so during the initial fetch execution fell
  // through to the editor with an EMPTY textarea. Typing into that and saving would have written a
  // blank-ish letter over a real one.
  if (isLoading) {
    return <Shell backLink={backLink}><p className="text-sm text-zinc-500">Loading…</p></Shell>
  }

  // A failed fetch is NOT an absent letter. Collapsing the two would tell a user who has a letter
  // that they have none — and the obvious next move, Generate, burns a real Anthropic call to
  // "fix" what was only a transient read error.
  if (loadFailed) {
    return <Shell backLink={backLink}><p className="text-sm text-red-400">Could not load this cover letter. Reload to try again.</p></Shell>
  }

  if (!letter) {
    return <Shell backLink={backLink}><p className="text-sm text-zinc-500">Generate a cover letter first — there is nothing to edit yet.</p></Shell>
  }

  return (
    <div className="p-6 space-y-4">
      <EditorHeader
        backLink={backLink}
        isDirty={isDirty}
        isPending={isPending}
        isError={isError}
        errorMessage={error?.message}
        confirmingDiscard={confirmingDiscard}
        onDiscard={handleDiscard}
        onDiscardBlur={() => setConfirmingDiscard(false)}
        onSave={handleSave}
      />

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
            // future escaping gap cannot become script execution in the app's origin. The cover
            // letter's HTML is inert, so it needs no scripts — unlike the resume's.
            sandbox=""
            className="w-full aspect-[210/297] border border-zinc-800 rounded bg-white"
          />
        </div>
      </div>
    </div>
  )
}

// ── Resume ──────────────────────────────────────────────────────────────────────────────────────

function ResumeEditor({ id, job, jobsLoading, backLink }: { id: number; job: Job | undefined; jobsLoading: boolean; backLink: React.ReactNode }) {
  const { data: stored, isLoading, isError: loadFailed, error: loadError } = useResumeDataQuery(id)
  const { data: template, isLoading: templateLoading, isError: templateFailed } = useResumeTemplateQuery()
  const { mutate: save, isPending, isError, error, reset } = useResumeMutation(id)

  const [draft, setDraft] = useState<ResumeData | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const saved = stored?.data ?? null
  const current = draft ?? saved
  // Structural compare: the form rebuilds nested objects on every keystroke, so reference equality
  // would call an untouched form dirty the moment any field is focused and re-set to its own value.
  const isDirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)

  const previewHtml = useMemo(() => {
    if (!current || !template) return ''
    try {
      return buildResumeHtml(current, template)
    } catch {
      return ''
    }
  }, [current, template])

  function handleSave() {
    if (!current) return
    const submitted = current
    save({ data: submitted }, {
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

  // jobsLoading is part of the gate, not decoration: `job.resumeGeneratedAt` is the ONLY thing that
  // tells a legacy resume apart from one that was never generated. If resume-data 404s before the
  // jobs query resolves, `job` is undefined and a legacy user is told "Generate a resume first"
  // while looking at a preview of the resume they already have.
  if (isLoading || templateLoading || jobsLoading) {
    return <Shell backLink={backLink}><p className="text-sm text-zinc-500">Loading…</p></Shell>
  }

  // A failed fetch is NOT an absent resume — and a 422 (a stored version that no longer validates
  // against the tightened schema) is neither. Both must say so rather than showing an empty form.
  if (loadFailed) {
    return (
      <Shell backLink={backLink}>
        <p className="text-sm text-red-400">{loadError?.message || 'Could not load this resume. Reload to try again.'}</p>
      </Shell>
    )
  }

  if (templateFailed || !template) {
    return <Shell backLink={backLink}><p className="text-sm text-red-400">Could not load the resume template. Reload to try again.</p></Shell>
  }

  // LEGACY vs NEVER-GENERATED. Both have zero resumes rows, so a row count cannot tell them apart —
  // jobs.resumeGeneratedAt is the only discriminator. Get this wrong and every user who generated a
  // resume before this feature shipped is told they have no resume while looking at a preview of one.
  if (!stored) {
    return (
      <Shell backLink={backLink}>
        {job?.resumeGeneratedAt ? (
          <p className="text-sm text-zinc-500">
            This resume was generated before editing existed — regenerate it to make it editable.
            Your current resume and its download still work.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Generate a resume first — there is nothing to edit yet.</p>
        )}
      </Shell>
    )
  }

  if (!current) {
    return <Shell backLink={backLink}><p className="text-sm text-zinc-500">Generate a resume first — there is nothing to edit yet.</p></Shell>
  }

  return (
    <div className="p-6 space-y-4">
      <EditorHeader
        backLink={backLink}
        isDirty={isDirty}
        isPending={isPending}
        isError={isError}
        errorMessage={error?.message}
        confirmingDiscard={confirmingDiscard}
        onDiscard={handleDiscard}
        onDiscardBlur={() => setConfirmingDiscard(false)}
        onSave={handleSave}
      />

      <div className="grid grid-cols-2 gap-4 items-start">
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Edit</p>
          <ResumeForm data={current} disabled={isPending} onChange={setDraft} />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Preview</p>
          <ResumePreview html={previewHtml} />
        </div>
      </div>
    </div>
  )
}

// The template's page is a RIGID 794×1123px box (the cover letter's fluid HTML is why its unscaled
// aspect-[210/297] iframe works and why that treatment does not transfer here). Dropped into a
// ~500px pane as-is the user would see the top-left corner at 100% zoom. So: scale the document to
// the pane width, and let the pane scroll — the pagination engine emits one or TWO stacked pages,
// and page 2 must not be lost below the fold.
//
// These constants mirror the template's own layout (body: padding 36px 16px 48px, gap 28px).
const PAGE_W = 794
const PAGE_H = 1123
const BODY_PAD_X = 16
const BODY_PAD_TOP = 36
const BODY_PAD_BOTTOM = 48
const PAGE_GAP = 28
const DOC_W = PAGE_W + BODY_PAD_X * 2

function docHeight(pages: number): number {
  return BODY_PAD_TOP + pages * PAGE_H + (pages - 1) * PAGE_GAP + BODY_PAD_BOTTOM
}

// The iframe is sandboxed to an OPAQUE origin, so the parent cannot read its DOM to measure it. The
// template already announces its own page count (`pagination:complete`), so we relay it out with a
// postMessage from a preview-only reporter script. It changes nothing about layout or pagination —
// it only tells us whether to size the frame for one page or two.
const PAGE_REPORTER = `
<script>
(function () {
  function post() {
    parent.postMessage({ type: 'resume-preview-pages', pages: window.__resumePageCount || 1 }, '*');
  }
  if (window.__paginationComplete) post();
  document.addEventListener('pagination:complete', post);
})();
</script>`

function ResumePreview({ html }: { html: string }) {
  const paneRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(0.5)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const ro = new ResizeObserver(() => {
      if (pane.clientWidth > 0) setScale(pane.clientWidth / DOC_W)
    })
    ro.observe(pane)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only ever trust our own frame. The sandboxed document has an opaque origin, so an origin
      // check is useless here — identity of the source window is the check that means something.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return
      const d = e.data as { type?: string; pages?: number } | null
      if (d?.type === 'resume-preview-pages' && (d.pages === 1 || d.pages === 2)) setPages(d.pages)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const h = docHeight(pages)

  return (
    <div
      ref={paneRef}
      className="w-full overflow-auto border border-zinc-800 rounded bg-zinc-900"
      style={{ maxHeight: '78vh' }}
    >
      {/* Reserves the SCALED footprint. transform: scale() does not affect layout, so without this
          wrapper the parent would still reserve the full 826px-wide box and the pane would scroll
          horizontally over empty space. */}
      <div style={{ width: DOC_W * scale, height: h * scale }}>
        <iframe
          ref={iframeRef}
          srcDoc={html ? html + PAGE_REPORTER : ''}
          title="Resume preview"
          // MUST allow scripts: the template is self-rendering and generatePdf itself blocks on
          // window.__paginationComplete, so sandbox="" would yield a blank page rather than a
          // preview. NEVER add allow-same-origin — combined with allow-scripts that is equivalent to
          // no sandbox at all, and this document is built from user-typed fields.
          //
          // Note the sandbox hardens the PREVIEW only. The PDF path runs this same HTML through
          // Playwright with no sandbox whatsoever, so the escaping in buildResumeHtml — not this
          // attribute — is the actual control.
          sandbox="allow-scripts"
          style={{
            width: DOC_W,
            height: h,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 0,
            display: 'block',
          }}
        />
      </div>
    </div>
  )
}

// ── Resume form ─────────────────────────────────────────────────────────────────────────────────

interface FormProps {
  data: ResumeData
  disabled: boolean
  onChange: (next: ResumeData) => void
}

// A resume is a structured document, not prose: nine scalars plus four arrays, one of which holds
// objects that each hold an array of strings. There is no <textarea> that edits that safely — and
// exposing the raw JSON in one would be a WORSE failure than the one this feature fixes (one stray
// comma and the resume will not parse, and it asks a job-seeker to hand-edit JSON). So: real fields.
//
// Reordering is deliberately out of scope — no drag-and-drop, and no up/down buttons either. Add
// appends; remove deletes in place.
function ResumeForm({ data, disabled, onChange }: FormProps) {
  function set<K extends keyof ResumeData>(key: K, value: ResumeData[K]) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-5 max-h-[78vh] overflow-auto pr-2">
      <Section title="Identity">
        <div className="grid grid-cols-2 gap-2">
          <Field label="First name" value={data.first_name} disabled={disabled} onChange={(v) => set('first_name', v)} />
          <Field label="Last name" value={data.last_name} disabled={disabled} onChange={(v) => set('last_name', v)} />
          <Field label="Title 1" value={data.title_01} disabled={disabled} onChange={(v) => set('title_01', v)} />
          {/* The template cannot render "and" or "&" here. That is a RENDERING rule, so it binds the
              user's typing exactly as it binds the model's — and the server rejects it either way. */}
          <Field label='Title 2 (no "and" or "&")' value={data.title_02} disabled={disabled} onChange={(v) => set('title_02', v)} />
          <Field label="Email" value={data.email} disabled={disabled} onChange={(v) => set('email', v)} />
          <Field label="Location" value={data.location} disabled={disabled} onChange={(v) => set('location', v)} />
          <Field label="Website" value={data.website} disabled={disabled} onChange={(v) => set('website', v)} />
          <Field label="LinkedIn" value={data.linkedin} disabled={disabled} onChange={(v) => set('linkedin', v)} />
        </div>
      </Section>

      <Section title="Summary">
        <textarea
          value={data.summary}
          onChange={(e) => set('summary', e.target.value)}
          disabled={disabled}
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-60"
        />
      </Section>

      <Section
        title="Skills"
        onAdd={() => set('skill_groups', [...data.skill_groups, { label: '', skills: [] }])}
        addLabel="Add group"
        disabled={disabled}
      >
        {data.skill_groups.map((group, gi) => (
          <Item
            key={gi}
            onRemove={() => set('skill_groups', data.skill_groups.filter((_, i) => i !== gi))}
            disabled={disabled}
          >
            <Field
              label="Group"
              value={group.label}
              disabled={disabled}
              onChange={(v) => set('skill_groups', data.skill_groups.map((g, i) => i === gi ? { ...g, label: v } : g))}
            />
            <div className="space-y-1">
              {group.skills.map((skill, si) => (
                <div key={si} className="flex items-center gap-1">
                  <input
                    value={skill}
                    disabled={disabled}
                    onChange={(e) => set('skill_groups', data.skill_groups.map((g, i) =>
                      i === gi ? { ...g, skills: g.skills.map((s, j) => j === si ? e.target.value : s) } : g
                    ))}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-60"
                  />
                  <RemoveButton
                    disabled={disabled}
                    onClick={() => set('skill_groups', data.skill_groups.map((g, i) =>
                      i === gi ? { ...g, skills: g.skills.filter((_, j) => j !== si) } : g
                    ))}
                  />
                </div>
              ))}
              <AddButton
                label="Add skill"
                disabled={disabled}
                onClick={() => set('skill_groups', data.skill_groups.map((g, i) =>
                  i === gi ? { ...g, skills: [...g.skills, ''] } : g
                ))}
              />
            </div>
          </Item>
        ))}
      </Section>

      <Section
        title="Experience"
        onAdd={() => set('experience', [...data.experience, { company: '', location: '', dates: '', role: '', bullets: [''] }])}
        addLabel="Add role"
        disabled={disabled}
      >
        {data.experience.map((entry, ei) => (
          <Item
            key={ei}
            // experience is .min(1) — the last one cannot go. Disabled as a COURTESY; the server
            // enforces it regardless, because the form is not the security boundary.
            onRemove={() => set('experience', data.experience.filter((_, i) => i !== ei))}
            disabled={disabled}
            removeDisabled={data.experience.length <= 1}
          >
            <div className="grid grid-cols-2 gap-2">
              <Field label="Company" value={entry.company} disabled={disabled}
                onChange={(v) => set('experience', data.experience.map((e, i) => i === ei ? { ...e, company: v } : e))} />
              <Field label="Role" value={entry.role} disabled={disabled}
                onChange={(v) => set('experience', data.experience.map((e, i) => i === ei ? { ...e, role: v } : e))} />
              <Field label="Location" value={entry.location} disabled={disabled}
                onChange={(v) => set('experience', data.experience.map((e, i) => i === ei ? { ...e, location: v } : e))} />
              <Field label="Dates" value={entry.dates} disabled={disabled}
                onChange={(v) => set('experience', data.experience.map((e, i) => i === ei ? { ...e, dates: v } : e))} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-zinc-500">Bullets</span>
              {entry.bullets.map((bullet, bi) => (
                <div key={bi} className="flex items-start gap-1">
                  <textarea
                    value={bullet}
                    disabled={disabled}
                    rows={2}
                    onChange={(e) => set('experience', data.experience.map((x, i) =>
                      i === ei ? { ...x, bullets: x.bullets.map((b, j) => j === bi ? e.target.value : b) } : x
                    ))}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-60"
                  />
                  {/* bullets is .min(1) too — same courtesy, same server-side enforcement. */}
                  <RemoveButton
                    disabled={disabled || entry.bullets.length <= 1}
                    onClick={() => set('experience', data.experience.map((x, i) =>
                      i === ei ? { ...x, bullets: x.bullets.filter((_, j) => j !== bi) } : x
                    ))}
                  />
                </div>
              ))}
              <AddButton
                label="Add bullet"
                disabled={disabled}
                onClick={() => set('experience', data.experience.map((x, i) =>
                  i === ei ? { ...x, bullets: [...x.bullets, ''] } : x
                ))}
              />
            </div>
          </Item>
        ))}
      </Section>

      <Section
        title="Education"
        onAdd={() => set('education', [...data.education, { school: '', degree: '', year: '' }])}
        addLabel="Add education"
        disabled={disabled}
      >
        {data.education.map((entry, ei) => (
          <Item
            key={ei}
            onRemove={() => set('education', data.education.filter((_, i) => i !== ei))}
            disabled={disabled}
          >
            <div className="grid grid-cols-3 gap-2">
              <Field label="School" value={entry.school} disabled={disabled}
                onChange={(v) => set('education', data.education.map((e, i) => i === ei ? { ...e, school: v } : e))} />
              <Field label="Degree" value={entry.degree} disabled={disabled}
                onChange={(v) => set('education', data.education.map((e, i) => i === ei ? { ...e, degree: v } : e))} />
              <Field label="Year" value={entry.year} disabled={disabled}
                onChange={(v) => set('education', data.education.map((e, i) => i === ei ? { ...e, year: v } : e))} />
            </div>
          </Item>
        ))}
      </Section>

      {/* Tailoring a resume to a job means being able to DROP an irrelevant project — that is why
          add/remove is in this cut at all, and why these arrays may legitimately go empty. */}
      <Section
        title="Projects"
        onAdd={() => set('projects', [...data.projects, { name: '', desc: '', stack: '', url: '' }])}
        addLabel="Add project"
        disabled={disabled}
      >
        {data.projects.map((entry, pi) => (
          <Item
            key={pi}
            onRemove={() => set('projects', data.projects.filter((_, i) => i !== pi))}
            disabled={disabled}
          >
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name" value={entry.name} disabled={disabled}
                onChange={(v) => set('projects', data.projects.map((p, i) => i === pi ? { ...p, name: v } : p))} />
              <Field label="Stack" value={entry.stack} disabled={disabled}
                onChange={(v) => set('projects', data.projects.map((p, i) => i === pi ? { ...p, stack: v } : p))} />
            </div>
            <Field label="URL" value={entry.url} disabled={disabled}
              onChange={(v) => set('projects', data.projects.map((p, i) => i === pi ? { ...p, url: v } : p))} />
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Description</span>
              <textarea
                value={entry.desc}
                disabled={disabled}
                rows={2}
                onChange={(e) => set('projects', data.projects.map((p, i) => i === pi ? { ...p, desc: e.target.value } : p))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-60"
              />
            </label>
          </Item>
        ))}
      </Section>
    </div>
  )
}

// ── Shared pieces ───────────────────────────────────────────────────────────────────────────────

function Shell({ backLink, children }: { backLink: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-6 space-y-4">
      {backLink}
      {children}
    </div>
  )
}

interface HeaderProps {
  backLink: React.ReactNode
  isDirty: boolean
  isPending: boolean
  isError: boolean
  errorMessage?: string
  confirmingDiscard: boolean
  onDiscard: () => void
  onDiscardBlur: () => void
  onSave: () => void
}

function EditorHeader({
  backLink, isDirty, isPending, isError, errorMessage, confirmingDiscard, onDiscard, onDiscardBlur, onSave,
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between">
      {backLink}
      <div className="flex items-center gap-3">
        {isDirty && <span className="text-xs text-zinc-500">unsaved changes</span>}
        {isError && <span className="text-xs text-red-400">{errorMessage || 'Failed to save'}</span>}
        {isDirty && (
          // The one genuinely irreversible act here is discarding UNSAVED edits, so it is the one
          // thing that gets a confirmation — but inline, in place. The UX spec bans modals, and Save
          // needs no guard because it inserts a new version and the old one stays restorable.
          <button
            onClick={onDiscard}
            onBlur={onDiscardBlur}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmingDiscard ? 'Discard changes?' : 'Discard'}
          </button>
        )}
        <button
          onClick={onSave}
          disabled={!isDirty || isPending}
          className="px-3 py-1.5 rounded-md bg-zinc-700 border border-zinc-600 text-sm text-zinc-100 hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving…' : 'Save & Re-render'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children, onAdd, addLabel, disabled }: {
  title: string
  children?: React.ReactNode
  onAdd?: () => void
  addLabel?: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 uppercase tracking-wide">{title}</p>
        {onAdd && <AddButton label={addLabel ?? 'Add'} disabled={!!disabled} onClick={onAdd} />}
      </div>
      {children}
    </div>
  )
}

function Item({ children, onRemove, disabled, removeDisabled }: {
  children: React.ReactNode
  onRemove: () => void
  disabled: boolean
  removeDisabled?: boolean
}) {
  return (
    <div className="relative space-y-2 border border-zinc-800 rounded p-2 pr-7">
      <div className="absolute right-1 top-1">
        <RemoveButton disabled={disabled || !!removeDisabled} onClick={onRemove} />
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, disabled }: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-60"
      />
    </label>
  )
}

// Zinc ghosts. Colour is reserved for score badges, so new affordances get none.
function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Plus size={11} /> {label}
    </button>
  )
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove"
      className="inline-flex items-center justify-center p-1 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <X size={11} />
    </button>
  )
}
