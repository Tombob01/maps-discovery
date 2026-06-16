/**
 * @module ai/GroqKeywordExpansionProvider
 *
 * Calls Groq API (OpenAI-compatible) to expand a keyword into
 * related business search phrases.
 *
 * Behavior:
 *   - Timeout: 10 seconds via AbortController
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
  ExpansionStrategy,
} from "./IKeywordExpansionProvider.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 30_000;
const MODEL = "llama-3.3-70b-versatile";

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

function buildCommercialPrompt(keyword: string, location: string | undefined, limit: number): string {
  const locationInstruction = location
    ? ` The original keyword includes the location "${location}". Preserve this location in every suggestion. Do not substitute it with a different city, region, or area.`
    : "";

  return [
    `Generate up to ${limit} alternative Google Maps search queries that preserve the exact same search intent as "${keyword}".`,
    `Return fewer if insufficient high-quality suggestions exist.`,
    `Do not generate near-duplicates merely to reach the requested count.`,
    `Quality is more important than quantity. Return fewer suggestions rather than weak, repetitive, or low-confidence suggestions.`,
    `Return only keywords that are commonly searched on Google Maps. Avoid obscure, uncommon, rarely-used industry terminology. Prefer phrases a real customer would naturally search.`,
    locationInstruction,
    `Commercial suggestions must preserve the exact same search intent. Only wording may change.`,
    `Governing test: if a user searched for "${keyword}" and then searched for your suggestion, would they still be looking for essentially the same thing?`,
    `If YES ? keep it. If NO ? reject it.`,
    `A suggestion may: rephrase the keyword, use synonyms, use common industry naming variations.`,
    `A suggestion may NOT: add modifiers such as emergency, licensed, certified, residential, commercial, professional, expert, specialist, master, affordable, local, or 24-hour; add specialisations; add services; broaden or narrow the search intent.`,
    `Before outputting a suggestion, verify that only the wording changed and the intent remained identical.`,
    `If a candidate changes the intent in any way, reject it and generate a different candidate.`,
    `POSITIVE EXAMPLES — wording changed, intent identical:`,
    `Seed "plumber Austin TX" ? "plumbing company Austin TX", "plumbing contractor Austin TX", "plumbing services Austin TX"`,
    `Seed "roof repair Houston TX" ? "roofing repair Houston TX", "roof leak repair Houston TX", "roof restoration Houston TX"`,
    `Seed "cosmetic dentist Austin TX" ? "aesthetic dentist Austin TX", "cosmetic dental services Austin TX", "smile makeover dentist Austin TX"`,
    `NEGATIVE EXAMPLES — intent changed, must be rejected:`,
    `Seed "plumber Austin TX" ? REJECTED: "emergency plumber Austin TX" (adds emergency), "licensed plumber Austin TX" (adds licensed), "master plumber Austin TX" (adds master), "plumbing expert Austin TX" (adds expert), "plumbing specialist Austin TX" (adds specialist), "residential plumber Austin TX" (adds residential)`,
    `Seed "electrician California" ? REJECTED: "licensed electrician California" (adds licensed), "professional electrician California" (adds professional), "residential electrician California" (adds residential)`,
    `NEVER generate: phrases containing 'near me', phrases beginning with 'local',`,
    `cost or pricing phrases (containing: cost, price, pricing, rates, how much),`,
    `or informational questions (beginning with: how, what, why, when, is, are, can, do, does, will).`,
    `Output ONLY a valid JSON array. No markdown. No explanation. No prose.`,
    `Each item must have exactly these fields: keyword (string), popularity ("high"|"medium"|"low"), category ("commercial"|"local"|"synonym"|"long_tail"|"intent").`,
  ].join(" ");
}

function buildDiscoveryPrompt(keyword: string, location: string | undefined, limit: number): string {
  const locationInstruction = location
    ? ` All suggestions must use the same location "${location}". Do not substitute a different city, region, or area.`
    : "";

  return [
    `Generate up to ${limit} related Google Maps search queries for "${keyword}".`,
    `Return fewer if insufficient high-quality suggestions exist.`,
    `Do not generate near-duplicates merely to reach the requested count.`,
    `Quality is more important than quantity. Return fewer suggestions rather than weak, repetitive, or low-confidence suggestions.`,
    locationInstruction,
    `Discovery suggestions must represent distinct search intents performed by businesses in the same core trade, profession, or business category as "${keyword}".`,
    `The businesses returned on Google Maps for each suggestion should typically perform substantially the same type of work as businesses returned for "${keyword}".`,
    `Governing test: would businesses returned for this suggestion typically perform the same core trade or profession as businesses returned for "${keyword}"?`,
    `If YES ? keep it. If NO ? reject it.`,
    `A Discovery suggestion must be a distinct search intent.`,
    `It must not be a synonym, a rewording, or a naming variation of "${keyword}".`,
    `Each suggestion must be capable of producing its own Google Maps result set.`,
    `POSITIVE EXAMPLES — same core trade, distinct search intent:`,
    `Seed "bail bond" ? "immigration bond", "surety bond", "federal bond services", "jail release services"`,
    `Seed "plumber Austin TX" ? "drain cleaning Austin TX", "water heater installation Austin TX", "sewer line repair Austin TX"`,
    `Seed "roof repair Houston TX" ? "roof replacement Houston TX", "roof inspection Houston TX", "roof coating Houston TX"`,
    `NEGATIVE EXAMPLES — rejected because businesses returned would be a different trade or profession:`,
    `Seed "bail bond" ? REJECTED: "criminal defense attorney" (different profession), "private investigator" (different trade), "fingerprinting service" (different trade)`,
    `Seed "plumber Austin TX" ? REJECTED: "home inspector Austin TX" (different trade), "general contractor Austin TX" (different trade)`,
    `NEGATIVE EXAMPLES — rejected because they are synonyms or rewordings of the seed:`,
    `Seed "plumber Austin TX" ? REJECTED: "plumbing company Austin TX", "plumbing contractor Austin TX"`,
    `NEVER generate: phrases containing 'near me', cost or pricing phrases,`,
    `or informational questions.`,
    `Output ONLY a valid JSON array. No markdown. No explanation. No prose.`,
    `Each item must have exactly these fields: keyword (string), popularity ("high"|"medium"|"low"), category ("commercial"|"local"|"synonym"|"long_tail"|"intent").`,
  ].join(" ");
}

function buildGeographicPrompt(keyword: string, location: string | undefined, limit: number): string {
  const locationAnchor = location ?? keyword;

  return [
    `Generate up to ${limit} Google Maps search queries that preserve "${keyword}" exactly and change only the location.`,
    `Return fewer if insufficient high-quality suggestions exist.`,
    `Quality is more important than quantity. Return fewer suggestions rather than weak, repetitive, or low-confidence suggestions.`,
    `The keyword portion must remain unchanged. Only the location may change.`,
    `If no explicit location exists in either "${keyword}" or the supplied location: return an empty JSON array [] immediately. Do not infer a city. Do not invent a city. Do not choose a default city.`,
    `The geographic anchor is "${locationAnchor}".`,
    `Determine whether this anchor is a city, a metro area, a county, a state or province, or a country.`,
    `Apply the matching rule only.`,
    `CITY OR METRO RULE: if the anchor is a city or metro area, generate nearby suburbs, municipalities, districts, and neighbouring towns within the same metro area.`,
    `STATE OR PROVINCE RULE: if the anchor is a state or province, generate major cities and metropolitan areas distributed across the entire state. Do not generate suburbs, neighbourhoods, or districts of a single city. The output must represent multiple metro areas across the state.`,
    `COUNTRY RULE: if the anchor is a country, generate major cities distributed across that country.`,
    `POSITIVE EXAMPLE — city-level (location: "Austin TX"):`,
    `Seed "plumber" + location "Austin TX" ? "plumber Round Rock TX", "plumber Cedar Park TX", "plumber Georgetown TX", "plumber Pflugerville TX"`,
    `POSITIVE EXAMPLE — state-level (location: "Texas"):`,
    `Seed "roof repair" + location "Texas" ? "roof repair Houston TX", "roof repair Dallas TX", "roof repair Austin TX", "roof repair San Antonio TX", "roof repair Fort Worth TX"`,
    `NEGATIVE EXAMPLE — state-level collapse (wrong):`,
    `Seed "roof repair" + location "Texas" ? REJECTED: "roof repair Katy TX", "roof repair Sugar Land TX", "roof repair Pearland TX" — these are suburbs of one city. This is wrong when the location is a state.`,
    `POSITIVE EXAMPLE — no location:`,
    `Seed "electrician" + no location ? [] immediately.`,
    `NEGATIVE EXAMPLE — no-location hallucination (wrong):`,
    `Seed "electrician" + no location ? REJECTED: "electrician Manhattan", "electrician Brooklyn" — no location was supplied. Inventing a city is wrong.`,
    `NEVER generate: phrases containing 'near me', cost or pricing phrases, or informational questions.`,
    `Output ONLY a valid JSON array. No markdown. No explanation. No prose.`,
    `Each item must have exactly these fields: keyword (string), popularity ("high"|"medium"|"low"), category ("commercial"|"local"|"synonym"|"long_tail"|"intent").`,
  ].join(" ");
}

function selectPrompt(
  strategy: ExpansionStrategy,
  keyword: string,
  location: string | undefined,
  limit: number,
): string {
  if (strategy === "discovery") return buildDiscoveryPrompt(keyword, location, limit);
  if (strategy === "geographic") return buildGeographicPrompt(keyword, location, limit);
  return buildCommercialPrompt(keyword, location, limit);
}

export class GroqKeywordExpansionProvider implements IKeywordExpansionProvider {
  constructor(private readonly apiKey: string) {}

  async expand(keyword: string, options?: ExpansionOptions): Promise<ExpandedKeyword[]> {
    const limit = options?.limit ?? 10;
    const location = options?.location;
    const strategy: ExpansionStrategy = options?.strategy ?? "commercial";
    return this._withRetry(() => this._call(keyword, location, limit, strategy));
  }

  private async _withRetry(fn: () => Promise<ExpandedKeyword[]>): Promise<ExpandedKeyword[]> {
    try {
      return await fn();
    } catch {
      try { return await fn(); } catch { return []; }
    }
  }

  private async _call(keyword: string, location: string | undefined, limit: number, strategy: ExpansionStrategy): Promise<ExpandedKeyword[]> {
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
            { role: "system", content: "You are a Google Maps business search query generator. Your output is used to discover real businesses on Google Maps. Respond ONLY with a valid JSON array. No explanation, no markdown, no prose." },
            { role: "user", content: selectPrompt(strategy, keyword, location, limit) },
          ],
          temperature: 0.3,
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

      const results = parseGroqResponse(parsed, limit);
      console.debug(
        "[expand:groq] keyword=%s location=%s raw=%d parsed=%d",
        keyword,
        location ?? "",
        Array.isArray(parsed) ? (parsed as unknown[]).length : 0,
        results.length,
      );
      return results;
    } finally {
      clearTimeout(timer);
    }
  }
}
