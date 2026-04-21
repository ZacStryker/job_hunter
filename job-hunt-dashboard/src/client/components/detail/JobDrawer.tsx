import { useState, useEffect, Fragment } from 'react'
import { ExternalLink, Archive, ArchiveRestore, Wand2, FileText, Download, CheckCircle, Circle } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
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
  const { data: events = [] } = useJobEvents(job?.id)
  const { mutate: generateCoverLetter, isPending, isError, error } = useGenerateCoverLetter(job?.id ?? 0)
  const { mutate: generateResume, isPending: isResumePending, isError: isResumeError, error: resumeError } = useGenerateResume(job?.id ?? 0)
  const { mutate: patchJob, isPending: isArchiving } = useJobMutation(job?.id ?? 0)

  useEffect(() => {
    setShowFullDescription(false)
  }, [job?.id])

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent
        side="right"
        className="w-[720px] max-w-none flex flex-col p-0 bg-zinc-900 border-zinc-800"
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
              <button
                onClick={() => patchJob({ id: job.id, patch: { applied: !job.applied, statusOverride: null } })}
                disabled={isArchiving}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  job.applied
                    ? 'border-emerald-700/60 text-emerald-400 hover:border-zinc-600 hover:text-zinc-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-emerald-700/60 hover:text-emerald-400'
                }`}
              >
                {job.applied
                  ? <><CheckCircle size={13} />Applied</>
                  : <><Circle size={13} />Mark Applied</>
                }
              </button>
              <button
                onClick={() => patchJob({ id: job.id, patch: { archived: !job.archived } })}
                disabled={isArchiving}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  job.archived
                    ? 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                    : 'border-zinc-700 text-zinc-400 hover:border-amber-700/60 hover:text-amber-400'
                }`}
              >
                {job.archived
                  ? <><ArchiveRestore size={13} />{isArchiving ? 'Unarchiving…' : 'Unarchive'}</>
                  : <><Archive size={13} />{isArchiving ? 'Archiving…' : 'Archive'}</>
                }
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
              <div className="grid grid-cols-2 gap-4 items-start">
                <AssessmentSection label="Role Fit" content={job?.roleFit ?? null} />
                <AssessmentSection label="Red Flags" content={job?.redFlags ?? null} />
                <AssessmentSection label="Requirements Met" content={job?.requirementsMet ?? null} />
                <AssessmentSection label="Requirements Missed" content={job?.requirementsMissed ?? null} />
              </div>
            </TabsContent>
            <TabsContent value="description" className="pt-4">
              {job?.jobDescription ? (
                <div className="space-y-2">
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
                </div>
              ) : (
                <p className="text-sm text-zinc-500 italic">No job description available.</p>
              )}
            </TabsContent>
            <TabsContent value="documents" className="pt-4">
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
                      onClick={() => generateCoverLetter()}
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
                      onClick={() => generateResume()}
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
  )
}
