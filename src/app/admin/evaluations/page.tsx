'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock,
  DollarSign,
  FileSearch,
  MessageSquareHeart,
  ShieldAlert,
  Target,
  TrendingUp,
} from 'lucide-react';

type Summary = any;
type Logs = {
  rows: any[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Metric = {
  title: string;
  score: string;
  explanation: string;
  status: 'Excellent' | 'Good' | 'Monitor' | 'Waiting';
  icon: any;
};

const fmt = (n: any) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString();
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);
const ms = (n: any) =>
  n === null || n === undefined
    ? '—'
    : `${Math.round(Number(n)).toLocaleString()} ms`;
const cost = (n: any) =>
  n === null || n === undefined
    ? 'Cost unavailable'
    : `$${(Number(n) / 1_000_000).toFixed(4)}`;

const boundedPercent = (value: number | null | undefined, fallback = null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Number(value)));
};

const qualityStatus = (score: number | null): Metric['status'] => {
  if (score === null) return 'Waiting';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  return 'Monitor';
};

const inverseLatencyScore = (latency: number | null | undefined) => {
  if (latency === null || latency === undefined) return null;
  return boundedPercent(100 - Math.max(0, Number(latency) - 1000) / 40);
};

const statusClasses: Record<Metric['status'], string> = {
  Excellent:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  Good: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  Monitor:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Waiting:
    'border-white/10 bg-black/5 text-black/50 dark:bg-white/5 dark:text-white/50',
};

const MetricCard = ({ metric }: { metric: Metric }) => {
  const Icon = metric.icon;
  return (
    <div className="flex min-h-48 flex-col justify-between rounded-2xl border border-light-200 bg-light-secondary p-5 dark:border-dark-200 dark:bg-dark-secondary">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-black/60 dark:text-white/60">
            {metric.title}
          </p>
          <p className="mt-3 break-words text-3xl font-semibold leading-tight">
            {metric.score}
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-black/5 p-2 dark:bg-white/10">
          <Icon size={20} />
        </div>
      </div>
      <div>
        <p className="mt-5 text-sm leading-6 text-black/60 dark:text-white/60">
          {metric.explanation}
        </p>
        <span
          className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClasses[metric.status]}`}
        >
          {metric.status}
        </span>
      </div>
    </div>
  );
};

export default function AdminEvaluationsPage() {
  const [token, setToken] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [logs, setLogs] = useState<Logs | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => ({ 'x-admin-token': token }), [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    Promise.all([
      fetch('/api/admin/analytics/summary', { headers }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message);
        return r.json();
      }),
      fetch('/api/admin/analytics/logs?page=1&pageSize=12', { headers }).then(
        async (r) => {
          if (!r.ok) throw new Error((await r.json()).message);
          return r.json();
        },
      ),
    ])
      .then(([s, l]) => {
        setSummary(s);
        setLogs(l);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, headers]);

  const totals = summary?.totals || {};
  const quality = summary?.quality?.[0] || {};
  const total = Number(totals.total || 0);
  const citationRate = total
    ? (Number(totals.withCitations || 0) / total) * 100
    : null;
  const helpfulCount = Number(quality.helpfulCount || 0);
  const notHelpfulCount = Number(quality.notHelpfulCount || 0);
  const feedbackCount = Number(quality.feedbackCount || 0);
  const helpfulRate = feedbackCount
    ? (helpfulCount / feedbackCount) * 100
    : null;
  const latencyScore = inverseLatencyScore(totals.avgLatency);
  const costAvailable = totals.avgCost !== null && totals.avgCost !== undefined;

  const feedbackSummary = feedbackCount
    ? `${fmt(helpfulCount)} helpful / ${fmt(notHelpfulCount)} not helpful`
    : 'No feedback yet';

  const feedbackLabel = (rating: any) => {
    if (rating === 1) return 'Helpful';
    if (rating === -1) return 'Not helpful';
    return 'No feedback';
  };

  const costStatus = (value: any) =>
    value === null || value === undefined
      ? 'Unavailable — no pricing metadata'
      : `Logged estimate ${cost(value)}`;

  const evaluationStatus = (row: any) =>
    row.evaluation_score === null || row.evaluation_score === undefined
      ? 'Not evaluated yet'
      : `Generic evaluation score: ${row.evaluation_score}`;

  const metrics: Metric[] = [
    {
      title: 'Relevance',
      score: 'Not evaluated yet',
      explanation:
        'No dedicated relevance evaluation field is exposed by the current database/API, so this page does not infer relevance from other signals.',
      status: 'Waiting',
      icon: Target,
    },
    {
      title: 'Helpfulness',
      score: 'Not evaluated yet',
      explanation:
        'No dedicated evaluator-scored helpfulness field is stored. Explicit Helpful / Not helpful clicks are shown separately as user feedback.',
      status: 'Waiting',
      icon: MessageSquareHeart,
    },
    {
      title: 'User feedback',
      score: feedbackSummary,
      explanation:
        helpfulRate === null
          ? 'No explicit Helpful / Not helpful feedback has been recorded yet.'
          : `Helpful rate is ${pct(helpfulRate)} from ${fmt(feedbackCount)} explicit feedback record${feedbackCount === 1 ? '' : 's'}.`,
      status: qualityStatus(helpfulRate),
      icon: MessageSquareHeart,
    },
    {
      title: 'Grounding proxy',
      score: citationRate !== null ? pct(citationRate) : 'No query logs yet',
      explanation:
        citationRate !== null
          ? 'Proxy only: share of logged answers with citations or source evidence attached. This is not a scored groundedness evaluation.'
          : 'No logged queries are available to calculate a citation/source-evidence proxy.',
      status: qualityStatus(citationRate),
      icon: FileSearch,
    },
    {
      title: 'Citation-risk proxy',
      score:
        citationRate !== null ? pct(100 - citationRate) : 'No query logs yet',
      explanation:
        citationRate !== null
          ? 'Proxy only: share of logged answers missing citations/source evidence. Lower is better and this is not a real hallucination score.'
          : 'No logged queries are available to calculate citation-risk proxy.',
      status: qualityStatus(citationRate),
      icon: ShieldAlert,
    },
    {
      title: 'Latency',
      score: ms(totals.avgLatency),
      explanation: `Average logged response latency with P95 at ${ms(totals.p95Latency)}.`,
      status: qualityStatus(latencyScore),
      icon: Clock,
    },
    {
      title: 'Cost efficiency',
      score: costAvailable ? cost(totals.avgCost) : 'Unavailable',
      explanation: costAvailable
        ? 'Logged estimated cost is available; no separate cost-efficiency score is inferred.'
        : 'Pricing metadata is not configured, so the dashboard does not present a cost-efficiency score.',
      status: 'Waiting',
      icon: DollarSign,
    },
    {
      title: 'Overall quality',
      score: 'Not evaluated yet',
      explanation:
        'No dedicated overall quality evaluation field is exposed by the current database/API, so no composite quality score is calculated.',
      status: 'Waiting',
      icon: Target,
    },
  ];

  const hasEvaluationData = Boolean(
    total || feedbackCount || quality.evaluationCount,
  );

  return (
    <main className="min-h-screen bg-light-primary dark:bg-dark-primary lg:pl-20">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-6 border-b border-light-200/30 pb-8 dark:border-dark-200/30 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Link href="/admin/analytics" className="text-sm text-sky-500">
              ← Back to analytics
            </Link>
            <h1
              className="mt-2 text-4xl font-normal"
              style={{ fontFamily: 'PP Editorial, serif' }}
            >
              Evaluation metrics
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60 dark:text-white/60">
              Monitor AI answer quality without inferred scores: real evaluation
              fields remain marked as not evaluated, explicit user feedback is
              counted directly, and citation-based signals are labeled as
              proxies.
            </p>
          </div>
          <input
            className="rounded-xl border border-light-200 bg-transparent px-4 py-2.5 text-sm dark:border-dark-200"
            placeholder="Admin token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <ShieldAlert className="mr-2 inline" size={18} />
            {error}
          </div>
        )}
        {loading && (
          <p className="mt-6 text-sm text-black/60 dark:text-white/60">
            Loading evaluation metrics…
          </p>
        )}
        {!token && (
          <p className="mt-6 text-sm text-black/60 dark:text-white/60">
            Enter the configured admin token to load evaluation metrics. The
            backing data uses the existing protected analytics APIs.
          </p>
        )}

        {summary && (
          <>
            <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <MetricCard key={metric.title} metric={metric} />
              ))}
            </section>

            {!hasEvaluationData ? (
              <section className="mt-8 rounded-2xl border border-dashed border-light-200 bg-light-secondary p-8 text-center dark:border-dark-200 dark:bg-dark-secondary">
                <Activity className="mx-auto text-sky-500" size={34} />
                <h2 className="mt-4 text-xl font-semibold">
                  Evaluation data will appear after queries are scored
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-black/60 dark:text-white/60">
                  No query logs, explicit feedback, or evaluation records exist
                  yet. Once users submit feedback or evaluation jobs store
                  dedicated scores, this page will show those real signals
                  without inventing quality percentages.
                </p>
              </section>
            ) : (
              <section className="mt-8 rounded-2xl border border-light-200 p-5 dark:border-dark-200">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold">
                      <TrendingUp size={18} /> Recent evaluation records
                    </h2>
                    <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                      Separates query text, explicit user feedback, notes,
                      citation-based grounding proxy, latency, cost metadata,
                      and evaluation status from recent queries.
                    </p>
                  </div>
                  <Link
                    href="/admin/analytics/query-logs"
                    className="text-xs text-sky-500"
                  >
                    Open full query logs →
                  </Link>
                </div>
                <div className="overflow-x-auto rounded-xl border border-light-200/40 dark:border-dark-200/40">
                  <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
                    <thead className="text-xs text-black/50 dark:text-white/50">
                      <tr>
                        <th className="px-3 py-3 font-medium">Created</th>
                        <th className="px-3 py-3 font-medium">Query</th>
                        <th className="px-3 py-3 font-medium">
                          Explicit user feedback
                        </th>
                        <th className="px-3 py-3 font-medium">Feedback note</th>
                        <th className="px-3 py-3 font-medium">
                          Grounding/citations
                        </th>
                        <th className="px-3 py-3 font-medium">Latency</th>
                        <th className="px-3 py-3 font-medium">Cost status</th>
                        <th className="px-3 py-3 font-medium">
                          Evaluation status
                        </th>
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
                              {feedbackLabel(r.feedback_rating)}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {r.feedback_text || 'No note'}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {fmt(r.citation_count)} citations
                            </td>
                            <td className="px-3 py-4 align-top">
                              {ms(r.latency_ms)}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {costStatus(r.estimated_cost)}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {evaluationStatus(r)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            className="px-3 py-6 text-center text-black/60 dark:text-white/60"
                            colSpan={8}
                          >
                            No recent evaluation records yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
