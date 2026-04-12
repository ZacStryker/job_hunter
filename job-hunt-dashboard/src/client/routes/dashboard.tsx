import { useState } from 'react'
import {
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { StatsPeriod } from '@shared/schemas'
import { STATS_PERIODS } from '@shared/schemas'
import { useStatsQuery } from '../hooks/useStatsQuery'

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

const LABEL_STYLE = { fill: '#ffffff', fontSize: 13, fontWeight: 600 } as const
const labelFormatter = (v: unknown) => (v as number) === 0 ? '' : String(v)

const AXIS_PROPS = {
  tick: { fill: DARK_TICK },
  axisLine: { stroke: DARK_GRID },
  tickLine: false as const,
  allowDecimals: false,
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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-sm font-medium text-zinc-400 mb-3">{title}</div>
      {children}
    </div>
  )
}

export function DashboardRoute() {
  const [period, setPeriod] = useState<StatsPeriod>('all')
  const { data, isPending, isError, error } = useStatsQuery(period)

  return (
    <div className="p-4 space-y-4">
      {/* Period selector */}
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

          {/* Charts grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Recommendation Breakdown — horizontal bar */}
            <ChartCard title="Recommendation Breakdown">
              {(() => {
                const recIndex = Object.fromEntries(data.pipeline.byRecommendation.map((e) => [e.name, e.value]))
                const recData = REC_ALL_KEYS.map((key) => ({ name: key, value: recIndex[key] ?? 0 }))
                return (
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
                        <LabelList dataKey="value" position="insideRight" {...LABEL_STYLE} formatter={labelFormatter} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </ChartCard>

            {/* Fit Score Distribution */}
            <ChartCard title="Fit Score Distribution">
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
                      <LabelList dataKey="count" position="insideTop" {...LABEL_STYLE} formatter={labelFormatter} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Email Types */}
            <ChartCard title="Email Types">
              {(() => {
                const typeIndex = Object.fromEntries(
                  data.emails.byType.filter((e) => e.type !== 'Unclassified').map((e) => [e.type, e.count]),
                )
                const emailData = EMAIL_TYPE_ALL_KEYS.map((key) => ({ type: key, count: typeIndex[key] ?? 0 }))
                return (
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
                        <LabelList dataKey="count" position="insideTop" {...LABEL_STYLE} formatter={labelFormatter} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </ChartCard>

            {/* Automation Runs — grouped bar */}
            <ChartCard title="Automation Runs">
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
                      <LabelList dataKey="success" position="insideTop" {...LABEL_STYLE} formatter={labelFormatter} />
                    </Bar>
                    <Bar dataKey="failed" fill={CHART_COLORS.failed}>
                      <LabelList dataKey="failed" position="insideTop" {...LABEL_STYLE} formatter={labelFormatter} />
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
