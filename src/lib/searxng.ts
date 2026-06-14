import { getSearxngURL } from './config/serverRegistry';

export interface SearxngSearchOptions {
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
}

interface SearxngSearchResult {
  title: string;
  url: string;
  img_src?: string;
  thumbnail_src?: string;
  thumbnail?: string;
  content?: string;
  author?: string;
  iframe_src?: string;
}

export class SearxngUnavailableError extends Error {
  constructor(
    message = 'Search is temporarily unavailable. Please retry in a few seconds. If it still does not work, refresh the page and try again.',
  ) {
    super(message);
    this.name = 'SearxngUnavailableError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const searchSearxng = async (
  query: string,
  opts?: SearxngSearchOptions,
) => {
  const searxngURL = getSearxngURL();

  const url = new URL(`${searxngURL}/search?format=json`);
  url.searchParams.append('q', query);

  if (opts) {
    Object.keys(opts).forEach((key) => {
      const value = opts[key as keyof SearxngSearchOptions];
      if (Array.isArray(value)) {
        url.searchParams.append(key, value.join(','));
        return;
      }
      url.searchParams.append(key, value as string);
    });
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`SearXNG error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      const results: SearxngSearchResult[] = data.results ?? [];
      const suggestions: string[] = data.suggestions ?? [];

      return { results, suggestions };
    } catch (err: any) {
      lastError = err;
      if (attempt === 0) {
        await sleep(500);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const reason =
    lastError instanceof Error && lastError.name === 'AbortError'
      ? 'SearXNG search timed out'
      : lastError instanceof Error
        ? lastError.message
        : 'SearXNG request failed';

  console.warn('SearXNG unavailable:', reason);
  throw new SearxngUnavailableError();
};
