import { useSearch } from '@tanstack/react-router'

export const JOB_DRAWER_TABS = ['analysis', 'description', 'documents'] as const

// The four list routes that host JobDrawer all accept `?job=&tab=`, so the document editor's Back
// link can reopen the drawer it was launched from, on the tab it was launched from. Without this,
// Back drops the user on a bare list with the drawer shut — which the UX spec explicitly rules out.
export function useJobDrawerSearch(): { job?: number; tab?: string } {
  const search = useSearch({ strict: false }) as { job?: number; tab?: string }
  // `tab` is user-supplied via the URL. The drawer's Tabs are now CONTROLLED, so an unrecognized
  // value ('?tab=x') would select no tab at all and render a blank drawer body.
  const tab = search.tab && (JOB_DRAWER_TABS as readonly string[]).includes(search.tab)
    ? search.tab
    : undefined
  return { job: search.job, tab }
}

// Apply the URL's tab ONLY to the job the URL names.
//
// Without this the param is sticky: it stays in the URL after the drawer closes, so opening ANY
// subsequent job re-fires the drawer's effect with tab='documents' and lands it on Documents
// instead of Analysis — for as long as the user stays on that route.
export function drawerTabFor(
  selectedJobId: number | null,
  jobFromUrl: number | undefined,
  tabFromUrl: string | undefined,
): string | undefined {
  return selectedJobId !== null && selectedJobId === jobFromUrl ? tabFromUrl : undefined
}
