import type {
  CommuteOption,
  FamilyProfile,
  HomeAirSetupOption,
  HouseholdMemberOption,
  LanguageOption,
  LiveAqiData,
} from '../types/vayu';
import { clampCigaretteCount, INDIVIDUAL_SOLO_MEMBER } from './exposureCalculator.ts';

/** Allowlisted household vulnerability options accepted by backend routes. */
export const VALID_HOUSEHOLD_MEMBERS: readonly HouseholdMemberOption[] = [
  'Individual / Solo',
  'Healthy Adults',
  'Children',
  'Elderly Parents',
  'Asthma/Respiratory Sensitivity',
  'Outdoor Runner/Athlete',
];

/** Allowlisted daily commute modes accepted by backend routes. */
export const VALID_COMMUTE_OPTIONS: readonly CommuteOption[] = [
  'Two-Wheeler (Bike/Scooter)',
  'Petrol/Diesel Car',
  'Public Transit (Metro/Bus)',
  'Auto/E-Rickshaw',
  'Work From Home',
];

/** Allowlisted indoor air setup configurations accepted by backend routes. */
export const VALID_HOME_SETUPS: readonly HomeAirSetupOption[] = [
  'No Air Purifier (Budget/Natural hacks needed)',
  '1 HEPA Air Purifier',
  'Central Filtration',
];

/** Allowlisted community sharing languages accepted by backend routes. */
export const VALID_LANGUAGES: readonly LanguageOption[] = [
  'English',
  'Hinglish/Hindi',
];

/**
 * Strips ASCII control characters, collapses repeated whitespace, and truncates
 * untrusted string inputs safely to a maximum length.
 */
export function sanitizeTextInput(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes city/locality search queries against HTML/script injection and
 * control characters while preserving commas, hyphens, periods, and Unicode letters.
 */
export function sanitizeCityQuery(raw: unknown, maxLength = 120): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>'"`;\\]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes user-submitted fog/pothole hazard notes or voice text against
 * HTML tags, javascript:/data: schemes, and control characters.
 */
export function sanitizeHazardReportText(raw: unknown, maxLength = 280): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(?:javascript|vbscript|data)\s*:/gi, '')
    .replace(/[<>`]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Validates geographic latitude/longitude pairs against WGS-84 bounds.
 */
export function isValidCoordinatePair(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Validates and normalizes an untrusted {@link FamilyProfile} payload against
 * strict allowlists, returning `null` if no valid profile object is present.
 */
export function sanitizeFamilyProfile(raw: unknown): FamilyProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<Record<keyof FamilyProfile, unknown>>;

  const rawMembers = Array.isArray(record.members) ? record.members : [];
  const members = rawMembers.filter(
    (item): item is HouseholdMemberOption =>
      typeof item === 'string' &&
      (VALID_HOUSEHOLD_MEMBERS as readonly string[]).includes(item)
  );
  const uniqueMembers = Array.from(new Set(members));

  const commute: CommuteOption =
    typeof record.commute === 'string' &&
    (VALID_COMMUTE_OPTIONS as readonly string[]).includes(record.commute)
      ? (record.commute as CommuteOption)
      : 'Two-Wheeler (Bike/Scooter)';

  const homeSetup: HomeAirSetupOption =
    typeof record.homeSetup === 'string' &&
    (VALID_HOME_SETUPS as readonly string[]).includes(record.homeSetup)
      ? (record.homeSetup as HomeAirSetupOption)
      : 'No Air Purifier (Budget/Natural hacks needed)';

  const language: LanguageOption =
    typeof record.language === 'string' &&
    (VALID_LANGUAGES as readonly string[]).includes(record.language)
      ? (record.language as LanguageOption)
      : 'English';

  const cigarettesSmokedToday = clampCigaretteCount(
    typeof record.cigarettesSmokedToday === 'number'
      ? record.cigarettesSmokedToday
      : 0
  );

  return {
    members: uniqueMembers.length > 0 ? uniqueMembers : [INDIVIDUAL_SOLO_MEMBER],
    commute,
    homeSetup,
    language,
    cigarettesSmokedToday,
  };
}

/**
 * Validates that an incoming {@link LiveAqiData} object contains finite AQI and
 * PM2.5 readings along with a valid display location and safe window.
 */
export function isValidLiveAqiPayload(raw: unknown): raw is LiveAqiData {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Partial<LiveAqiData>;
  if (!candidate.current || typeof candidate.current !== 'object') return false;
  if (!candidate.safeWindow || typeof candidate.safeWindow !== 'object') return false;
  if (!Array.isArray(candidate.hourly)) return false;

  const { usAqi, pm25, pm10 } = candidate.current;
  return (
    typeof candidate.displayName === 'string' &&
    candidate.displayName.trim().length > 0 &&
    typeof usAqi === 'number' &&
    Number.isFinite(usAqi) &&
    usAqi >= 0 &&
    usAqi <= 1000 &&
    typeof pm25 === 'number' &&
    Number.isFinite(pm25) &&
    pm25 >= 0 &&
    pm25 <= 2500 &&
    typeof pm10 === 'number' &&
    Number.isFinite(pm10) &&
    pm10 >= 0
  );
}

/** Sanitized voice-chat turn for `/api/voice-chat`. */
export interface SanitizedVoiceTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Sanitizes and bounds recent voice chat history turns to prevent oversized
 * payloads or control-character injection into prompts.
 */
export function sanitizeVoiceChatHistory(
  rawHistory: unknown,
  maxTurns = 6,
  maxCharsPerTurn = 400
): SanitizedVoiceTurn[] {
  if (!Array.isArray(rawHistory)) return [];
  const cleaned: SanitizedVoiceTurn[] = [];
  for (const item of rawHistory.slice(-maxTurns)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as { role?: unknown; text?: unknown };
    const role = entry.role === 'user' || entry.role === 'assistant' ? entry.role : null;
    const text = sanitizeTextInput(entry.text, maxCharsPerTurn);
    if (role && text) {
      cleaned.push({ role, text });
    }
  }
  return cleaned;
}

interface TtlCacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Lightweight, memory-bounded in-memory TTL cache for server-side Open-Meteo
 * telemetry responses to avoid redundant upstream network calls.
 */
export class BoundedTtlCache<T> {
  private readonly store = new Map<string, TtlCacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries = 100, defaultTtlMs = 5 * 60 * 1000) {
    this.maxEntries = Math.max(1, maxEntries);
    this.defaultTtlMs = Math.max(1000, defaultTtlMs);
  }

  /** Retrieves a non-expired entry or returns `null`. */
  get(key: string, now = Date.now()): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (now >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /** Stores an entry with TTL, evicting the oldest key when capacity is reached. */
  set(key: string, value: T, now = Date.now(), ttlMs = this.defaultTtlMs): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: now + ttlMs });
  }

  /** Current number of entries stored in the cache. */
  get size(): number {
    return this.store.size;
  }

  /** Clears all cached entries. */
  clear(): void {
    this.store.clear();
  }
}
