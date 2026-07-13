import { useSearch } from '@tanstack/react-router'

// The four list routes that host JobDrawer all accept `?job=&tab=`, so the document editor's Back
// link can reopen the drawer it was launched from, on the tab it was launched from. Without this,
// Back drops the user on a bare list with the drawer shut — which the UX spec explicitly rules out.
export function useJobDrawerSearch(): { job?: number; tab?: string } {
  const search = useSearch({ strict: false }) as { job?: number; tab?: string }
  return { job: search.job, tab: search.tab }
}
