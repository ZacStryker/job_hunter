import { DocumentVersions } from './DocumentVersions'
import { useCoverLetterVersionsQuery } from '../../hooks/useCoverLetterVersionsQuery'
import { useCoverLetterRestoreMutation } from '../../hooks/useCoverLetterRestoreMutation'

interface Props {
  jobId: number
  sentAt: string
}

// Data-binding only — the UX lives in DocumentVersions, shared with the resume so the two cannot
// drift into two different version-dropdown behaviours.
export function CoverLetterVersions({ jobId, sentAt }: Props) {
  const { data: versions = [] } = useCoverLetterVersionsQuery(jobId)
  const { mutate: restore, isPending, isError, error } = useCoverLetterRestoreMutation(jobId)

  return (
    <DocumentVersions
      versions={versions}
      stampedAt={sentAt}
      isPending={isPending}
      isError={isError}
      error={error}
      onRestore={(versionId) => restore({ versionId })}
    />
  )
}
