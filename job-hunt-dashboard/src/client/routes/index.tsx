import { Button } from '../components/ui/button'

export function PipelineRoute() {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-400">
              No jobs yet. Hit Sync to pull from Google Sheets.
            </p>
            <Button variant="outline" size="sm" disabled>
              Sync
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
