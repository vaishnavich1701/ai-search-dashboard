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

export const getCitationCount = (blocks: Block[]) => {
  const explicitSourceCount = blocks.reduce((count, block) => {
    if (block.type === 'source' && Array.isArray(block.data)) {
      return count + block.data.length;
    }
    return count;
  }, 0);

  if (explicitSourceCount > 0) return explicitSourceCount;

  return blocks.reduce((count, block) => {
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
};

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

const getWeatherAtLocation = async (
  location?: { latitude?: number | null; longitude?: number | null } | null,
) => {
  if (location?.latitude === undefined || location.latitude === null)
    return null;
  if (location?.longitude === undefined || location.longitude === null)
    return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m&timezone=auto`,
      { signal: controller.signal },
    );

    if (!response.ok) return null;
    const data = await response.json();

    return JSON.stringify({
      current: data.current ?? null,
      units: data.current_units ?? null,
      timezone: data.timezone ?? null,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const getClientContext = (userAgent?: string | null) => {
  const ua = userAgent || '';
  const lower = ua.toLowerCase();
  const browser = lower.includes('edg/')
    ? 'Edge'
    : lower.includes('opr/') || lower.includes('opera')
      ? 'Opera'
      : lower.includes('chrome/') || lower.includes('crios/')
        ? 'Chrome'
        : lower.includes('firefox/') || lower.includes('fxios/')
          ? 'Firefox'
          : lower.includes('safari/')
            ? 'Safari'
            : ua
              ? 'Unknown'
              : null;
  const os = lower.includes('windows')
    ? 'Windows'
    : lower.includes('mac os x') || lower.includes('macintosh')
      ? 'macOS'
      : lower.includes('android')
        ? 'Android'
        : lower.includes('iphone') ||
            lower.includes('ipad') ||
            lower.includes('ios')
          ? 'iOS/iPadOS'
          : lower.includes('linux')
            ? 'Linux'
            : ua
              ? 'Unknown'
              : null;
  const device =
    lower.includes('mobile') ||
    lower.includes('iphone') ||
    lower.includes('android')
      ? 'mobile'
      : lower.includes('ipad') || lower.includes('tablet')
        ? 'tablet'
        : ua
          ? 'laptop/desktop'
          : null;

  return { browser, os, device };
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
  optimizationMode?: string | null;
  sources?: unknown[] | null;
  location?: {
    area?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    timezone?: string | null;
    source?: string | null;
  } | null;
  userAgent?: string | null;
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

  const weatherData = await getWeatherAtLocation(input.location);
  const clientContext = getClientContext(input.userAgent);

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
    optimizationMode: input.optimizationMode ?? null,
    sources: input.sources?.length ? JSON.stringify(input.sources) : null,
    sourceCount: input.responseBlocks
      ? getCitationCount(input.responseBlocks)
      : (input.sources?.length ?? null),
    geoArea: input.location?.area ?? null,
    geoCity: input.location?.city ?? null,
    geoRegion: input.location?.region ?? null,
    geoCountry: input.location?.country ?? null,
    geoLatitude:
      input.location?.latitude === undefined ||
      input.location?.latitude === null
        ? null
        : Math.round(input.location.latitude * 1_000_000),
    geoLongitude:
      input.location?.longitude === undefined ||
      input.location?.longitude === null
        ? null
        : Math.round(input.location.longitude * 1_000_000),
    geoTimezone: input.location?.timezone ?? null,
    geoSource: input.location?.source ?? null,
    weatherData,
    userAgent: input.userAgent ?? null,
    browser: clientContext.browser,
    os: clientContext.os,
    device: clientContext.device,
    createdAt: new Date().toISOString(),
  });
};
