import Database from 'better-sqlite3';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const sqlite = new Database(path.join(DATA_DIR, './data/db.sqlite'));

type Filters = {
  start?: string | null;
  end?: string | null;
  model?: string | null;
  provider?: string | null;
  status?: string | null;
  userId?: string | null;
  organizationId?: string | null;
};

const where = (filters: Filters) => {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  if (filters.start) {
    clauses.push('created_at >= @start');
    params.start = filters.start;
  }
  if (filters.end) {
    clauses.push('created_at <= @end');
    params.end = filters.end;
  }
  if (filters.model) {
    clauses.push('model = @model');
    params.model = filters.model;
  }
  if (filters.provider) {
    clauses.push('provider = @provider');
    params.provider = filters.provider;
  }
  if (filters.status) {
    clauses.push('status = @status');
    params.status = filters.status;
  }
  if (filters.userId) {
    clauses.push('user_id = @userId');
    params.userId = filters.userId;
  }
  if (filters.organizationId) {
    clauses.push('organization_id = @organizationId');
    params.organizationId = filters.organizationId;
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
};

const MAX_QUERY_TEXT_LENGTH = 500;

const truncateQueryText = (row: any) => {
  const queryText = String(row.query_text ?? '');
  return {
    ...row,
    query_text:
      queryText.length > MAX_QUERY_TEXT_LENGTH
        ? `${queryText.slice(0, MAX_QUERY_TEXT_LENGTH)}…`
        : queryText,
    query_text_truncated: queryText.length > MAX_QUERY_TEXT_LENGTH,
  };
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
};

export const getAnalyticsSummary = (filters: Filters) => {
  const w = where(filters);
  const scalar = sqlite
    .prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors, SUM(CASE WHEN citation_count > 0 THEN 1 ELSE 0 END) as withCitations, SUM(CASE WHEN citation_count IS NULL OR citation_count = 0 THEN 1 ELSE 0 END) as withoutCitations, AVG(latency_ms) as avgLatency, SUM(estimated_cost) as totalCost, AVG(estimated_cost) as avgCost, SUM(prompt_tokens) as promptTokens, SUM(completion_tokens) as completionTokens, SUM(total_tokens) as totalTokens FROM query_analytics ${w.sql}`,
    )
    .get(w.params) as any;
  const latencyWhere = w.sql
    ? `${w.sql} AND latency_ms IS NOT NULL`
    : 'WHERE latency_ms IS NOT NULL';
  const latencies = sqlite
    .prepare(`SELECT latency_ms FROM query_analytics ${latencyWhere}`)
    .all(w.params)
    .map((r: any) => r.latency_ms as number);
  const group = (select: string, extra = '') =>
    sqlite
      .prepare(`${select} FROM query_analytics ${w.sql} ${extra}`)
      .all(w.params);
  return {
    totals: {
      ...scalar,
      p50Latency: percentile(latencies, 50),
      p95Latency: percentile(latencies, 95),
    },
    queryTrend: group(
      "SELECT date(created_at) as date, COUNT(*) as total, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors",
      'GROUP BY date(created_at) ORDER BY date(created_at)',
    ),
    modelMetrics: group(
      "SELECT COALESCE(model, 'Unknown') as model, COALESCE(provider, 'Unknown') as provider, COUNT(*) as total, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors, AVG(latency_ms) as avgLatency, AVG(total_tokens) as avgTokens, SUM(estimated_cost) as estimatedCost",
      'GROUP BY model, provider ORDER BY total DESC',
    ),
    latencyTrend: group(
      'SELECT date(created_at) as date, AVG(latency_ms) as avgLatency',
      'GROUP BY date(created_at) ORDER BY date(created_at)',
    ),
    costTrend: group(
      'SELECT date(created_at) as date, SUM(estimated_cost) as estimatedCost, SUM(total_tokens) as totalTokens',
      'GROUP BY date(created_at) ORDER BY date(created_at)',
    ),
    modelTrend: group(
      "SELECT date(created_at) as date, COALESCE(model, 'Unknown') as model, COALESCE(provider, 'Unknown') as provider, COUNT(*) as total",
      'GROUP BY date(created_at), model, provider ORDER BY date(created_at)',
    ),
    quality: group(
      'SELECT COUNT(*) as total, AVG(citation_count) as avgCitations, SUM(CASE WHEN citation_count > 0 THEN 1 ELSE 0 END) as withCitations, COUNT(feedback_rating) as feedbackCount, SUM(CASE WHEN feedback_rating = 1 THEN 1 ELSE 0 END) as helpfulCount, SUM(CASE WHEN feedback_rating = -1 THEN 1 ELSE 0 END) as notHelpfulCount, AVG(feedback_rating) as avgFeedback, COUNT(evaluation_score) as evaluationCount, AVG(evaluation_score) as avgEvaluation',
    ),
    byUser: group(
      "SELECT COALESCE(user_id, 'Anonymous') as userId, COALESCE(organization_id, 'None') as organizationId, COUNT(*) as total",
      'GROUP BY user_id, organization_id ORDER BY total DESC LIMIT 20',
    ),
    byLocation: group(
      "SELECT COALESCE(geo_country, 'Unknown') as country, COALESCE(geo_region, '') as region, COALESCE(geo_city, '') as city, COUNT(*) as total",
      'GROUP BY geo_country, geo_region, geo_city ORDER BY total DESC LIMIT 20',
    ),
    byOptimizationMode: group(
      "SELECT COALESCE(optimization_mode, 'Unknown') as mode, COUNT(*) as total",
      'GROUP BY optimization_mode ORDER BY total DESC',
    ),
  };
};

export const getAnalyticsLogs = (
  filters: Filters,
  page: number,
  pageSize: number,
  slowest = false,
) => {
  const w = where(filters);
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  const total = (
    sqlite
      .prepare(`SELECT COUNT(*) as total FROM query_analytics ${w.sql}`)
      .get(w.params) as any
  ).total as number;
  const rows = sqlite
    .prepare(
      `SELECT * FROM query_analytics ${w.sql} ORDER BY ${slowest ? 'latency_ms DESC NULLS LAST,' : ''} created_at DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ ...w.params, limit, offset })
    .map(truncateQueryText);
  return {
    rows,
    page,
    pageSize: limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
};
