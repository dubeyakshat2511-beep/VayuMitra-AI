import type { LiveAqiData } from '../types/vayu';

/**
 * Default PM2.5 alert threshold (µg/m³) above which desktop & in-app smog alerts trigger.
 */
export const DEFAULT_PM25_THRESHOLD = 150;

/**
 * Minimum and maximum configurable PM2.5 threshold bounds (µg/m³).
 */
export const MIN_PM25_THRESHOLD = 15;
export const MAX_PM25_THRESHOLD = 500;

/**
 * Quick-select PM2.5 threshold presets (µg/m³) shown in the notification monitor bar.
 */
export const PM25_THRESHOLD_PRESETS = [75, 100, 150, 200] as const;

/**
 * localStorage key for persisting PM2.5 alert preferences.
 */
export const PM25_ALERT_STORAGE_KEY = 'vayumitra_pm25_alert_prefs';

/** Normalized Browser Notification API permission state. */
export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/** Persisted user preferences for PM2.5 threshold monitoring. */
export interface Pm25AlertPrefs {
  enabled: boolean;
  threshold: number;
}

/** Result of evaluating live PM2.5 telemetry against the user's threshold. */
export interface Pm25AlertEvaluation {
  isExceeded: boolean;
  pm25: number;
  threshold: number;
  excessAmount: number;
  severity: 'normal' | 'high' | 'critical';
  dedupeKey: string;
}

/** Title, body, and deduplication tag used when constructing a browser notification. */
export interface Pm25NotificationPayload {
  title: string;
  body: string;
  tag: string;
}

/** Minimal `Storage` interface supporting offline dependency injection in tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Minimal `Notification` constructor interface supporting offline tests. */
export interface NotificationConstructorLike {
  readonly permission: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): unknown;
}

/** Outcome of attempting to dispatch a desktop browser PM2.5 notification. */
export interface DispatchNotificationResult {
  dispatched: boolean;
  payload: Pm25NotificationPayload;
  reason?: 'permission-not-granted' | 'unsupported' | 'constructor-error';
  error?: string;
}

/**
 * Clamp a numeric PM2.5 threshold into a safe, valid range.
 */
export function normalizePm25Threshold(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_PM25_THRESHOLD;
  return Math.min(MAX_PM25_THRESHOLD, Math.max(MIN_PM25_THRESHOLD, Math.round(num)));
}

/**
 * Read the current Browser Notification API permission state safely.
 */
export function getBrowserNotificationPermission(
  notificationCtor?: NotificationConstructorLike | null
): NotificationPermissionState {
  const ctor =
    notificationCtor !== undefined
      ? notificationCtor
      : typeof window !== 'undefined' && 'Notification' in window
        ? (window.Notification as unknown as NotificationConstructorLike)
        : null;

  if (!ctor) return 'unsupported';

  const perm = ctor.permission;
  if (perm === 'granted' || perm === 'denied' || perm === 'default') {
    return perm;
  }
  return 'unsupported';
}

/**
 * Load persisted PM2.5 alert preferences from storage with safe fallbacks.
 */
export function loadPm25AlertPrefs(storage?: StorageLike | null): Pm25AlertPrefs {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;

  const fallback: Pm25AlertPrefs = {
    enabled: true,
    threshold: DEFAULT_PM25_THRESHOLD,
  };

  if (!targetStorage) return fallback;

  try {
    const raw = targetStorage.getItem(PM25_ALERT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Pm25AlertPrefs>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : fallback.enabled,
      threshold: normalizePm25Threshold(parsed.threshold),
    };
  } catch {
    return fallback;
  }
}

/**
 * Persist PM2.5 alert preferences safely to localStorage.
 */
export function savePm25AlertPrefs(prefs: Pm25AlertPrefs, storage?: StorageLike | null): void {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;

  if (!targetStorage) return;

  try {
    targetStorage.setItem(
      PM25_ALERT_STORAGE_KEY,
      JSON.stringify({
        enabled: Boolean(prefs.enabled),
        threshold: normalizePm25Threshold(prefs.threshold),
      })
    );
  } catch {
    // Ignore storage quota or restricted-mode errors
  }
}

/**
 * Evaluate whether live local PM2.5 exceeds the configured safety threshold.
 */
export function evaluatePm25Threshold(
  aqiData: LiveAqiData | null,
  rawThreshold: number = DEFAULT_PM25_THRESHOLD
): Pm25AlertEvaluation {
  const threshold = normalizePm25Threshold(rawThreshold);
  if (!aqiData) {
    return {
      isExceeded: false,
      pm25: 0,
      threshold,
      excessAmount: 0,
      severity: 'normal',
      dedupeKey: '',
    };
  }

  const pm25 = Number.isFinite(aqiData.current.pm25) ? aqiData.current.pm25 : 0;
  const isExceeded = pm25 > threshold;
  const excessAmount = isExceeded ? Number((pm25 - threshold).toFixed(1)) : 0;

  let severity: Pm25AlertEvaluation['severity'] = 'normal';
  if (isExceeded) {
    severity = pm25 >= 250 || pm25 >= threshold * 1.5 ? 'critical' : 'high';
  }

  const normalizedCity = (aqiData.displayName || aqiData.query || 'city')
    .trim()
    .toLowerCase();
  const dedupeKey = `${normalizedCity}|${aqiData.observedAt}|pm25:${pm25.toFixed(1)}|thr:${threshold}`;

  return {
    isExceeded,
    pm25,
    threshold,
    excessAmount,
    severity,
    dedupeKey,
  };
}

/**
 * Build a concise, actionable browser notification title & body for a PM2.5 exceedance event.
 */
export function buildPm25NotificationPayload(
  aqiData: LiveAqiData,
  rawThreshold: number = DEFAULT_PM25_THRESHOLD
): Pm25NotificationPayload {
  const threshold = normalizePm25Threshold(rawThreshold);
  const city = aqiData.displayName || aqiData.query || 'your area';
  const pm25Label = aqiData.current.pm25.toFixed(1);
  const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'local';

  return {
    title: `High PM2.5 Alert: ${city} (${pm25Label} µg/m³)`,
    body: `Local PM2.5 exceeds your ${threshold} µg/m³ safety threshold (US AQI ${aqiData.current.usAqi}). Seal windows, run indoor filtration, and avoid outdoor exertion. Safest window: ${aqiData.safeWindow.windowLabel}.`,
    tag: `vayumitra-pm25-${slug}`,
  };
}

/**
 * Trigger a browser Notification API alert if permissions are granted.
 */
export function dispatchBrowserPm25Notification(
  aqiData: LiveAqiData,
  rawThreshold: number = DEFAULT_PM25_THRESHOLD,
  notificationCtor?: NotificationConstructorLike | null
): DispatchNotificationResult {
  const payload = buildPm25NotificationPayload(aqiData, rawThreshold);
  const ctor =
    notificationCtor !== undefined
      ? notificationCtor
      : typeof window !== 'undefined' && 'Notification' in window
        ? (window.Notification as unknown as NotificationConstructorLike)
        : null;

  if (!ctor) {
    return {
      dispatched: false,
      payload,
      reason: 'unsupported',
    };
  }

  if (ctor.permission !== 'granted') {
    return {
      dispatched: false,
      payload,
      reason: 'permission-not-granted',
    };
  }

  try {
    new ctor(payload.title, {
      body: payload.body,
      tag: payload.tag,
    });
    return {
      dispatched: true,
      payload,
    };
  } catch (err) {
    return {
      dispatched: false,
      payload,
      reason: 'constructor-error',
      error: err instanceof Error ? err.message : 'Unable to display browser notification.',
    };
  }
}
