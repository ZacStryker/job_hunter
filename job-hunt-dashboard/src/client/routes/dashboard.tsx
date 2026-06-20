import { useState, Fragment } from 'react'
import {
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  LabelList,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { Stats, StatsPeriod } from '@shared/schemas'
import { STATS_PERIODS } from '@shared/schemas'
import { useStatsQuery, type ArchivedFilter } from '../hooks/useStatsQuery'

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '24h': '24h',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
}

const DARK_GRID = '#3f3f46'
const DARK_TICK = '#a1a1aa'
const TOOLTIP_STYLE = { background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', borderRadius: 4, padding: '8px 12px' }

const WORKFLOW_FILL: Record<string, string> = {
  Discovery: '#60a5fa',
  Analysis: '#4ade80',
  'Cover Letter': '#facc15',
  Resume: '#a78bfa',
}

const GATE_MESSAGE = 'Set application statuses to unlock conversion insights.'

type TooltipPayloadItem = { name: string; value: number; color: string }

function FilteredTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  const filtered = payload.filter(p => p.value != null && !Number.isNaN(p.value) && p.value !== 0)
  if (!filtered.length) return null
  const displayLabel = typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label)
    ? formatPerDayDate(label)
    : label
  return (
    <div style={TOOLTIP_STYLE}>
      {displayLabel && <p style={{ color: '#f4f4f5', marginBottom: 4, fontSize: 12 }}>{displayLabel}</p>}
      {filtered.map(p => (
        <p key={String(p.name ?? '')} style={{ color: p.color ?? '#f4f4f5', margin: '2px 0', fontSize: 12 }}>
          {p.name}: {Number.isInteger(p.value) ? p.value : (p.value as number).toFixed(2)}
        </p>
      ))}
    </div>
  )
}

type LabelContentProps = { x?: number; y?: number; width?: number; height?: number; value?: number }

function LabelInsideTop({ x = 0, y = 0, width = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value) return <></>
  return <text x={x + width / 2} y={y - 4} fill="#e4e4e7" textAnchor="middle" fontSize={12} fontWeight={600}>{value}</text>
}

function LabelInsideCostTop({ x = 0, y = 0, width = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value) return <></>
  return <text x={x + width / 2} y={y - 4} fill="#e4e4e7" textAnchor="middle" fontSize={12} fontWeight={600}>{(value as number).toFixed(1)}</text>
}

const AXIS_PROPS = {
  tick: { fill: DARK_TICK },
  axisLine: { stroke: DARK_GRID },
  tickLine: false as const,
  allowDecimals: false,
}

function formatPerDayDate(d: unknown): string {
  if (typeof d !== 'string') return String(d)
  const parts = d.split('-')
  if (parts.length !== 3) return d
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[2], 10)
  return (m >= 0 && m < 12) ? `${MONTHS[m]} ${day}` : d
}

function NoData() {
  return (
    <div className="flex items-center justify-center h-[120px] text-sm text-zinc-500">
      No data for this period
    </div>
  )
}

function GateMessage() {
  return (
    <div className="flex items-center justify-center h-[120px] px-4 text-sm text-zinc-500 text-center">
      {GATE_MESSAGE}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  )
}

function ChartCard({
  title,
  children,
  tableHeaders,
  tableData,
}: {
  title: string
  children: React.ReactNode
  tableHeaders: string[]
  tableData: (string | number)[][]
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-medium text-zinc-400">{title}</div>
        <button
          onClick={() => setShowTable((s) => !s)}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors"
        >
          {showTable ? 'Chart' : 'Data'}
        </button>
      </div>
      {showTable ? (
        <div className="overflow-auto h-[160px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900">
              <tr className="border-b border-zinc-700">
                {tableHeaders.map((h) => (
                  <th key={h} className="text-left pb-2 pr-6 text-zinc-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800">
                  {row.map((cell, j) => (
                    <td key={j} className="py-1.5 pr-6 text-zinc-300">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function heroBorderClass(sentence: string): string {
  if (sentence.startsWith('Active search')) return 'border-green-700'
  if (sentence.startsWith('Moderate activity')) return 'border-amber-600'
  return 'border-zinc-700'
}

const FUNNEL_STAGES = [
  { key: 'scraped', label: 'Scraped', gated: false },
  { key: 'matched', label: 'Matched', gated: false },
  { key: 'applied', label: 'Applied', gated: false },
  { key: 'response', label: 'Response', gated: true },
  { key: 'interview', label: 'Interview', gated: true },
  { key: 'offer', label: 'Offer', gated: true },
] as const

function FunnelBar({ funnel }: { funnel: Stats['funnel'] }) {
  const counts: Record<string, number> = {
    scraped: funnel.scraped, matched: funnel.matched, applied: funnel.applied,
    response: funnel.response, interview: funnel.interview, offer: funnel.offer,
  }
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Pipeline Funnel</h3>
      <div className="flex items-stretch">
        {FUNNEL_STAGES.map((stage, i) => {
          const locked = stage.gated && !funnel.hasStatusData
          const prev = i > 0 ? counts[FUNNEL_STAGES[i - 1].key] : null
          const cur = counts[stage.key]
          const conv = prev !== null && prev > 0 && !locked ? Math.round((cur / prev) * 100) : null
          return (
            <Fragment key={stage.key}>
              {i > 0 && (
                <div className="flex flex-col items-center justify-center px-0.5 min-w-[34px] text-[10px] text-zinc-600">
                  <span>→</span>
                  {conv !== null && <span className="text-zinc-500">{conv}%</span>}
                </div>
              )}
              <div className={`flex-1 rounded-md border p-2 text-center ${locked ? 'border-zinc-800 bg-zinc-900/40' : 'border-zinc-700 bg-zinc-800/40'}`}>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">{stage.label}</div>
                {locked
                  ? <div className="text-zinc-600 text-lg leading-7">🔒</div>
                  : <div className="text-2xl font-semibold text-zinc-100">{cur}</div>}
              </div>
            </Fragment>
          )
        })}
      </div>
      {!funnel.hasStatusData && <p className="text-xs text-zinc-500 mt-2">{GATE_MESSAGE}</p>}
    </div>
  )
}

function ValuePanel({ value }: { value: Stats['value'] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 flex flex-col justify-center">
      <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Value Delivered</div>
      <div className="text-3xl font-bold text-green-400">⏱ ~{Math.round(value.timeSavedHours)} hrs saved</div>
      <div className="text-sm text-zinc-400 mt-2">
        💸 ${value.totalCostUsd.toFixed(2)} spent
        {value.costPerApplication > 0 && <> · ${value.costPerApplication.toFixed(2)} per application</>}
      </div>
    </div>
  )
}

function FitVsOutcome({ fitVsOutcome }: { fitVsOutcome: Stats['fitVsOutcome'] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Fit Score vs Outcome</div>
      {!fitVsOutcome.hasData ? <GateMessage /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={fitVsOutcome.buckets} margin={{ top: 16, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fitRange" {...AXIS_PROPS} fontSize={11} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip content={<FilteredTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="applied" name="Applied" fill="#60a5fa">
              <LabelList dataKey="applied" content={LabelInsideTop as (props: object) => React.JSX.Element} />
            </Bar>
            <Bar dataKey="responded" name="Responded" fill="#4ade80">
              <LabelList dataKey="responded" content={LabelInsideTop as (props: object) => React.JSX.Element} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function DaysSinceAppCard({ days }: { days: number | null }) {
  const color = days === null ? 'text-zinc-400'
    : days < 3 ? 'text-green-400'
    : days <= 7 ? 'text-amber-400'
    : 'text-red-400'
  const text = days === null ? 'Never' : `${days}d`
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Days Since Last Application</div>
      <div className={`text-2xl font-semibold ${color}`}>{text}</div>
    </div>
  )
}

function SparklineStatCard({ label, value, sparkData, sparkKey }: {
  label: string
  value: string
  sparkData: { date: string }[]
  sparkKey: string
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 mb-1">{value}</div>
      <div className="h-[34px]">
        {sparkData.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area type="monotone" dataKey={sparkKey} stroke="#4ade80" fill="#4ade8033" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function SourceEffectivenessPanel({ data, gated }: { data: Stats['detail']['sourceEffectiveness']; gated: boolean }) {
  if (gated) return <GateMessage />
  if (data.length === 0) return <NoData />
  const rows = data.map(s => ({
    source: s.source,
    applyRate: s.scraped > 0 ? Math.round((s.applied / s.scraped) * 100) : 0,
    responseRate: s.applied > 0 ? Math.round((s.responded / s.applied) * 100) : 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 38)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} domain={[0, 100]} unit="%" />
        <YAxis type="category" dataKey="source" {...AXIS_PROPS} width={72} />
        <Tooltip content={<FilteredTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="applyRate" name="Apply rate" fill="#60a5fa">
          <LabelList dataKey="applyRate" position="right" fill="#a1a1aa" fontSize={11} />
        </Bar>
        <Bar dataKey="responseRate" name="Response rate" fill="#4ade80">
          <LabelList dataKey="responseRate" position="right" fill="#a1a1aa" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function StageAgingPanel({ data, gated }: { data: Stats['detail']['stageAging']; gated: boolean }) {
  if (gated) return <GateMessage />
  if (data.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} unit="d" allowDecimals />
        <YAxis type="category" dataKey="stage" {...AXIS_PROPS} width={80} />
        <Tooltip content={<FilteredTooltip />} />
        <Bar dataKey="medianDays" name="Median days" fill="#a78bfa">
          <LabelList dataKey="medianDays" position="right" fill="#a1a1aa" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function CumulativeTimeSavedPanel({ data }: { data: Stats['detail']['cumulativeTimeSaved'] }) {
  if (data.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="gradCumSaved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#4ade80" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatPerDayDate} fontSize={11} />
        <YAxis {...AXIS_PROPS} unit="h" allowDecimals />
        <Tooltip content={<FilteredTooltip />} />
        <Area type="monotone" dataKey="totalHours" name="Hours saved" stroke="#4ade80" fill="url(#gradCumSaved)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function TimeSavedByWorkflowPanel({ data }: { data: Stats['detail']['timeSavedByWorkflow'] }) {
  if (data.every(d => d.hours === 0)) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="workflow" {...AXIS_PROPS} fontSize={11} />
        <YAxis {...AXIS_PROPS} unit="h" allowDecimals />
        <Tooltip content={<FilteredTooltip />} />
        <Bar dataKey="hours" name="Hours">
          {data.map((d) => <Cell key={d.workflow} fill={WORKFLOW_FILL[d.workflow] ?? '#60a5fa'} />)}
          <LabelList dataKey="hours" content={LabelInsideCostTop as (props: object) => React.JSX.Element} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ActivityHeatmap({ data }: { data: Stats['detail']['activityHeatmap'] }) {
  const countByDate = new Map(data.map(d => [d.date, d.count]))
  const cells: { date: string; count: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    cells.push({ date: d, count: countByDate.get(d) ?? 0 })
  }
  const cellColor = (c: number) => c === 0 ? '#27272a' : c === 1 ? '#14532d' : c <= 3 ? '#15803d' : '#22c55e'
  const cols = Math.ceil(cells.length / 7)
  return (
    <div className="flex gap-[3px] overflow-x-auto py-2">
      {Array.from({ length: cols }, (_, col) => (
        <div key={col} className="flex flex-col gap-[3px]">
          {cells.slice(col * 7, col * 7 + 7).map(cell => (
            <div
              key={cell.date}
              title={`${cell.date}: ${cell.count} ${cell.count === 1 ? 'activity' : 'activities'}`}
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ background: cellColor(cell.count) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-sm font-medium text-zinc-400 mb-1.5">{title}</div>
      {children}
    </div>
  )
}

export function DashboardRoute() {
  const [period, setPeriod] = useState<StatsPeriod>('all')
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('active')
  const { data, isPending, isError, error } = useStatsQuery(period, archivedFilter)

  const filterBar = (
    <div className="flex items-center gap-1">
      {STATS_PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={[
            'px-2.5 py-1 text-xs rounded transition-colors',
            period === p ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          ].join(' ')}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
      <div className="w-px h-4 bg-zinc-700 mx-1.5" />
      {(['active', 'archived', 'all'] as ArchivedFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => setArchivedFilter(f)}
          className={[
            'px-2.5 py-1 text-xs rounded transition-colors',
            archivedFilter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          ].join(' ')}
        >
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      ))}
    </div>
  )

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      {filterBar}

      {isPending && <div className="flex items-center justify-center py-16 text-sm text-zinc-400">Loading…</div>}
      {isError && <div className="text-sm text-red-400">{error instanceof Error ? error.message : 'Error loading stats'}</div>}

      {data && data.funnel.scraped === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No jobs scraped yet — start a Discovery run to populate your dashboard.
        </div>
      )}

      {data && data.funnel.scraped > 0 && (
        <>
          {data.funnel.offer > 0 && (
            <div className="rounded-lg border border-green-700 bg-green-950 p-3 text-sm text-green-300">
              🎉 You have an offer! Update the status in your tracker.
            </div>
          )}

          {/* TIER 0 — THE ANSWER */}
          <div className="space-y-2">
            <div className={`rounded-lg border p-4 bg-zinc-900 ${heroBorderClass(data.heroSentence)}`}>
              <p className="text-sm text-zinc-200">{data.heroSentence}</p>
            </div>
            {(data.nextAction.applyMatchesWaiting > 0 || data.nextAction.staleApplications > 0) && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm space-y-1">
                {data.nextAction.applyMatchesWaiting > 0 && (
                  <p className="text-zinc-300">
                    ▶ {data.nextAction.applyMatchesWaiting} Apply-grade match{data.nextAction.applyMatchesWaiting !== 1 ? 'es' : ''} waiting for review
                  </p>
                )}
                {data.nextAction.staleApplications > 0 && (
                  <p className="text-zinc-400">
                    ▶ {data.nextAction.staleApplications} application{data.nextAction.staleApplications !== 1 ? 's' : ''} idle 14d+ — update status to keep your pipeline current
                  </p>
                )}
              </div>
            )}
          </div>

          {/* TIER 1 — THE EVIDENCE */}
          <div className="space-y-4">
            <FunnelBar funnel={data.funnel} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ValuePanel value={data.value} />
              <FitVsOutcome fitVsOutcome={data.fitVsOutcome} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <DaysSinceAppCard days={data.statCards.daysSinceLastApplication} />
              <SparklineStatCard
                label="Match Quality"
                value={`${Math.round(data.statCards.matchQualityRate)}%`}
                sparkData={data.sparklines.matchQuality}
                sparkKey="rate"
              />
              <SparklineStatCard
                label="Cost / Application"
                value={data.value.costPerApplication > 0 ? `$${data.value.costPerApplication.toFixed(2)}` : '—'}
                sparkData={data.sparklines.costPerApp}
                sparkKey="costPerApp"
              />
            </div>
          </div>

          {/* TIER 2 — THE DETAIL */}
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-500 uppercase tracking-widest list-none flex items-center gap-2 select-none">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Drill-in Details
            </summary>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DetailCard title="Apply → Response Rate">
                {!data.detail.applyResponseRate.hasData ? <GateMessage /> : (
                  <div className="flex items-baseline gap-3 py-6 px-2">
                    <span className="text-3xl font-bold text-green-400">
                      {data.detail.applyResponseRate.responded}/{data.detail.applyResponseRate.applied}
                    </span>
                    <span className="text-sm text-zinc-400">
                      replied ({data.detail.applyResponseRate.applied > 0
                        ? Math.round((data.detail.applyResponseRate.responded / data.detail.applyResponseRate.applied) * 100)
                        : 0}%)
                    </span>
                  </div>
                )}
              </DetailCard>

              <DetailCard title="Source Effectiveness">
                <SourceEffectivenessPanel data={data.detail.sourceEffectiveness} gated={!data.detail.applyResponseRate.hasData} />
              </DetailCard>

              <DetailCard title="Stage Aging (median days)">
                <StageAgingPanel data={data.detail.stageAging} gated={!data.funnel.hasStatusData} />
              </DetailCard>

              <DetailCard title="Activity (last 90 days)">
                <ActivityHeatmap data={data.detail.activityHeatmap} />
              </DetailCard>

              <ChartCard
                title="Cumulative Time Saved"
                tableHeaders={['Date', 'Hours']}
                tableData={data.detail.cumulativeTimeSaved.map(e => [e.date, e.totalHours.toFixed(1)])}
              >
                <CumulativeTimeSavedPanel data={data.detail.cumulativeTimeSaved} />
              </ChartCard>

              <ChartCard
                title="Time Saved by Workflow"
                tableHeaders={['Workflow', 'Hours']}
                tableData={data.detail.timeSavedByWorkflow.map(e => [e.workflow, e.hours.toFixed(1)])}
              >
                <TimeSavedByWorkflowPanel data={data.detail.timeSavedByWorkflow} />
              </ChartCard>

              <DetailCard title="Automation">
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Workflow Runs" value={String(data.automation.totalRuns)} />
                  <StatCard label="Tokens" value={formatTokens(data.automation.totalTokens)} />
                </div>
              </DetailCard>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
