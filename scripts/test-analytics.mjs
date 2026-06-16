import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vane-analytics-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_ANALYTICS_TOKEN = 'test-admin-token';
process.env.ANALYTICS_FEEDBACK_TOKEN = 'test-feedback-token';
fs.mkdirSync(path.join(tmp, 'data'));
fs.cpSync(path.join(process.cwd(), 'drizzle'), path.join(tmp, 'drizzle'), {
  recursive: true,
});

await import('../src/lib/db/migrate.ts');

const sqlite = new Database(path.join(tmp, 'data/db.sqlite'));
const insert = sqlite.prepare(
  `INSERT INTO query_analytics (id, query_text, model, provider, status, error_message, started_at, completed_at, latency_ms, prompt_tokens, completion_tokens, total_tokens, estimated_cost, response_id, message_id, chat_id, citation_count, created_at, user_id, organization_id) VALUES (@id, @query_text, @model, @provider, @status, @error_message, @started_at, @completed_at, @latency_ms, @prompt_tokens, @completion_tokens, @total_tokens, @estimated_cost, @response_id, @message_id, @chat_id, @citation_count, @created_at, @user_id, @organization_id)`,
);
insert.run({
  id: 'qa_1',
  query_text: 'What is Vane?',
  model: 'gpt-test',
  provider: 'openai',
  status: 'success',
  error_message: null,
  started_at: '2026-06-16T00:00:00.000Z',
  completed_at: '2026-06-16T00:00:01.000Z',
  latency_ms: 1000,
  prompt_tokens: 10,
  completion_tokens: 20,
  total_tokens: 30,
  estimated_cost: null,
  response_id: 'r1',
  message_id: 'm1',
  chat_id: 'c1',
  citation_count: 2,
  created_at: '2026-06-16T00:00:01.000Z',
  user_id: 'u1',
  organization_id: 'org1',
});
insert.run({
  id: 'qa_2',
  query_text: 'Failing query',
  model: 'gpt-test',
  provider: 'openai',
  status: 'error',
  error_message: 'provider failed',
  started_at: '2026-06-16T00:01:00.000Z',
  completed_at: '2026-06-16T00:01:03.000Z',
  latency_ms: 3000,
  prompt_tokens: 12,
  completion_tokens: null,
  total_tokens: 12,
  estimated_cost: null,
  response_id: 'r2',
  message_id: 'm2',
  chat_id: 'c2',
  citation_count: 0,
  created_at: '2026-06-16T00:01:03.000Z',
  user_id: 'u2',
  organization_id: 'org1',
});

const { getAnalyticsSummary, getAnalyticsLogs } =
  await import('../src/lib/analyticsQueries.ts');
const { isAdminRequest } = await import('../src/lib/adminAuth.ts');
const { isFeedbackAuthorized } = await import('../src/lib/feedbackAuth.ts');
const { getTrustedRequestActor } = await import('../src/lib/requestActor.ts');

const summary = getAnalyticsSummary({ provider: 'openai' });
assert.equal(summary.totals.total, 2);
assert.equal(summary.totals.success, 1);
assert.equal(summary.totals.errors, 1);
assert.equal(summary.totals.withCitations, 1);
assert.equal(summary.totals.p95Latency, 3000);
assert.equal(summary.modelMetrics[0].model, 'gpt-test');

const pageOne = getAnalyticsLogs({ status: 'success' }, 1, 1);
assert.equal(pageOne.total, 1);
assert.equal(pageOne.rows[0].status, 'success');
assert.equal(pageOne.totalPages, 1);
assert.equal(pageOne.rows[0].query_text_truncated, false);

assert.equal(
  isAdminRequest(
    new Request('http://local', {
      headers: { 'x-admin-token': 'test-admin-token' },
    }),
  ),
  true,
);
assert.equal(
  isAdminRequest(
    new Request('http://local', { headers: { 'x-admin-token': 'wrong' } }),
  ),
  false,
);
assert.equal(isAdminRequest(new Request('http://local')), false);
assert.equal(isFeedbackAuthorized(new Request('http://local')), false);
assert.equal(
  isFeedbackAuthorized(
    new Request('http://local', {
      headers: { 'x-feedback-token': 'test-feedback-token' },
    }),
  ),
  true,
);
assert.deepEqual(
  getTrustedRequestActor(
    new Request('http://local', {
      headers: { 'x-user-id': 'forged', 'x-organization-id': 'forged-org' },
    }),
  ),
  { userId: null, organizationId: null },
);
process.env.TRUSTED_ANALYTICS_IDENTITY_HEADERS = 'true';
assert.deepEqual(
  getTrustedRequestActor(
    new Request('http://local', {
      headers: { 'x-user-id': 'trusted-user', 'x-tenant-id': 'trusted-tenant' },
    }),
  ),
  { userId: 'trusted-user', organizationId: 'trusted-tenant' },
);

console.log('analytics checks passed');
