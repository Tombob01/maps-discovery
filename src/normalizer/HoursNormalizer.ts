/**
 * @module normalizer/HoursNormalizer
 *
 * Parses raw hours strings (e.g. "Mon-Fri: 09:00-17:00") into structured DayHours.
 * Parsing is best-effort; if a line can't be parsed it is silently skipped
 * (hours.parsed will be null rather than returning Err).
 */

import type {
  IFieldNormalizer,
  FieldNormalizationErrorDetail,
  NormalizationContext,
} from "../core/interfaces/INormalizer.js";
import type { BusinessHours, DayHours } from "../core/models/BusinessRecord.js";
import type { DayOfWeek, Result } from "../core/types/common.js";
import { ok } from "../core/types/common.js";

// ---------------------------------------------------------------------------
// Day name → DayOfWeek mapping
// ---------------------------------------------------------------------------

const DAY_MAP: Record<string, DayOfWeek> = {
  mon: "monday",
  monday: "monday",
  tue: "tuesday",
  tuesday: "tuesday",
  wed: "wednesday",
  wednesday: "wednesday",
  thu: "thursday",
  thursday: "thursday",
  fri: "friday",
  friday: "friday",
  sat: "saturday",
  saturday: "saturday",
  sun: "sunday",
  sunday: "sunday",
};

const ALL_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function resolveDayName(s: string): DayOfWeek | null {
  return DAY_MAP[s.toLowerCase()] ?? null;
}

/** Expand "Mon-Fri" range into individual DayOfWeek values. */
function expandRange(from: string, to: string): DayOfWeek[] {
  const start = resolveDayName(from);
  const end = resolveDayName(to);
  if (!start || !end) return [];

  const si = ALL_DAYS.indexOf(start);
  const ei = ALL_DAYS.indexOf(end);
  if (si === -1 || ei === -1 || si > ei) return [];

  return ALL_DAYS.slice(si, ei + 1);
}

// ---------------------------------------------------------------------------
// Parse a single line like "Mon-Fri: 09:00-17:00" or "Sunday: Closed"
// ---------------------------------------------------------------------------

function parseLine(line: string): DayHours[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Split on the first colon
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx === -1) return [];

  const daysPart = trimmed.slice(0, colonIdx).trim();
  const hoursPart = trimmed.slice(colonIdx + 1).trim();

  // Resolve days (may be a range like "Mon-Fri" or a single day)
  let days: DayOfWeek[];
  const rangeParts = daysPart.split("-").map((s) => s.trim());
  if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
    const r = expandRange(rangeParts[0], rangeParts[1]);
    days =
      r.length > 0
        ? r
        : (() => {
            // "-" may be part of the day name or just a single name
            const single = resolveDayName(daysPart);
            return single ? [single] : [];
          })();
  } else {
    const single = resolveDayName(daysPart);
    days = single ? [single] : [];
  }

  if (days.length === 0) return [];

  // Check for closed
  if (/closed/i.test(hoursPart)) {
    return days.map((day) => ({
      day,
      open: null,
      close: null,
      isClosed: true,
    }));
  }

  // Parse time range like "09:00-17:00" or "9:00 AM - 5:00 PM"
  const timeMatch = hoursPart.match(
    /(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[-–]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i,
  );
  if (!timeMatch?.[1] || !timeMatch[2]) return [];

  const open = normalizeTime(timeMatch[1].trim());
  const close = normalizeTime(timeMatch[2].trim());

  return days.map((day) => ({ day, open, close, isClosed: false }));
}

/** Normalise time to "HH:MM" 24-hour format (best-effort). */
function normalizeTime(raw: string): string {
  const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (amPmMatch?.[1] && amPmMatch[2] && amPmMatch[3]) {
    let hours = parseInt(amPmMatch[1], 10);
    const mins = amPmMatch[2];
    const meridiem = amPmMatch[3].toUpperCase();
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${mins}`;
  }
  // Already 24h format
  return raw;
}

// ---------------------------------------------------------------------------
// HoursNormalizer
// ---------------------------------------------------------------------------

export class HoursNormalizer implements IFieldNormalizer<
  readonly string[] | null,
  BusinessHours | null
> {
  normalize(
    raw: readonly string[] | null,
    _context: NormalizationContext,
  ): Result<BusinessHours | null, FieldNormalizationErrorDetail> {
    if (raw === null || raw.length === 0) {
      return ok(null);
    }

    const parsed: DayHours[] = [];
    for (const line of raw) {
      const results = parseLine(line);
      parsed.push(...results);
    }

    const hours: BusinessHours = {
      raw,
      parsed: parsed.length > 0 ? Object.freeze(parsed) : null,
    };

    return ok(hours);
  }
}
