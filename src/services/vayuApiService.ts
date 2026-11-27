import type {
  FamilyProfile,
  LiveAqiData,
  LocationSelection,
  SmogActionPlan,
} from '../types/vayu';
import { buildSmogPlanCacheKey } from '../utils/exposureCalculator';
import { buildLocalSmogPlan, buildLocalVoiceBriefing } from '../utils/localFallbackPlan';
import { buildLocalVoiceChatReply } from '../utils/voiceFallback';

/** Delay (ms) before performing a single automatic retry after HTTP 429. */
export const API_RETRY_DELAY_MS = 4000;

/** Prefix used to namespace cached voice briefing scripts in sessionStorage. */
export const VOICE_CACHE_PREFIX = 'vayumitra_voice_v1::';

/** Result returned by {@link requestSmogActionPlan}. */
export interface SmogPlanResult {
  plan: SmogActionPlan;
  cacheKey: string;
  fromCache: boolean;
}

/** Optional progress callbacks for {@link requestSmogActionPlan}. */
export interface SmogPlanRequestOptions {
  onStatusChange?: (status: string) => void;
}

/**
 * Fetches live US AQI, PM2.5, PM10, and 24-hour forecast telemetry from the
 * server's `/api/aqi` proxy backed by Open-Meteo.
 */
export async function fetchLiveAqiTelemetry(
  query: string,
  exactLocation?: LocationSelection,
  signal?: AbortSignal
): Promise<LiveAqiData> {
  const params = new URLSearchParams();
  params.set('city', query);
  if (exactLocation) {
    params.set('lat', String(exactLocation.latitude));
    params.set('lon', String(exactLocation.longitude));
    params.set('displayName', exactLocation.displayName);
    if (exactLocation.admin1) params.set('admin1', exactLocation.admin1);
    if (exactLocation.country) params.set('country', exactLocation.country);
  }

  const res = await fetch(`/api/aqi?${params.toString()}`, { signal });
  const body = (await res.json()) as LiveAqiData & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || `Failed to fetch live AQI (HTTP ${res.status})`);
  }
  return body;
}

/**
 * Reads a previously cached {@link SmogActionPlan} from `sessionStorage`,
 * returning `null` if missing, invalid, or storage is restricted.
 */
export function readCachedSmogPlan(cacheKey: string): SmogActionPlan | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SmogActionPlan;
    if (parsed && Array.isArray(parsed.dailyRoutine) && parsed.healthYoga && parsed.trainYoga) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persists a generated {@link SmogActionPlan} in `sessionStorage` keyed by
 * the deterministic plan fingerprint.
 */
export function writeCachedSmogPlan(cacheKey: string, plan: SmogActionPlan): void {
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(plan));
  } catch {
    // Ignore storage quota or restricted-mode errors
  }
}

/**
 * Requests a consolidated personalized smog action plan via `/api/smog-plan`,
 * serving instant `sessionStorage` cache hits, retrying once on HTTP 429, and
 * falling back seamlessly to {@link buildLocalSmogPlan} on rate limits.
 */
export async function requestSmogActionPlan(
  targetAqi: LiveAqiData,
  targetProfile: FamilyProfile,
  options: SmogPlanRequestOptions = {}
): Promise<SmogPlanResult> {
  const cacheKey = buildSmogPlanCacheKey(targetAqi, targetProfile);
  const cachedPlan = readCachedSmogPlan(cacheKey);

  if (cachedPlan) {
    return { plan: cachedPlan, cacheKey, fromCache: true };
  }

  options.onStatusChange?.('Analyzing Live AQI & Profile...');

  const sendRequest = async (isRetry: boolean) =>
    fetch('/api/smog-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aqiData: targetAqi,
        profile: targetProfile,
        isRetry,
      }),
    });

  try {
    let res = await sendRequest(false);

    if (res.status === 429) {
      options.onStatusChange?.('Optimizing air quality analysis...');
      await new Promise((resolve) => window.setTimeout(resolve, API_RETRY_DELAY_MS));
      res = await sendRequest(true);
    }

    if (res.status === 429) {
      const fallbackPlan = buildLocalSmogPlan(targetAqi, targetProfile);
      writeCachedSmogPlan(cacheKey, fallbackPlan);
      return { plan: fallbackPlan, cacheKey, fromCache: false };
    }

    const body = (await res.json()) as SmogActionPlan & { error?: string };
    if (!res.ok) {
      throw new Error(body.error || `Plan generation failed (HTTP ${res.status})`);
    }

    writeCachedSmogPlan(cacheKey, body);
    return { plan: body, cacheKey, fromCache: false };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Unable to generate your personalized smog action plan.';
    if (
      message.includes('429') ||
      message.toLowerCase().includes('rate limit') ||
      message.toLowerCase().includes('quota')
    ) {
      const fallbackPlan = buildLocalSmogPlan(targetAqi, targetProfile);
      writeCachedSmogPlan(cacheKey, fallbackPlan);
      return { plan: fallbackPlan, cacheKey, fromCache: false };
    }
    throw err;
  }
}

/**
 * Builds the `sessionStorage` cache key for a localized voice briefing script.
 */
export function buildVoiceBriefingCacheKey(planGeneratedAt: string, language: string): string {
  return `${VOICE_CACHE_PREFIX}${planGeneratedAt}::${language}`;
}

/**
 * Reads a cached voice briefing script from `sessionStorage` safely.
 */
export function readCachedVoiceScript(cacheKey: string): string | null {
  try {
    return window.sessionStorage.getItem(cacheKey);
  } catch {
    return null;
  }
}

/**
 * Persists a generated voice briefing script to `sessionStorage` safely.
 */
export function writeCachedVoiceScript(cacheKey: string, script: string): void {
  try {
    window.sessionStorage.setItem(cacheKey, script);
  } catch {
    // Ignore storage quota or restricted-mode errors
  }
}

/**
 * Requests a localized TTS briefing script via `/api/voice-briefing` with
 * single-retry 429 handling and offline fallback via {@link buildLocalVoiceBriefing}.
 */
export async function requestVoiceBriefingScript(
  targetAqi: LiveAqiData,
  targetPlan: SmogActionPlan,
  targetLang: string,
  signal?: AbortSignal
): Promise<string> {
  const sendVoiceReq = async (isRetry: boolean) =>
    fetch('/api/voice-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        aqiData: targetAqi,
        plan: targetPlan,
        language: targetLang,
        isRetry,
      }),
    });

  let res = await sendVoiceReq(false);

  if (res.status === 429) {
    await new Promise((resolve) => window.setTimeout(resolve, API_RETRY_DELAY_MS));
    if (signal?.aborted) {
      throw new DOMException('Voice briefing request aborted', 'AbortError');
    }
    res = await sendVoiceReq(true);
  }

  if (res.ok) {
    const data = (await res.json()) as { script?: string };
    return data.script || buildLocalVoiceBriefing(targetAqi, targetPlan, targetLang);
  }

  return buildLocalVoiceBriefing(targetAqi, targetPlan, targetLang);
}

/** Single conversational turn exchanged during Browser Speech Fallback voice mode. */
export interface VoiceChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Requests a concise spoken-style reply from `/api/voice-chat` grounded in live
 * AQI, fog road safety, and household profile, falling back to
 * {@link buildLocalVoiceChatReply} if the server is offline or rate-limited.
 */
export async function requestVoiceChatReply(
  message: string,
  history: VoiceChatTurn[],
  aqiData: LiveAqiData | null,
  profile: FamilyProfile,
  planHeadline?: string | null,
  signal?: AbortSignal
): Promise<string> {
  try {
    const res = await fetch('/api/voice-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        message,
        history: history.slice(-6),
        aqiData,
        profile,
        planHeadline: planHeadline ?? null,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { reply?: string };
      if (data.reply && data.reply.trim()) {
        return data.reply.trim();
      }
    }
    return buildLocalVoiceChatReply(message, aqiData, profile);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw err;
    }
    return buildLocalVoiceChatReply(message, aqiData, profile);
  }
}
