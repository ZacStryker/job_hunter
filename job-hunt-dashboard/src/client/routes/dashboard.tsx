import { useState } from 'react'
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
import type { StatsPeriod } from '@shared/schemas'
import { STATS_PERIODS } from '@shared/schemas'
import { useStatsQuery, type AppliedFilter } from '../hooks/useStatsQuery'

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '24h': '24h',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
}

const CHART_COLORS = {
  apply: '#4ade80',
  investigate: '#facc15',
  skip: '#f87171',
  high: '#4ade80',
  medium: '#facc15',
  low: '#f87171',
  success: '#4ade80',
  failed: '#f87171',
  default: '#a1a1aa',
}

const EMAIL_TYPE_COLOR_MAP: Record<string, string> = {
  Submitted: '#a1a1aa',
  Screening: '#60a5fa',
  Rejected: '#f87171',
  Other: '#facc15',
  Interview: '#86efac',
  Offer: '#16a34a',
}

const REC_COLOR_MAP: Record<string, string> = {
  apply: CHART_COLORS.apply,
  investigate: CHART_COLORS.investigate,
  skip: CHART_COLORS.skip,
  None: CHART_COLORS.default,
}

const REC_ALL_KEYS = ['apply', 'investigate', 'skip', 'None'] as const
const EMAIL_TYPE_ALL_KEYS = ['Submitted', 'Rejected', 'Other', 'Screening', 'Interview', 'Offer'] as const

const FIT_COLOR_MAP: Record<string, string> = {
  '0-9': CHART_COLORS.low,
  '10-19': CHART_COLORS.low,
  '20-29': CHART_COLORS.low,
  '30-39': CHART_COLORS.low,
  '40-49': CHART_COLORS.low,
  '50-59': CHART_COLORS.low,
  '60-69': CHART_COLORS.medium,
  '70-79': CHART_COLORS.medium,
  '80-89': CHART_COLORS.high,
  '90+': CHART_COLORS.high,
}

const DARK_GRID = '#3f3f46'
const DARK_TICK = '#a1a1aa'
const TOOLTIP_STYLE = { background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5' }
const TOOLTIP_TEXT_STYLE = { color: '#f4f4f5' }
const TOOLTIP_PROPS = { contentStyle: TOOLTIP_STYLE, labelStyle: TOOLTIP_TEXT_STYLE, itemStyle: TOOLTIP_TEXT_STYLE }

type LabelContentProps = { x?: number; y?: number; width?: number; height?: number; value?: number }

function LabelInsideTop({ x = 0, y = 0, width = 0, height = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value || height < 30) return <></>
  return <text x={x + width / 2} y={y + 20} fill="#ffffff" textAnchor="middle" fontSize={13} fontWeight={600}>{value}</text>
}

function LabelInsideRight({ x = 0, y = 0, width = 0, height = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value || width < 40) return <></>
  return <text x={x + width - 10} y={y + height / 2 + 5} fill="#ffffff" textAnchor="end" fontSize={13} fontWeight={600}>{value}</text>
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
    <div className="flex items-center justify-center h-[180px] text-sm text-zinc-500">
      No data for this period
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-zinc-400">{title}</div>
        <button
          onClick={() => setShowTable((s) => !s)}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
        >
          {showTable ? 'Chart' : 'Data'}
        </button>
      </div>
      {showTable ? (
        <div className="overflow-auto h-[220px]">
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

export function DashboardRoute() {
  const [period, setPeriod] = useState<StatsPeriod>('all')
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter>('applied')
  const { data, isPending, isError, error } = useStatsQuery(period, false, appliedFilter)

  return (
    <div className="p-4 space-y-4">
      {/* Period selector + filter toggles */}
      <div className="flex items-center gap-1">
        {STATS_PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={[
              'px-3 py-1.5 text-sm rounded transition-colors',
              period === p
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
            ].join(' ')}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}

        <div className="w-px h-5 bg-zinc-700 mx-2" />

        {(['applied', 'unapplied', 'all'] as AppliedFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setAppliedFilter(f)}
            className={[
              'px-3 py-1.5 text-sm rounded transition-colors',
              appliedFilter === f
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
            ].join(' ')}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isPending && (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-400">Loading…</div>
      )}

      {isError && (
        <div className="text-sm text-red-400">{error instanceof Error ? error.message : 'Error loading stats'}</div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-6 gap-3">
            <StatCard label="Scrapes" value={String(data.scraped.total)} />
            <StatCard label="Archives" value={String(data.archived.total)} />
            <StatCard label="Matches" value={String(data.pipeline.total)} />
            <StatCard label="Applications" value={String(data.applications.total)} />
            <StatCard
              label="Response Rate"
              value={data.applications.responseRate === null ? '—' : `${Math.round(data.applications.responseRate * 100)}%`}
            />
            <StatCard label="Messages" value={String(data.emails.total)} />
          </div>

          {/* Jobs per day by recommendation */}
          {data.scraped.perDay.length > 0 && (
            <ChartCard
              title="Jobs per Day by Recommendation"
              tableHeaders={['Date', 'Apply', 'Investigate', 'Skip', 'None']}
              tableData={data.scraped.perDay.map((e) => [e.date, e.apply, e.investigate, e.skip, e.none])}
            >
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.scraped.perDay}>
                  <defs>
                    <linearGradient id="gradApply" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.apply} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={CHART_COLORS.apply} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="gradInvestigate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.investigate} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={CHART_COLORS.investigate} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="gradSkip" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.skip} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={CHART_COLORS.skip} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="gradNone" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.default} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={CHART_COLORS.default} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                  <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatPerDayDate} />
                  <YAxis {...AXIS_PROPS} />
                  <Tooltip {...TOOLTIP_PROPS} />
                  <Legend wrapperStyle={{ color: DARK_TICK }} />
                  <Area type="monotone" dataKey="apply" stackId="1" stroke={CHART_COLORS.apply} fill="url(#gradApply)" />
                  <Area type="monotone" dataKey="investigate" stackId="1" stroke={CHART_COLORS.investigate} fill="url(#gradInvestigate)" />
                  <Area type="monotone" dataKey="skip" stackId="1" stroke={CHART_COLORS.skip} fill="url(#gradSkip)" />
                  <Area type="monotone" dataKey="none" stackId="1" stroke={CHART_COLORS.default} fill="url(#gradNone)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Charts grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Recommendation Breakdown — horizontal bar */}
            {(() => {
              const recIndex = Object.fromEntries(data.pipeline.byRecommendation.map((e) => [e.name, e.value]))
              const recData = REC_ALL_KEYS.map((key) => ({ name: key, value: recIndex[key] ?? 0 }))
              return (
                <ChartCard
                  title="Recommendation Breakdown"
                  tableHeaders={['Recommendation', 'Count']}
                  tableData={recData.map((e) => [e.name, e.value])}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart layout="vertical" data={recData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                      <XAxis type="number" {...AXIS_PROPS} />
                      <YAxis type="category" dataKey="name" width={90} {...AXIS_PROPS} />
                      <Tooltip {...TOOLTIP_PROPS} />
                      <Bar dataKey="value">
                        {recData.map((entry) => (
                          <Cell key={entry.name} fill={REC_COLOR_MAP[entry.name] ?? CHART_COLORS.default} />
                        ))}
                        <LabelList dataKey="value" content={LabelInsideRight as (props: object) => React.JSX.Element} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )
            })()}

            {/* Fit Score Distribution */}
            <ChartCard
              title="Fit Score Distribution"
              tableHeaders={['Bucket', 'Count']}
              tableData={data.pipeline.byFitScore.map((e) => [e.bucket, e.count])}
            >
              {data.pipeline.byFitScore.every((b) => b.count === 0) ? (
                <NoData />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.pipeline.byFitScore}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="bucket" {...AXIS_PROPS} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Bar dataKey="count">
                      {data.pipeline.byFitScore.map((entry) => (
                        <Cell key={entry.bucket} fill={FIT_COLOR_MAP[entry.bucket] ?? CHART_COLORS.default} />
                      ))}
                      <LabelList dataKey="count" content={LabelInsideTop as (props: object) => React.JSX.Element} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Email Types */}
            {(() => {
              const typeIndex = Object.fromEntries(
                data.emails.byType.filter((e) => e.type !== 'Unclassified').map((e) => [e.type, e.count]),
              )
              const emailData = EMAIL_TYPE_ALL_KEYS.map((key) => ({ type: key, count: typeIndex[key] ?? 0 }))
              return (
                <ChartCard
                  title="Email Types"
                  tableHeaders={['Type', 'Count']}
                  tableData={emailData.map((e) => [e.type, e.count])}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={emailData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                      <XAxis dataKey="type" {...AXIS_PROPS} />
                      <YAxis {...AXIS_PROPS} />
                      <Tooltip {...TOOLTIP_PROPS} />
                      <Bar dataKey="count">
                        {emailData.map((entry) => (
                          <Cell key={entry.type} fill={EMAIL_TYPE_COLOR_MAP[entry.type] ?? CHART_COLORS.default} />
                        ))}
                        <LabelList dataKey="count" content={LabelInsideTop as (props: object) => React.JSX.Element} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )
            })()}

            {/* Automation Runs — grouped bar */}
            <ChartCard
              title="Automation Runs"
              tableHeaders={['Workflow', 'Success', 'Failed']}
              tableData={data.automation.byWorkflow.map((e) => [e.workflow, e.success, e.failed])}
            >
              {data.automation.byWorkflow.length === 0 ? (
                <NoData />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.automation.byWorkflow}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="workflow" {...AXIS_PROPS} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Legend wrapperStyle={{ color: DARK_TICK }} />
                    <Bar dataKey="success" fill={CHART_COLORS.success}>
                      <LabelList dataKey="success" content={LabelInsideTop as (props: object) => React.JSX.Element} />
                    </Bar>
                    <Bar dataKey="failed" fill={CHART_COLORS.failed}>
                      <LabelList dataKey="failed" content={LabelInsideTop as (props: object) => React.JSX.Element} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
