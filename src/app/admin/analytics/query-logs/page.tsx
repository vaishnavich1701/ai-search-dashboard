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
const locationLabel = (r: any) =>
  [r.geo_city, r.geo_region, r.geo_country].filter(Boolean).join(', ') || '—';
const sourcesLabel = (r: any) => {
  try {
    const sources = JSON.parse(r.sources || '[]');
    return Array.isArray(sources) && sources.length ? sources.join(', ') : '—';
  } catch {
    return r.sources || '—';
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
            mode, sources, and approximate geolocation.
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
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="text-xs text-black/50 dark:text-white/50">
              <tr>
                <th>Created</th>
                <th>User</th>
                <th>Org</th>
                <th>Search</th>
                <th>Location</th>
                <th>Coordinates</th>
                <th>Mode</th>
                <th>Sources</th>
                <th>Model</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {logs?.rows?.length ? (
                logs.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-light-200/40 dark:border-dark-200/40"
                  >
                    <td className="py-2">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td>{r.user_id || 'Anonymous'}</td>
                    <td>{r.organization_id || 'None'}</td>
                    <td className="max-w-sm truncate" title={r.query_text}>
                      {r.query_text}
                      {r.query_text_truncated ? ' (truncated)' : ''}
                    </td>
                    <td>
                      {locationLabel(r)}
                      <span className="block text-xs text-black/50 dark:text-white/50">
                        {r.geo_source || '—'}
                      </span>
                    </td>
                    <td>
                      {[coord(r.geo_latitude), coord(r.geo_longitude)]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td>{r.optimization_mode || '—'}</td>
                    <td>{sourcesLabel(r)}</td>
                    <td>
                      {r.provider || '—'}/{r.model || '—'}
                    </td>
                    <td>{r.status}</td>
                    <td>{ms(r.latency_ms)}</td>
                    <td className="max-w-xs truncate">
                      {r.error_message || '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="py-6 text-center text-black/60 dark:text-white/60"
                    colSpan={12}
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
