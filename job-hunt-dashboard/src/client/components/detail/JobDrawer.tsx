import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
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
        className="w-[480px] max-w-none flex flex-col p-0 bg-zinc-900 border-zinc-800"
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
          <AssessmentSection label="Role Fit" content={job?.roleFit ?? null} />
          <AssessmentSection label="Requirements Met" content={job?.requirementsMet ?? null} />
          <AssessmentSection label="Requirements Missed" content={job?.requirementsMissed ?? null} />
          <AssessmentSection label="Red Flags" content={job?.redFlags ?? null} />
          <Separator className="bg-zinc-800" />
          {job?.jobDescription && (
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
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => setShowFullDescription(!showFullDescription)}
                >
                  {showFullDescription ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          {job?.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
            >
              <ExternalLink size={14} />
              Source
            </a>
          )}
          {(job?.jobDescription || job?.sourceUrl) && <Separator className="bg-zinc-800" />}
          {job && <StatusDropdown job={job} />}
          {job && <StatusTimeline events={events} />}
          {job && (
            <>
              <Separator className="bg-zinc-800" />
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Cover Letter</p>
                {job.jobDescription ? (
                  <>
                    <button
                      onClick={() => generateCoverLetter()}
                      disabled={isPending}
                      className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPending ? 'Generating…' : job.coverLetterSentAt ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}
                    </button>
                    {isError && (
                      <p className="text-xs text-red-400">{error?.message ?? 'Generation failed'}</p>
                    )}
                  </>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          disabled
                          className="text-sm text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Generate Cover Letter
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>No job description available</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {coverLetter && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-600">Generated {new Date(coverLetter.createdAt).toLocaleDateString()}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(coverLetter.content)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans leading-relaxed">
                      {coverLetter.content}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
          {job && (
            <>
              <Separator className="bg-zinc-800" />
              <div>
                <button
                  onClick={() => patchJob({ id: job.id, patch: { archived: !job.archived } })}
                  disabled={isArchiving}
                  className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isArchiving ? (job.archived ? 'Unarchiving…' : 'Archiving…') : (job.archived ? 'Unarchive' : 'Archive')}
                </button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
