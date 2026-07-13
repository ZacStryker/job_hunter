import { DocumentVersions } from './DocumentVersions'
import { useResumeVersionsQuery } from '../../hooks/useResumeVersionsQuery'
import { useResumeRestoreMutation } from '../../hooks/useResumeRestoreMutation'

interface Props {
  jobId: number
  generatedAt: string
}

// Data-binding only — the UX lives in DocumentVersions, shared with the cover letter.
//
// Note a resume generated BEFORE this feature shipped has a PDF and a resumeGeneratedAt but ZERO
// rows, so `versions` is empty and DocumentVersions renders the plain date — exactly what that
// column showed before. Legacy resumes degrade to today's behaviour rather than to a broken control.
export function ResumeVersions({ jobId, generatedAt }: Props) {
  const { data: versions = [] } = useResumeVersionsQuery(jobId)
  const { mutate: restore, isPending, isError, error } = useResumeRestoreMutation(jobId)

  return (
    <DocumentVersions
      versions={versions}
      stampedAt={generatedAt}
      isPending={isPending}
      isError={isError}
      error={error}
      onRestore={(versionId) => restore({ versionId })}
    />
  )
}
