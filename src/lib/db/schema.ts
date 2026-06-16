import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { Block } from '../types';
import { SearchSources } from '../agents/search/types';

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey(),
  messageId: text('messageId').notNull(),
  chatId: text('chatId').notNull(),
  backendId: text('backendId').notNull(),
  query: text('query').notNull(),
  createdAt: text('createdAt').notNull(),
  responseBlocks: text('responseBlocks', { mode: 'json' })
    .$type<Block[]>()
    .default(sql`'[]'`),
  status: text({ enum: ['answering', 'completed', 'error'] }).default(
    'answering',
  ),
});

interface DBFile {
  name: string;
  fileId: string;
}

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('createdAt').notNull(),
  sources: text('sources', {
    mode: 'json',
  })
    .$type<SearchSources[]>()
    .default(sql`'[]'`),
  files: text('files', { mode: 'json' })
    .$type<DBFile[]>()
    .default(sql`'[]'`),
});

export const queryAnalytics = sqliteTable('query_analytics', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  userId: text('user_id'),
  queryText: text('query_text').notNull(),
  model: text('model'),
  provider: text('provider'),
  status: text('status', { enum: ['success', 'error'] }).notNull(),
  errorMessage: text('error_message'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  latencyMs: integer('latency_ms'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  estimatedCost: integer('estimated_cost'),
  responseId: text('response_id'),
  messageId: text('message_id'),
  chatId: text('chat_id'),
  citationCount: integer('citation_count'),
  feedbackRating: integer('feedback_rating'),
  feedbackText: text('feedback_text'),
  evaluationScore: integer('evaluation_score'),
  createdAt: text('created_at').notNull(),
});
