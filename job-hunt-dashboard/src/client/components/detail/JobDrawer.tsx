import { useState, useEffect, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Archive, ArchiveRestore, Wand2, FileText, Download, Pencil, Info, Ban, ChevronRight } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import type { Job } from '@shared/schemas'
import { ScoreBadge } from '../pipeline/ScoreBadge'
import { ActionChip } from '../pipeline/ActionChip'
import { AssessmentSection } from './AssessmentSection'
import { useJobEvents } from '../../hooks/useJobEvents'
import { StatusTimeline } from './StatusTimeline'
import { useGenerateCoverLetter } from '../../hooks/useGenerateCoverLetter'
import { useGenerateResume } from '../../hooks/useGenerateResume'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { useJobMutation } from '../../hooks/useJobMutation'
import { toast } from 'sonner'
import { useBlacklistQuery } from '../../hooks/useBlacklistQuery'
import { useAddToBlacklist, useRemoveFromBlacklist } from '../../hooks/useBlacklistMutations'
import { useSessionQuery } from '../../hooks/useSessionQuery'
import { cn } from '../../lib/utils'

const NO_STATUS = '__none__'
const APPLIED = 'Applied'
const STATUS_OPTIONS = [
  { value: NO_STATUS, label: 'No Status' },
  { value: APPLIED, label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'other', label: 'Other' },
]

function JobDetailFields({ job }: { job: Job }) {
  const left = [
    { label: 'Source', value: job.source },
    { label: 'Location', value: job.location },
    { label: 'Salary', value: job.salary },
  ].filter((f) => f.value)
  const right = [
    { label: 'Contact', value: job.contactName },
    { label: 'Email', value: job.contactEmail },
    { label: 'Phone', value: job.contactPhone },
  ].filter((f) => f.value)

  if (!left.length && !right.length && !job.benefits) return null

  return (
    <div className="space-y-1.5">
      {(left.length > 0 || right.length > 0) && (
        <div className="grid grid-cols-2 gap-x-6">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 content-start">
            {left.map(({ label, value }) => (
              <Fragment key={label}>
                <span className="text-xs text-zinc-500 uppercase tracking-wide self-center">{label}</span>
                <span className="text-sm text-zinc-200 break-all">{value}</span>
              </Fragment>
            ))}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 content-start">
            {right.map(({ label, value }) => (
              <Fragment key={label}>
                <span className="text-xs text-zinc-500 uppercase tracking-wide self-center">{label}</span>
                <span className="text-sm text-zinc-200 break-all">{value}</span>
              </Fragment>
            ))}
          </div>
        </div>
      )}
      {job.benefits && (
        <div className="grid grid-cols-[auto_1fr] gap-x-4">
          <span className="text-xs text-zinc-500 uppercase tracking-wide self-start pt-0.5">Benefits</span>
          <span className="text-sm text-zinc-200">{job.benefits}</span>
        </div>
      )}
    </div>
  )
}

interface JobDrawerProps {
  job: Job | null
  open: boolean
  onClose: () => void
}

export function JobDrawer({ job, open, onClose }: JobDrawerProps) {
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [descriptionSaveError, setDescriptionSaveError] = useState<string | null>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [contextDraft, setContextDraft] = useState('')
  const [contextSaveError, setContextSaveError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { data: events = [] } = useJobEvents(job?.id)
  const { mutate: generateCoverLetter, isPending, isError, error } = useGenerateCoverLetter(job?.id ?? 0)
  const { mutate: generateResume, isPending: isResumePending, isError: isResumeError, error: resumeError } = useGenerateResume(job?.id ?? 0)
  const { mutate: patchJob, isPending: isPatching } = useJobMutation(job?.id ?? 0)
  const { data: blacklist = [] } = useBlacklistQuery()
  const addToBlacklist = useAddToBlacklist()
  const removeFromBlacklist = useRemoveFromBlacklist()
  const { data: session } = useSessionQuery()
  const isImpersonating = !!session?.impersonating
  const panelOffset = isImpersonating ? 'top-24 h-[calc(100vh-96px)]' : 'top-14 h-[calc(100vh-56px)]'
  const backdropOffset = isImpersonating ? 'top-24' : 'top-14'

  useEffect(() => {
    setShowFullDescription(false)
    setEditingDescription(false)
    setContextOpen(false)
    setContextSaveError(null)
    // Seed the draft per job, not per open: collapsing the disclosure then reopening it must not
    // destroy text the user typed but has not saved. Cancel is the explicit discard.
    setContextDraft(job?.generationContext ?? '')
  }, [job?.id])

  useEffect(() => {
    if (editingDescription) textareaRef.current?.focus()
  }, [editingDescription])

  function startEdit() {
    setDescriptionDraft(job?.jobDescription ?? '')
    setDescriptionSaveError(null)
    setEditingDescription(true)
  }

  function saveEdit() {
    if (!job) return
    if (descriptionDraft === (job.jobDescription ?? '')) {
      setEditingDescription(false)
      return
    }
    setDescriptionSaveError(null)
    patchJob(
      { id: job.id, patch: { jobDescription: descriptionDraft || null } },
      {
        onSuccess: () => setEditingDescription(false),
        onError: (err) => setDescriptionSaveError(err.message ?? 'Failed to save'),
      },
    )
  }

  function cancelEdit() {
    setEditingDescription(false)
  }

  const contextDirty = !!job && contextDraft.trim() !== (job.generationContext ?? '')

  function toggleContext() {
    setContextSaveError(null)
    setContextOpen(!contextOpen)
  }

  function discardContext() {
    setContextDraft(job?.generationContext ?? '')
    setContextSaveError(null)
    setContextOpen(false)
  }

  function saveContext() {
    persistContext(() => setContextOpen(false))
  }

  // The note only has value if it reaches generation. Flush an unsaved note before generating,
  // otherwise "brief the writer, then generate" silently generates without the brief.
  function persistContext(onDone: () => void) {
    if (!job) return
    if (!contextDirty) {
      onDone()
      return
    }
    setContextSaveError(null)
    patchJob(
      { id: job.id, patch: { generationContext: contextDraft.trim() || null } },
      {
        onSuccess: () => onDone(),
        onError: (err) => setContextSaveError(err.message || 'Failed to save'),
      },
    )
  }

  const isBlacklisted = job ? blacklist.some(e => e.companyName === job.company.toLowerCase()) : false
  const blacklistEntry = job ? blacklist.find(e => e.companyName === job.company.toLowerCase()) : undefined

  return (
    <>
      {open && createPortal(
        <div
          aria-hidden
          onClick={onClose}
          className={cn('fixed inset-x-0 bottom-0 z-40 bg-black/80 animate-in fade-in-0 duration-300', backdropOffset)}
        />,
        document.body,
      )}
    <Sheet open={open} modal={false} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent
        side="right"
        className={cn('w-[720px] max-w-none flex flex-col p-0 bg-zinc-900 border-zinc-800', panelOffset)}
      >
        <SheetDescription className="sr-only">AI analysis and job details</SheetDescription>
        <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 p-4 shrink-0">
          <SheetHeader className="space-y-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{job?.company}</p>
            <SheetTitle className="text-lg font-semibold text-zinc-100 leading-snug">
              {job?.jobTitle}
            </SheetTitle>
            <div className="flex items-center gap-2 pt-1">
              {job?.fitScore !== null && job?.fitScore !== undefined && (
                <ScoreBadge score={job.fitScore} />
              )}
              {job?.recommendation && (
                <ActionChip recommendation={job.recommendation} />
              )}
            </div>
          </SheetHeader>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {job && (
            <div className="flex flex-wrap items-center gap-2">
              {job.sourceUrl && (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
                >
                  <ExternalLink size={13} />
                  Visit
                </a>
              )}
              <Select
                value={job.statusOverride ?? (job.applied ? APPLIED : NO_STATUS)}
                onValueChange={(value) => {
                  if (value === NO_STATUS) patchJob({ id: job.id, patch: { applied: false, statusOverride: null } })
                  else if (value === APPLIED) patchJob({ id: job.id, patch: { applied: true, statusOverride: null } })
                  else patchJob({ id: job.id, patch: { applied: true, statusOverride: value } })
                }}
                disabled={isPatching}
              >
                <SelectTrigger aria-label="Application status" className="h-auto w-[150px] gap-1.5 rounded-md border-zinc-700 bg-transparent px-3 py-1.5 text-sm text-zinc-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => patchJob({ id: job.id, patch: { archived: !job.archived } })}
                disabled={isPatching}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  job.archived
                    ? 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                    : 'border-zinc-700 text-zinc-400 hover:border-amber-700/60 hover:text-amber-400'
                }`}
              >
                {job.archived
                  ? <><ArchiveRestore size={13} />{isPatching ? 'Unarchiving…' : 'Unarchive'}</>
                  : <><Archive size={13} />{isPatching ? 'Archiving…' : 'Archive'}</>
                }
              </button>
              <button
                onClick={() => {
                  if (isBlacklisted && blacklistEntry) {
                    removeFromBlacklist.mutate(blacklistEntry.id, {
                      onSuccess: () => toast.success(`${job.company} removed from blacklist`),
                      onError: (err: Error) => toast.error(err.message),
                    })
                  } else {
                    addToBlacklist.mutate(
                      { companyName: job.company },
                      {
                        onSuccess: () => toast.success(`Added ${job.company} to blacklist`),
                        onError: (err: Error) => toast.error(err.message),
                      },
                    )
                  }
                }}
                disabled={addToBlacklist.isPending || removeFromBlacklist.isPending}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isBlacklisted
                    ? 'border-red-700/60 text-red-400 hover:border-zinc-600 hover:text-zinc-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-red-700/60 hover:text-red-400'
                }`}
              >
                <Ban size={13} />
                {isBlacklisted ? 'Remove from Blacklist' : 'Add Company to Blacklist'}
              </button>
            </div>
          )}
          {job && <JobDetailFields job={job} />}
          {job && <StatusTimeline events={events} />}
          <Tabs defaultValue="analysis" className="mt-2">
            <TabsList className="w-full bg-zinc-800 border border-zinc-700">
              <TabsTrigger value="analysis" className="flex-1">Analysis</TabsTrigger>
              <TabsTrigger value="description" className="flex-1">Description</TabsTrigger>
              <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
            </TabsList>
            <TabsContent value="analysis" className="pt-4">
              <div className="flex flex-row gap-4 mb-4">
                <div className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">Relevance Score</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info size={12} aria-label="About Relevance Score" className="cursor-help text-zinc-600 hover:text-zinc-400" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px]">
                          <p>Similarity between this job title and your resume, scored at discovery using a self-hosted embedding model</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-medium text-zinc-200">
                    {job?.relevanceScore != null ? job.relevanceScore.toFixed(2) : '—'}
                  </p>
                </div>
                <div className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">Fit Score</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info size={12} aria-label="About Fit Score" className="cursor-help text-zinc-600 hover:text-zinc-400" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px]">
                          <p>AI analysis score based on the full job description and your resume</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-medium text-zinc-200">
                    {job?.fitScore != null ? job.fitScore : '—'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 items-start">
                <AssessmentSection label="Job Meets Expectations" content={job?.jobReqsMet ?? null} defaultMet tooltip="Ways this role fits your preferences — arrangement, location, language, pay, company. Not about your skills." />
                <AssessmentSection label="Job Falls Short" content={job?.jobReqsMissed ?? null} defaultMet={false} tooltip="Ways this role misses your preferences." />
                <AssessmentSection label="Requirements Met" content={job?.candidateReqsMet ?? null} defaultMet tooltip="Job requirements you satisfy — skills, experience, education, certifications." />
                <AssessmentSection label="Requirements Missed" content={job?.candidateReqsMissed ?? null} defaultMet={false} tooltip="Job requirements you're missing." />
              </div>
            </TabsContent>
            <TabsContent value="description" className="pt-4">
              {editingDescription ? (
                <div className="space-y-2">
                  <textarea
                    ref={textareaRef}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    maxLength={100000}
                    className="w-full min-h-[300px] bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={isPatching}
                      className="px-3 py-1.5 rounded-md bg-zinc-700 border border-zinc-600 text-sm text-zinc-100 hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPatching ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={isPatching}
                      className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    {descriptionSaveError && (
                      <p className="text-xs text-red-400">{descriptionSaveError}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <button
                      onClick={startEdit}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-700 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                      <Pencil size={11} />
                      Edit
                    </button>
                  </div>
                  {job?.jobDescription ? (
                    <>
                      <p className="text-sm text-zinc-200 leading-relaxed">
                        {showFullDescription
                          ? job.jobDescription
                          : job.jobDescription.slice(0, 300)}
                        {!showFullDescription && job.jobDescription.length > 300 && '…'}
                      </p>
                      {job.jobDescription.length > 300 && (
                        <button
                          className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
                          onClick={() => setShowFullDescription(!showFullDescription)}
                        >
                          {showFullDescription ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500 italic">No job description available.</p>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="documents" className="pt-4">
              {/* Anything else I should know? — one note per job, shared by both documents.
                  Sits above the grid: brief the writer, then generate. */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={toggleContext}
                  className="flex w-full items-center gap-1.5 text-xs text-zinc-500 uppercase tracking-wide hover:text-zinc-300 transition-colors"
                >
                  <ChevronRight
                    size={12}
                    className={cn('transition-transform', contextOpen && 'rotate-90')}
                  />
                  Anything else I should know?
                  {!contextOpen && job?.generationContext && (
                    <span className="ml-auto min-w-0 truncate normal-case tracking-normal text-zinc-600">
                      {job.generationContext}
                    </span>
                  )}
                </button>
                {contextOpen && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={contextDraft}
                      onChange={(e) => setContextDraft(e.target.value)}
                      maxLength={5000}
                      placeholder="Referrals, anecdotes, what to stress."
                      className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-none placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveContext}
                        disabled={isPatching}
                        className="px-3 py-1.5 rounded-md bg-zinc-700 border border-zinc-600 text-sm text-zinc-100 hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPatching ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={discardContext}
                        disabled={isPatching}
                        className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      {contextSaveError && (
                        <p className="text-xs text-red-400">{contextSaveError}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Cover Letter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between min-h-[20px]">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Cover Letter</p>
                    {job?.coverLetterSentAt && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-zinc-600">{new Date(job.coverLetterSentAt).toLocaleDateString()}</p>
                        <a
                          href={`/api/jobs/${job.id}/cover-letter/pdf?t=${job.coverLetterSentAt}`}
                          download
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        >
                          <Download size={11} /> Download
                        </a>
                      </div>
                    )}
                  </div>
                  {job?.jobDescription ? (
                    <button
                      onClick={() => persistContext(() => generateCoverLetter())}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Wand2 size={13} />
                      {isPending ? 'Generating…' : job?.coverLetterSentAt ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}
                    </button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-600 cursor-not-allowed select-none">
                            <Wand2 size={13} />
                            Generate Cover Letter
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>No job description available</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {isError && (
                    <p className="text-xs text-red-400">{error?.message ?? 'Generation failed'}</p>
                  )}
                  {job?.coverLetterSentAt ? (
                    <iframe
                      src={`/api/jobs/${job.id}/cover-letter/pdf?t=${job.coverLetterSentAt}`}
                      className="w-full aspect-[210/297] border border-zinc-800 rounded"
                      title="Cover letter preview"
                    />
                  ) : (
                    <div className="w-full aspect-[210/297] border border-zinc-800 rounded flex items-center justify-center bg-zinc-900">
                      <p className="text-xs text-zinc-600 text-center px-4">Generate a cover letter to see a preview</p>
                    </div>
                  )}
                </div>

                {/* Resume */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between min-h-[20px]">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Resume</p>
                    {job?.resumeGeneratedAt && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-zinc-600">{new Date(job.resumeGeneratedAt).toLocaleDateString()}</p>
                        <a
                          href={`/api/jobs/${job.id}/resume`}
                          download
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        >
                          <Download size={11} /> Download
                        </a>
                      </div>
                    )}
                  </div>
                  {job?.jobDescription ? (
                    <button
                      onClick={() => persistContext(() => generateResume())}
                      disabled={isResumePending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileText size={13} />
                      {isResumePending ? 'Generating…' : job?.resumeGeneratedAt ? 'Regenerate Resume' : 'Generate Resume'}
                    </button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-600 cursor-not-allowed select-none">
                            <FileText size={13} />
                            Generate Resume
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>No job description available</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {isResumeError && (
                    <p className="text-xs text-red-400">{resumeError?.message ?? 'Resume generation failed'}</p>
                  )}
                  {job?.resumeGeneratedAt ? (
                    <iframe
                      src={`/api/jobs/${job.id}/resume`}
                      className="w-full aspect-[210/297] border border-zinc-800 rounded"
                      title="Resume preview"
                    />
                  ) : (
                    <div className="w-full aspect-[210/297] border border-zinc-800 rounded flex items-center justify-center bg-zinc-900">
                      <p className="text-xs text-zinc-600 text-center px-4">Generate a resume to see a preview</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
    </>
  )
}
