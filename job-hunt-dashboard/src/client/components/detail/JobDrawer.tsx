import { useState, useEffect } from 'react'
import { ExternalLink, Archive, ArchiveRestore, Wand2, Copy } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { Separator } from '../ui/separator'
import type { Job } from '@shared/schemas'
import { ScoreBadge } from '../pipeline/ScoreBadge'
import { ActionChip } from '../pipeline/ActionChip'
import { AssessmentSection } from './AssessmentSection'
import { StatusDropdown } from './StatusDropdown'
import { useJobEvents } from '../../hooks/useJobEvents'
import { StatusTimeline } from './StatusTimeline'
import { useGenerateCoverLetter } from '../../hooks/useGenerateCoverLetter'
import { useCoverLetterQuery } from '../../hooks/useCoverLetterQuery'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { useJobMutation } from '../../hooks/useJobMutation'

interface JobDrawerProps {
  job: Job | null
  open: boolean
  onClose: () => void
}

export function JobDrawer({ job, open, onClose }: JobDrawerProps) {
  const [showFullDescription, setShowFullDescription] = useState(false)
  const { data: events = [] } = useJobEvents(job?.id)
  const { mutate: generateCoverLetter, isPending, isError, error } = useGenerateCoverLetter(job?.id ?? 0)
  const { mutate: patchJob, isPending: isArchiving } = useJobMutation(job?.id ?? 0)
  const { data: coverLetter } = useCoverLetterQuery(
    job?.id ?? 0,
    !!job?.coverLetterSentAt
  )

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
              {job.jobDescription ? (
                <button
                  onClick={() => generateCoverLetter()}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wand2 size={13} />
                  {isPending ? 'Generating…' : job.coverLetterSentAt ? 'Regenerate' : 'Cover Letter'}
                </button>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-600 cursor-not-allowed select-none">
                        <Wand2 size={13} />
                        Cover Letter
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>No job description available</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isError && (
                <p className="w-full text-xs text-red-400">{error?.message ?? 'Generation failed'}</p>
              )}
            </div>
          )}
          {job && <StatusDropdown job={job} />}
          {job && <StatusTimeline events={events} />}
          <Separator className="bg-zinc-800" />
          <AssessmentSection label="Role Fit" content={job?.roleFit ?? null} />
          <AssessmentSection label="Requirements Met" content={job?.requirementsMet ?? null} />
          <AssessmentSection label="Requirements Missed" content={job?.requirementsMissed ?? null} />
          <AssessmentSection label="Red Flags" content={job?.redFlags ?? null} />
          {job?.jobDescription && (
            <>
              <Separator className="bg-zinc-800" />
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Job Description</p>
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
            </>
          )}
          {coverLetter && (
            <>
              <Separator className="bg-zinc-800" />
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">Cover Letter</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-zinc-600">{new Date(coverLetter.createdAt).toLocaleDateString()}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(coverLetter.content)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      <Copy size={11} />
                      Copy
                    </button>
                  </div>
                </div>
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans leading-relaxed">
                  {coverLetter.content}
                </pre>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
