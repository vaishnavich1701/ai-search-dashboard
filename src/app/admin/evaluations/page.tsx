'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Clock,
  DollarSign,
  FileSearch,
  MessageSquareHeart,
  ShieldAlert,
  Sparkles,
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
  const successRate = total
    ? (Number(totals.success || 0) / total) * 100
    : null;
  const citationRate = total
    ? (Number(totals.withCitations || 0) / total) * 100
    : null;
  const feedbackScore = boundedPercent(
    quality.avgFeedback === null || quality.avgFeedback === undefined
      ? null
      : Number(quality.avgFeedback) * 20,
  );
  const evaluationScore = boundedPercent(quality.avgEvaluation);
  const latencyScore = inverseLatencyScore(totals.avgLatency);
  const costScore =
    totals.avgCost === null || totals.avgCost === undefined
      ? null
      : boundedPercent(100 - Number(totals.avgCost) / 1000);
  const overallInputs = [
    successRate,
    citationRate,
    feedbackScore,
    evaluationScore,
    latencyScore,
    costScore,
  ].filter((n): n is number => n !== null && n !== undefined);
  const overallScore = overallInputs.length
    ? overallInputs.reduce((sum, n) => sum + n, 0) / overallInputs.length
    : null;

  const metrics: Metric[] = [
    {
      title: 'Relevance',
      score: evaluationScore !== null ? pct(evaluationScore) : 'Pending',
      explanation:
        evaluationScore !== null
          ? 'Average stored evaluation score for how directly answers satisfy the query intent.'
          : 'No dedicated relevance scores are stored yet; this will populate when evaluations are recorded.',
      status: qualityStatus(evaluationScore),
      icon: Target,
    },
    {
      title: 'User-rated helpfulness',
      score: feedbackScore !== null ? pct(feedbackScore) : 'Pending',
      explanation:
        feedbackScore !== null
          ? 'Derived only from explicit user Helpful / Not helpful ratings to reflect whether answers were useful in practice.'
          : 'Waiting for user feedback ratings or evaluator scores to establish helpfulness.',
      status: qualityStatus(feedbackScore),
      icon: MessageSquareHeart,
    },
    {
      title: 'Groundedness',
      score: citationRate !== null ? pct(citationRate) : 'Pending',
      explanation:
        citationRate !== null
          ? 'Share of recorded answers with citations or source evidence attached.'
          : 'No scored queries are available to calculate source grounding yet.',
      status: qualityStatus(citationRate),
      icon: FileSearch,
    },
    {
      title: 'Hallucination risk',
      score: citationRate !== null ? pct(100 - citationRate) : 'Pending',
      explanation:
        citationRate !== null
          ? 'A proxy risk indicator based on answers that lack citations; lower is better.'
          : 'Risk will be estimated once queries include citation and evaluation data.',
      status: qualityStatus(citationRate),
      icon: ShieldAlert,
    },
    {
      title: 'Latency',
      score: ms(totals.avgLatency),
      explanation: `Average response latency with P95 at ${ms(totals.p95Latency)} for recent logged queries.`,
      status: qualityStatus(latencyScore),
      icon: Clock,
    },
    {
      title: 'Cost efficiency',
      score: cost(totals.avgCost),
      explanation:
        totals.avgCost === null || totals.avgCost === undefined
          ? 'Pricing metadata is not configured, so the dashboard avoids presenting fake cost estimates.'
          : 'Average estimated cost per query, normalized into an efficiency signal.',
      status: qualityStatus(costScore),
      icon: DollarSign,
    },
    {
      title: 'User rating score',
      score: feedbackScore !== null ? pct(feedbackScore) : 'Pending',
      explanation: `${fmt(quality.feedbackCount)} feedback records captured from explicit user answer ratings.`,
      status: qualityStatus(feedbackScore),
      icon: BadgeCheck,
    },
    {
      title: 'Overall quality score',
      score: overallScore !== null ? pct(overallScore) : 'Pending',
      explanation:
        overallScore !== null
          ? 'Composite view across available success, grounding, feedback, evaluation, latency, and cost signals.'
          : 'Overall quality needs at least one scored query, feedback signal, or evaluation record.',
      status: qualityStatus(overallScore),
      icon: Sparkles,
    },
  ];

  const hasEvaluationData = Boolean(
    total || quality.feedbackCount || quality.evaluationCount,
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
              Monitor AI answer quality across relevance, user-rated
              helpfulness, groundedness, hallucination risk, latency, cost
              efficiency, feedback, and overall performance.
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
                  Evaluations will appear after queries are scored
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-black/60 dark:text-white/60">
                  No evaluation records, feedback ratings, or scored query logs
                  exist yet. Once queries are rated by users or evaluation jobs,
                  this page will summarize quality trends and list the most
                  recent records for review.
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
                      Includes available evaluation, user rating, grounding,
                      latency, and cost signals from recent queries.
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
                        <th className="px-3 py-3 font-medium">Evaluation</th>
                        <th className="px-3 py-3 font-medium">User rating</th>
                        <th className="px-3 py-3 font-medium">Grounding</th>
                        <th className="px-3 py-3 font-medium">Latency</th>
                        <th className="px-3 py-3 font-medium">Cost</th>
                        <th className="px-3 py-3 font-medium">Status</th>
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
                              {r.evaluation_score ?? '—'}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {r.feedback_rating ?? '—'}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {fmt(r.citation_count)} citations
                            </td>
                            <td className="px-3 py-4 align-top">
                              {ms(r.latency_ms)}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {cost(r.estimated_cost)}
                            </td>
                            <td className="px-3 py-4 align-top">{r.status}</td>
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
