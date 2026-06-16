import db from '@/lib/db';
import { queryAnalytics } from '@/lib/db/schema';
import { Block } from '@/lib/types';
import { getTokenCount } from '@/lib/utils/splitText';

export type AnalyticsStatus = 'success' | 'error';

export const MICRO_USD = 1_000_000;

const getText = (blocks: Block[]) =>
  blocks
    .filter((block) => block.type === 'text')
    .map((block) => ('data' in block ? block.data : ''))
    .join('\n');

export const getCitationCount = (blocks: Block[]) =>
  blocks.reduce((count, block) => {
    if (block.type === 'source' && Array.isArray(block.data)) {
      return count + block.data.length;
    }
    if (block.type === 'research') {
      return (
        count +
        block.data.subSteps.reduce((nestedCount, step) => {
          if (step.type === 'search_results')
            return nestedCount + step.reading.length;
          if (step.type === 'upload_search_results')
            return nestedCount + step.results.length;
          return nestedCount;
        }, 0)
      );
    }
    return count;
  }, 0);

export const estimateTokens = (input: {
  queryText: string;
  responseBlocks?: Block[];
}) => {
  const promptTokens = getTokenCount(input.queryText);
  const completionTokens = input.responseBlocks
    ? getTokenCount(getText(input.responseBlocks))
    : null;

  return {
    promptTokens,
    completionTokens,
    totalTokens:
      completionTokens === null
        ? promptTokens
        : promptTokens + completionTokens,
  };
};

export const estimateCostMicroUsd = () => {
  // No model pricing metadata exists in this app today. Keep the persisted value
  // null rather than inventing costs. This function is intentionally centralized
  // so provider metadata can be wired in later without changing capture sites.
  return null;
};

export const recordQueryAnalytics = async (input: {
  queryText: string;
  model?: string | null;
  provider?: string | null;
  status: AnalyticsStatus;
  errorMessage?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
  responseBlocks?: Block[];
  responseId?: string | null;
  messageId?: string | null;
  chatId?: string | null;
  userId?: string | null;
  organizationId?: string | null;
}) => {
  const completedAt = input.completedAt ?? new Date();
  const latencyMs = Math.max(
    0,
    completedAt.getTime() - input.startedAt.getTime(),
  );
  const tokenEstimate = estimateTokens({
    queryText: input.queryText,
    responseBlocks: input.responseBlocks,
  });

  await db.insert(queryAnalytics).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    queryText: input.queryText,
    model: input.model ?? null,
    provider: input.provider ?? null,
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    startedAt: input.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    latencyMs,
    promptTokens: tokenEstimate.promptTokens,
    completionTokens: tokenEstimate.completionTokens,
    totalTokens: tokenEstimate.totalTokens,
    estimatedCost: estimateCostMicroUsd(),
    responseId: input.responseId ?? null,
    messageId: input.messageId ?? null,
    chatId: input.chatId ?? null,
    citationCount: input.responseBlocks
      ? getCitationCount(input.responseBlocks)
      : 0,
    createdAt: new Date().toISOString(),
  });
};
