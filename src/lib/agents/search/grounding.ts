import { Chunk } from '@/lib/types';

const MAX_SOURCE_CONTENT_CHARS = 3500;
const MAX_TOTAL_CONTEXT_CHARS = 24000;

export const countInlineCitations = (answer: string) => {
  const matches = answer.match(/\[(?:\d+)(?:\]\[\d+|,\s*\d+)*\]/g);
  return matches?.length ?? 0;
};

const stringifyMetadataValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}…`;
};

export const sourceDebugSummary = (sources: Chunk[], limit = 5) =>
  sources.slice(0, limit).map((source, index) => ({
    index: index + 1,
    title: stringifyMetadataValue(source.metadata.title) ?? 'Untitled source',
    url: stringifyMetadataValue(source.metadata.url) ?? 'Unknown URL',
  }));

export const buildGroundedSearchContext = (sources: Chunk[]) => {
  let totalLength = 0;
  const results: string[] = [];

  for (const [index, source] of sources.entries()) {
    const content = truncate(
      normalizeWhitespace(source.content || ''),
      MAX_SOURCE_CONTENT_CHARS,
    );

    if (!content) continue;

    const payload: Record<string, string | number> = {
      index: index + 1,
      title: stringifyMetadataValue(source.metadata.title) ?? 'Untitled source',
      url: stringifyMetadataValue(source.metadata.url) ?? 'Unknown URL',
      content,
    };

    const publishedDate =
      stringifyMetadataValue(source.metadata.publishedDate) ??
      stringifyMetadataValue(source.metadata.published_date) ??
      stringifyMetadataValue(source.metadata.date);

    if (publishedDate) payload.date = publishedDate;

    const serialized = `<result>${JSON.stringify(payload)}</result>`;
    if (totalLength + serialized.length > MAX_TOTAL_CONTEXT_CHARS) break;

    results.push(serialized);
    totalLength += serialized.length;
  }

  return {
    context: results.join('\n'),
    length: totalLength,
    sourceCount: results.length,
  };
};

export const buildGroundedFallbackAnswer = (query: string, sources: Chunk[]) => {
  const usableSources = sources
    .map((source, index) => ({ source, index: index + 1 }))
    .filter(({ source }) => normalizeWhitespace(source.content || '').length > 0)
    .slice(0, 5);

  if (usableSources.length === 0) {
    return 'Hmm, sorry I could not find any relevant information on this topic. Please refresh the page and try again, search again, or ask something else.';
  }

  const bullets = usableSources.map(({ source, index }) => {
    const title = stringifyMetadataValue(source.metadata.title) ?? `Source ${index}`;
    const content = truncate(normalizeWhitespace(source.content), 500);
    return `- ${title}: ${content}[${index}]`;
  });

  return [
    `I found sources for “${query}”, but the generated answer was not sufficiently grounded in citations, so here is a source-only summary based on the retrieved snippets:`,
    '',
    ...bullets,
    '',
    'The available retrieved snippets may be insufficient for a complete answer; please run the search again if you need more detail.',
  ].join('\n');
};
