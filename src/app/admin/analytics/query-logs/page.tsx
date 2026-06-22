'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MapPin, ShieldAlert } from 'lucide-react';

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
const dateValue = (value: any) => (value ? new Date(value) : null);
const dateOnly = (value: any) => {
  const date = dateValue(value);
  return date ? date.toLocaleDateString() : '—';
};
const timeOnly = (value: any, timeZone?: string) => {
  const date = dateValue(value);
  return date
    ? date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone,
      })
    : '—';
};
const locationValue = (value: any) => value || '—';
const sourcesLabel = (r: any) => {
  if (r.source_count !== null && r.source_count !== undefined)
    return fmt(r.source_count);

  try {
    const sources = JSON.parse(r.sources || '[]');
    return Array.isArray(sources) ? fmt(sources.length) : '—';
  } catch {
    return r.sources ? '1' : '—';
  }
};
const cost = (n: any) =>
  n === null || n === undefined
    ? '—'
    : `$${(Number(n) / 1_000_000).toFixed(6)}`;
const feedback = (rating: any) => {
  if (rating === 1) return 'Helpful';
  if (rating === -1) return 'Not helpful';
  return '—';
};
const pct = (n: any) =>
  n === null || n === undefined ? '—' : `${Math.round(Number(n))}%`;

const boundedPercent = (value: number | null | undefined, fallback = null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Number(value)));
};

const inverseLatencyScore = (latency: number | null | undefined) => {
  if (latency === null || latency === undefined) return null;
  return boundedPercent(100 - Math.max(0, Number(latency) - 1000) / 40);
};

const weightedAverage = (
  parts: Array<{ score: number | null; weight: number }>,
) => {
  const usable = parts.filter(
    (part) => part.score !== null && Number.isFinite(part.score),
  ) as Array<{ score: number; weight: number }>;
  const weight = usable.reduce((sum, part) => sum + part.weight, 0);
  if (!weight) return null;
  return boundedPercent(
    usable.reduce((sum, part) => sum + part.score * part.weight, 0) / weight,
  );
};

const rowFeedbackScore = (rating: any) => {
  if (rating === 1) return 100;
  if (rating === -1) return 0;
  return null;
};

const rowCitationScore = (row: any) =>
  row.status === 'success'
    ? Number(row.citation_count || 0) > 0
      ? 100
      : 35
    : 0;

const rowLatencyScore = (row: any) => inverseLatencyScore(row.latency_ms);

const rowEvaluationScore = (row: any) =>
  row.evaluation_score === null || row.evaluation_score === undefined
    ? null
    : boundedPercent(Number(row.evaluation_score));

const rowRelevanceScore = (row: any) =>
  weightedAverage([
    { score: row.status === 'success' ? 80 : 0, weight: 0.35 },
    { score: rowCitationScore(row), weight: 0.35 },
    { score: rowFeedbackScore(row.feedback_rating), weight: 0.2 },
    { score: rowEvaluationScore(row), weight: 0.1 },
  ]);

const rowHelpfulnessScore = (row: any) =>
  weightedAverage([
    { score: rowFeedbackScore(row.feedback_rating), weight: 0.45 },
    { score: rowEvaluationScore(row), weight: 0.25 },
    { score: rowCitationScore(row), weight: 0.2 },
    { score: rowLatencyScore(row), weight: 0.1 },
  ]);

const rowOverallScore = (row: any) =>
  weightedAverage([
    { score: rowRelevanceScore(row), weight: 0.35 },
    { score: rowHelpfulnessScore(row), weight: 0.35 },
    { score: rowCitationScore(row), weight: 0.15 },
    { score: rowLatencyScore(row), weight: 0.15 },
  ]);
const weatherLabel = (value: any) => {
  if (!value) return '—';

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const current = parsed.current ?? {};
    const units = parsed.units ?? {};
    const temp = current.temperature_2m;
    const humidity = current.relative_humidity_2m;
    const wind = current.wind_speed_10m;

    return (
      [
        temp === undefined ? null : `${temp}${units.temperature_2m || '°C'}`,
        humidity === undefined
          ? null
          : `${humidity}${units.relative_humidity_2m || '%'} RH`,
        wind === undefined ? null : `${wind}${units.wind_speed_10m || ''} wind`,
      ]
        .filter(Boolean)
        .join(' · ') || '—'
    );
  } catch {
    return '—';
  }
};

export default function QueryLogsPage() {
  const [token, setToken] = useState('');
  const [logs, setLogs] = useState<Logs | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [organizationId, setOrganizationId] = useState('');

  const headers = useMemo(() => ({ 'x-admin-token': token }), [token]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (status) params.set('status', status);
    if (userId) params.set('userId', userId);
    if (organizationId) params.set('organizationId', organizationId);
    setLoading(true);
    setError('');
    fetch(`/api/admin/analytics/logs?${params}`, { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message);
        return r.json();
      })
      .then(setLogs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, status, userId, organizationId, page, headers]);

  return (
    <main className="min-h-screen bg-light-primary dark:bg-dark-primary lg:pl-20">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="border-b border-light-200/30 pb-6 dark:border-dark-200/30">
          <Link href="/admin/analytics" className="text-sm text-sky-500">
            ← Back to analytics
          </Link>
          <h1
            className="mt-2 flex items-center gap-3 text-4xl font-normal"
            style={{ fontFamily: 'PP Editorial, serif' }}
          >
            <MapPin size={32} /> Query identity & geolocation logs
          </h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Audit who searched, their organization, what they searched, query
            mode, source counts, context, feedback, and geolocation.
          </p>
        </div>

        <section className="mt-6 grid gap-3 rounded-2xl border border-light-200 p-4 dark:border-dark-200 md:grid-cols-5">
          <input
            className="rounded-xl border border-light-200 bg-transparent px-3 py-2 text-sm dark:border-dark-200"
            placeholder="Admin token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <input
            className="rounded-xl border border-light-200 bg-transparent px-3 py-2 text-sm dark:border-dark-200"
            placeholder="User ID"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
          />
          <input
            className="rounded-xl border border-light-200 bg-transparent px-3 py-2 text-sm dark:border-dark-200"
            placeholder="Organization ID"
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="rounded-xl border border-light-200 bg-transparent px-3 py-2 text-sm dark:border-dark-200"
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
          <div className="text-sm text-black/60 dark:text-white/60">
            {loading ? 'Loading…' : `${fmt(logs?.total)} records`}
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <ShieldAlert className="mr-2 inline" size={18} />
            {error}
          </div>
        )}

        <section className="mt-6 overflow-x-auto rounded-2xl border border-light-200 p-4 dark:border-dark-200">
          <table className="w-full min-w-[2600px] border-separate border-spacing-0 text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-black/50 dark:text-white/50">
              <tr>
                {[
                  'Date created',
                  'Time (GMT)',
                  'Local time',
                  'Area',
                  'City',
                  'State',
                  'Country',
                  'Query',
                  'Weather then',
                  'Mode',
                  'Sources',
                  'LLM model',
                  'Status',
                  'Latency',
                  'Cost',
                  'Error',
                  'Explicit feedback',
                  'Feedback note',
                  'Relevance',
                  'Helpfulness',
                  'Overall',
                  'Browser/OS',
                  'Device',
                  'Coordinates',
                ].map((heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-4 py-3 font-semibold"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top">
              {logs?.rows?.length ? (
                logs.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-light-200/40 dark:border-dark-200/40"
                  >
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {dateOnly(r.created_at)}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {timeOnly(r.created_at, 'GMT')}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {timeOnly(r.created_at, r.geo_timezone || undefined)}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {locationValue(r.geo_area)}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {locationValue(r.geo_city)}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {locationValue(r.geo_region)}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {locationValue(r.geo_country)}
                    </td>
                    <td
                      className="max-w-sm border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40"
                      title={r.query_text}
                    >
                      <span className="line-clamp-3">
                        {r.query_text}
                        {r.query_text_truncated ? ' (truncated)' : ''}
                      </span>
                    </td>
                    <td className="min-w-48 border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {weatherLabel(r.weather_data)}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {r.optimization_mode || '—'}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 text-right dark:border-dark-200/40">
                      {sourcesLabel(r)}
                    </td>
                    <td className="min-w-56 border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {r.provider || '—'}/{r.model || '—'}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {r.status}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 text-right dark:border-dark-200/40">
                      {ms(r.latency_ms)}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 text-right dark:border-dark-200/40">
                      {cost(r.estimated_cost)}
                    </td>
                    <td
                      className="max-w-xs border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40"
                      title={r.error_message || ''}
                    >
                      <span className="line-clamp-3">
                        {r.error_message || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {feedback(r.feedback_rating)}
                    </td>
                    <td
                      className="max-w-xs border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40"
                      title={r.feedback_text || ''}
                    >
                      <span className="line-clamp-3">
                        {r.feedback_text || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 text-right dark:border-dark-200/40">
                      {pct(rowRelevanceScore(r))}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 text-right dark:border-dark-200/40">
                      {pct(rowHelpfulnessScore(r))}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 text-right dark:border-dark-200/40">
                      {pct(rowOverallScore(r))}
                    </td>
                    <td className="min-w-40 border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {[r.browser, r.os].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {r.device || '—'}
                    </td>
                    <td className="whitespace-nowrap border-t border-light-200/40 px-4 py-3 dark:border-dark-200/40">
                      {[coord(r.geo_latitude), coord(r.geo_longitude)]
                        .filter(Boolean)
                        .join(', ') || '—'}
                      <span className="block text-[11px] text-black/50 dark:text-white/50">
                        {r.geo_source || '—'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="py-6 text-center text-black/60 dark:text-white/60"
                    colSpan={24}
                  >
                    No query logs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span>
              Page {logs?.page || 1} of {logs?.totalPages || 1}
            </span>
            <div className="space-x-2">
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
      </div>
    </main>
  );
}
