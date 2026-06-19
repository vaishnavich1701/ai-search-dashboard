import { repairJson } from '@toolsycc/json-repair';
import z from 'zod';

const preview = (value: string) =>
  value.replace(/\s+/g, ' ').trim().slice(0, 500);

const escapeControlCharsInStrings = (value: string) => {
  let output = '';
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      output += char;
      continue;
    }

    if (inString) {
      if (char === '\n') {
        output += '\\n';
        continue;
      }
      if (char === '\r') {
        output += '\\r';
        continue;
      }
      if (char === '\t') {
        output += '\\t';
        continue;
      }
    }

    output += char;
  }

  return output;
};

const parseJsonCandidate = (candidate: string) => {
  const attempts = [candidate];

  try {
    const repaired = repairJson(candidate, { extractJson: true }) as string;
    if (repaired && !attempts.includes(repaired)) attempts.push(repaired);
  } catch {
    // Keep the original parse error path below.
  }

  attempts.push(...attempts.map(escapeControlCharsInStrings));

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
};

export const parseStructuredJson = <T extends z.ZodTypeAny>(input: {
  content: string | null | undefined;
  schema: T;
  providerName: string;
}): z.infer<T> => {
  const content = input.content ?? '';

  try {
    return input.schema.parse(parseJsonCandidate(content));
  } catch (err) {
    console.error(`Failed to parse structured ${input.providerName} response`, {
      error: err instanceof Error ? err.message : String(err),
      preview: preview(content),
    });
    throw new Error(
      `Failed to parse structured ${input.providerName} response. Please retry or switch models.`,
    );
  }
};
