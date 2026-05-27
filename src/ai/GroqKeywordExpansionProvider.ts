/**
 * @module ai/GroqKeywordExpansionProvider
 *
 * Calls Groq API (OpenAI-compatible) to expand a keyword into
 * related business search phrases.
 *
 * Behavior:
 *   - Timeout: 3 seconds via AbortController
 *   - Retry: once on failure
 *   - Failure: returns [] (never throws)
 *   - Response: JSON-only, parsed and validated defensively
 */

import type {
  IKeywordExpansionProvider,
  ExpandedKeyword,
  ExpansionOptions,
  KeywordPopularity,
  KeywordCategory,
} from "./IKeywordExpansionProvider.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 3_000;
const MODEL = "llama3-8b-8192";

const VALID_POPULARITIES = new Set<string>(["high", "medium", "low"]);
const VALID_CATEGORIES = new Set<string>([
  "commercial", "local", "synonym", "long_tail", "intent",
]);

function isValidPopularity(v: unknown): v is KeywordPopularity {
  return typeof v === "string" && VALID_POPULARITIES.has(v);
}
function isValidCategory(v: unknown): v is KeywordCategory {
  return typeof v === "string" && VALID_CATEGORIES.has(v);
}

function parseGroqResponse(raw: unknown, limit: number): ExpandedKeyword[] {
  if (!Array.isArray(raw)) return [];
  const results: ExpandedKeyword[] = [];
  for (const item of raw) {
    if (
      typeof item !== "object" || item === null ||
      typeof (item as Record<string, unknown>).keyword !== "string" ||
      !isValidPopularity((item as Record<string, unknown>).popularity) ||
      !isValidCategory((item as Record<string, unknown>).category)
    ) continue;
    results.push({
      keyword: (item as Record<string, unknown>).keyword as string,
      popularity: (item as Record<string, unknown>).popularity as KeywordPopularity,
      category: (item as Record<string, unknown>).category as KeywordCategory,
    });
    if (results.length >= limit) break;
  }
  return results;
}

function buildPrompt(keyword: string, location: string | undefined, limit: number): string {
  const locationClause = location ? ` in ${location}` : "";
  return [
    `Expand the business search keyword "${keyword}"${locationClause} into ${limit} related search phrases.`,
    'Focus on: popular business search phrases, high commercial intent, local variants, synonyms, long-tail variants.',
    'Avoid duplicates. Output ONLY a JSON array, no explanation, no markdown.',
    `Each item must have exactly these fields: keyword (string), popularity ("high"|"medium"|"low"), category ("commercial"|"local"|"synonym"|"long_tail"|"intent").`,
    `Example: [{"keyword":"emergency plumber","popularity":"high","category":"commercial"}]`,
  ].join(" ");
}

export class GroqKeywordExpansionProvider implements IKeywordExpansionProvider {
  constructor(private readonly apiKey: string) {}

  async expand(keyword: string, options?: ExpansionOptions): Promise<ExpandedKeyword[]> {
    const limit = options?.limit ?? 10;
    const location = options?.location;
    return this._withRetry(() => this._call(keyword, location, limit));
  }

  private async _withRetry(fn: () => Promise<ExpandedKeyword[]>): Promise<ExpandedKeyword[]> {
    try {
      return await fn();
    } catch {
      try { return await fn(); } catch { return []; }
    }
  }

  private async _call(keyword: string, location: string | undefined, limit: number): Promise<ExpandedKeyword[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "You are a business search keyword expert. Respond ONLY with a valid JSON array. No explanation, no markdown, no prose." },
            { role: "user", content: buildPrompt(keyword, location, limit) },
          ],
          temperature: 0.4,
          max_tokens: 512,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return [];

      const data = (await response.json()) as unknown;
      const choices = data && typeof data === "object" && "choices" in data
        ? (data as Record<string, unknown>).choices
        : null;
      if (!Array.isArray(choices) || choices.length === 0) return [];

      const message = (choices[0] as Record<string, unknown>).message;
      const content = message && typeof message === "object"
        ? (message as Record<string, unknown>).content
        : null;
      if (typeof content !== "string") return [];

      const cleaned = content.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      let parsed: unknown;
      try { parsed = JSON.parse(cleaned); } catch { return []; }

      return parseGroqResponse(parsed, limit);
    } finally {
      clearTimeout(timer);
    }
  }
}