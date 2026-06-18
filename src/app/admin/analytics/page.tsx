'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Database,
  DollarSign,
  ShieldAlert,
  MapPin,
  Star,
  Users,
} from 'lucide-react';

type Summary = any;
type Logs = {
  rows: any[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const fmt = (n: any) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString();
const ms = (n: any) =>
  n === null || n === undefined
    ? '—'
    : `${Math.round(Number(n)).toLocaleString()} ms`;
const coord = (n: any) =>
  n === null || n === undefined ? null : (Number(n) / 1_000_000).toFixed(4);
const locationLabel = (r: any) =>
  [r.geo_city, r.geo_region, r.geo_country].filter(Boolean).join(', ') || '—';

const cost = (n: any) =>
  n === null || n === undefined
    ? 'Cost unavailable'
    : `$${(Number(n) / 1_000_000).toFixed(4)}`;

const Card = ({ title, value, note, icon: Icon }: any) => (
  <div className="flex min-h-36 flex-col justify-between rounded-2xl border border-light-200 bg-light-secondary p-5 dark:border-dark-200 dark:bg-dark-secondary">
    <div className="flex items-center justify-between text-sm text-black/60 dark:text-white/60">
      <span>{title}</span>
      <Icon size={18} />
    </div>
    <div className="mt-5 text-3xl font-semibold leading-tight">{value}</div>
    {note && (
      <div className="mt-2 text-xs text-black/50 dark:text-white/50">
        {note}
      </div>
    )}
  </div>
);

const ChartCard = ({ children, className = '' }: any) => (
  <div
    className={`rounded-2xl border border-light-200 p-5 dark:border-dark-200 ${className}`}
  >
    {children}
  </div>
);

const Bars = ({
  rows,
  label,
  value,
}: {
  rows: any[];
  label: (r: any) => string;
  value: (r: any) => number;
}) => {
  const max = Math.max(...rows.map(value), 1);
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">No data yet.</p>
      ) : (
        rows.map((r, i) => (
          <div key={i} className="min-w-0">
            <div className="flex min-w-0 justify-between gap-3 text-xs">
              <span className="min-w-0 truncate" title={label(r)}>
                {label(r)}
              </span>
              <span className="shrink-0">{fmt(value(r))}</span>
            </div>
            <div className="h-2 rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-2 rounded-full bg-sky-500"
                style={{ width: `${Math.max(4, (value(r) / max) * 100)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default function AdminAnalyticsPage() {
  const [token, setToken] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [logs, setLogs] = useState<Logs | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const headers = useMemo(() => ({ 'x-admin-token': token }), [token]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`/api/admin/analytics/summary?${params}`, { headers }).then(
        async (r) => {
          if (!r.ok) throw new Error((await r.json()).message);
          return r.json();
        },
      ),
      fetch(`/api/admin/analytics/logs?${params}&page=${page}&pageSize=20`, {
        headers,
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message);
        return r.json();
      }),
    ])
      .then(([s, l]) => {
        setSummary(s);
        setLogs(l);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, status, page, headers]);

  const totals = summary?.totals || {};
  const quality = summary?.quality?.[0] || {};

  return (
    <main className="min-h-screen bg-light-primary dark:bg-dark-primary lg:pl-20">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-6 border-b border-light-200/30 pb-8 dark:border-dark-200/30 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Link href="/" className="text-sm text-sky-500">
              ← Back to chat
            </Link>
            <h1
              className="mt-2 text-4xl font-normal"
              style={{ fontFamily: 'PP Editorial, serif' }}
            >
              Admin analytics
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60 dark:text-white/60">
              Real query, model, quality, latency, and cost metrics captured
              from persisted AI usage.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <input
              className="rounded-xl border border-light-200 bg-transparent px-4 py-2.5 text-sm dark:border-dark-200"
              placeholder="Admin token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <select
              className="rounded-xl border border-light-200 bg-transparent px-4 py-2.5 text-sm dark:border-dark-200"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <ShieldAlert className="inline mr-2" size={18} />
            {error}
          </div>
        )}
        {loading && (
          <p className="mt-6 text-sm text-black/60 dark:text-white/60">
            Loading analytics…
          </p>
        )}
        {!token && (
          <p className="mt-6 text-sm text-black/60 dark:text-white/60">
            Enter the configured admin token to load analytics. Non-admin users
            cannot access the backing API.
          </p>
        )}
        {summary && (
          <>
            <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Card
                title="Total queries"
                value={fmt(totals.total)}
                note={`${fmt(totals.success)} success / ${fmt(totals.errors)} errors`}
                icon={Activity}
              />
              <Card
                title="With citations"
                value={fmt(totals.withCitations)}
                note={`${fmt(totals.withoutCitations)} without citations`}
                icon={Database}
              />
              <Card
                title="Average latency"
                value={ms(totals.avgLatency)}
                note={`P50 ${ms(totals.p50Latency)} · P95 ${ms(totals.p95Latency)}`}
                icon={Clock}
              />
              <Card
                title="Estimated cost"
                value={cost(totals.totalCost)}
                note={`${cost(totals.avgCost)} avg/query`}
                icon={DollarSign}
              />
            </section>
            <section className="mt-8 grid gap-5 lg:grid-cols-2">
              <ChartCard>
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <BarChart3 size={18} /> Queries over time
                </h2>
                <Bars
                  rows={summary.queryTrend}
                  label={(r) => r.date}
                  value={(r) => r.total}
                />
              </ChartCard>
              <ChartCard>
                <h2 className="mb-4 font-semibold">
                  Model/provider comparison
                </h2>
                <Bars
                  rows={summary.modelMetrics}
                  label={(r) =>
                    `${r.provider}/${r.model} · ${ms(r.avgLatency)}`
                  }
                  value={(r) => r.total}
                />
              </ChartCard>
            </section>
            <section className="mt-8 grid gap-5 lg:grid-cols-2">
              <ChartCard>
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <Users size={18} /> Top user/org activity
                </h2>
                <Bars
                  rows={summary.byUser}
                  label={(r) => `${r.userId} / ${r.organizationId}`}
                  value={(r) => r.total}
                />
              </ChartCard>
              <ChartCard>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <MapPin size={18} /> Top geolocations
                  </h2>
                  <div className="flex gap-3">
                    <Link
                      href="/admin/evaluations"
                      className="text-xs text-sky-500"
                    >
                      Evaluation metrics →
                    </Link>
                    <Link
                      href="/admin/analytics/query-logs"
                      className="text-xs text-sky-500"
                    >
                      Open detailed logs →
                    </Link>
                  </div>
                </div>
                <Bars
                  rows={summary.byLocation}
                  label={(r) =>
                    [r.city, r.region, r.country].filter(Boolean).join(', ') ||
                    'Unknown'
                  }
                  value={(r) => r.total}
                />
              </ChartCard>
            </section>
            <section className="mt-8 grid gap-5 lg:grid-cols-3">
              <ChartCard>
                <h2 className="mb-4 font-semibold">Latency trend</h2>
                <Bars
                  rows={summary.latencyTrend}
                  label={(r) => r.date}
                  value={(r) => Math.round(r.avgLatency || 0)}
                />
              </ChartCard>
              <ChartCard>
                <h2 className="mb-4 font-semibold">Token/cost usage</h2>
                <p className="text-sm">
                  Prompt tokens: {fmt(totals.promptTokens)}
                </p>
                <p className="text-sm">
                  Completion tokens: {fmt(totals.completionTokens)}
                </p>
                <p className="text-sm">
                  Total tokens: {fmt(totals.totalTokens)}
                </p>
                <p className="mt-2 text-xs text-black/60 dark:text-white/60">
                  Pricing metadata is not configured, so cost is unavailable
                  instead of estimated with fake rates.
                </p>
              </ChartCard>
              <ChartCard>
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <Star size={18} /> Quality signals
                </h2>
                <p className="text-sm">
                  Average citations: {fmt(quality.avgCitations)}
                </p>
                <p className="text-sm">
                  Feedback records: {fmt(quality.feedbackCount)}
                </p>
                <p className="text-sm">
                  Evaluation records: {fmt(quality.evaluationCount)}
                </p>
                {!quality.feedbackCount && !quality.evaluationCount && (
                  <p className="mt-2 text-xs text-black/60 dark:text-white/60">
                    No quality data yet beyond citation/source counts.
                  </p>
                )}
              </ChartCard>
            </section>
            <section className="mt-8 rounded-2xl border border-light-200 p-5 dark:border-dark-200">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="font-semibold">Recent query logs</h2>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Scroll horizontally for full log details.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-light-200/40 dark:border-dark-200/40">
                <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-36" />
                    <col className="w-80" />
                    <col className="w-36" />
                    <col className="w-44" />
                    <col className="w-32" />
                    <col className="w-64" />
                    <col className="w-24" />
                    <col className="w-28" />
                    <col className="w-36" />
                    <col className="w-56" />
                  </colgroup>
                  <thead className="text-xs text-black/50 dark:text-white/50">
                    <tr>
                      <th className="px-3 py-3 font-medium">Created</th>
                      <th className="px-3 py-3 font-medium">Query</th>
                      <th className="px-3 py-3 font-medium">User/org</th>
                      <th className="px-3 py-3 font-medium">Location</th>
                      <th className="px-3 py-3 font-medium">Mode/sources</th>
                      <th className="px-3 py-3 font-medium">Model</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Latency</th>
                      <th className="px-3 py-3 font-medium">Cost</th>
                      <th className="px-3 py-3 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs?.rows?.length ? (
                      logs.rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-light-200/40 dark:border-dark-200/40"
                        >
                          <td className="px-3 py-4 align-top text-xs leading-5">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-4 align-top">
                            <div className="truncate" title={r.query_text}>
                              {r.query_text}
                              {r.query_text_truncated ? ' (truncated)' : ''}
                            </div>
                          </td>
                          <td className="px-3 py-4 align-top">
                            <div
                              className="truncate"
                              title={`${r.user_id || 'Anonymous'} / ${
                                r.organization_id || 'None'
                              }`}
                            >
                              {r.user_id || 'Anonymous'} /{' '}
                              {r.organization_id || 'None'}
                            </div>
                          </td>
                          <td
                            className="px-3 py-4 align-top"
                            title={[
                              coord(r.geo_latitude),
                              coord(r.geo_longitude),
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          >
                            <div className="truncate" title={locationLabel(r)}>
                              {locationLabel(r)}
                            </div>
                          </td>
                          <td className="px-3 py-4 align-top">
                            <div
                              className="truncate"
                              title={`${r.optimization_mode || '—'} / ${fmt(
                                r.source_count,
                              )}`}
                            >
                              {r.optimization_mode || '—'} /{' '}
                              {fmt(r.source_count)}
                            </div>
                          </td>
                          <td className="px-3 py-4 align-top">
                            <div
                              className="truncate"
                              title={`${r.provider || '—'}/${r.model || '—'}`}
                            >
                              {r.provider || '—'}/{r.model || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-4 align-top whitespace-nowrap">
                            {r.status}
                          </td>
                          <td className="px-3 py-4 align-top whitespace-nowrap">
                            {ms(r.latency_ms)}
                          </td>
                          <td className="px-3 py-4 align-top whitespace-nowrap">
                            {cost(r.estimated_cost)}
                          </td>
                          <td className="px-3 py-4 align-top">
                            <div
                              className="truncate"
                              title={r.error_message || '—'}
                            >
                              {r.error_message || '—'}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          className="px-3 py-6 text-center text-black/60 dark:text-white/60"
                          colSpan={10}
                        >
                          No query logs yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Page {logs?.page || 1} of {logs?.totalPages || 1}
                </span>
                <div className="flex gap-2">
                  <button
                    className="rounded-lg border px-3 py-1 disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="rounded-lg border px-3 py-1 disabled:opacity-40"
                    disabled={!logs || page >= logs.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
