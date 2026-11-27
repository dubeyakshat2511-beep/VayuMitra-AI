import { describe, expect, it } from 'vitest';
import type { LiveAqiData } from '../types/vayu';
import {
  buildPm25NotificationPayload,
  DEFAULT_PM25_THRESHOLD,
  dispatchBrowserPm25Notification,
  evaluatePm25Threshold,
  getBrowserNotificationPermission,
  loadPm25AlertPrefs,
  normalizePm25Threshold,
  PM25_ALERT_STORAGE_KEY,
  savePm25AlertPrefs,
  type NotificationConstructorLike,
  type StorageLike,
} from '../utils/pm25Notifications';
import {
  computeAudioLevel,
  downsampleFloat32,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
} from '../utils/liveAudio';

function createSampleAqi(pm25: number, overrides: Partial<LiveAqiData> = {}): LiveAqiData {
  return {
    query: 'Kanpur, Uttar Pradesh',
    displayName: 'Kanpur, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 26.4499,
    longitude: 80.3319,
    timezone: 'Asia/Kolkata',
    observedAt: '2026-11-24T08:00',
    current: {
      usAqi: 235,
      pm25,
      pm10: pm25 * 1.4,
      no2: 42,
      ozone: 18,
      co: 1120,
    },
    safeWindow: {
      windowLabel: '1:00 PM – 4:00 PM',
      avgAqi: 162,
      minAqi: 155,
      maxAqi: 170,
      avgPm25: 76.4,
      advisory: 'Brief midday dispersion window.',
      severity: 'restricted',
      startIndex: 13,
      endIndex: 16,
    },
    hourly: [],
    ...overrides,
  };
}

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('pm25Notifications — threshold evaluation, preferences & browser Notification API', () => {
  it('triggers strictly when local PM2.5 exceeds the safe threshold (default > 150 µg/m³)', () => {
    const atBoundary = evaluatePm25Threshold(createSampleAqi(150), DEFAULT_PM25_THRESHOLD);
    expect(atBoundary.isExceeded).toBe(false);
    expect(atBoundary.severity).toBe('normal');
    expect(atBoundary.excessAmount).toBe(0);

    const aboveThreshold = evaluatePm25Threshold(createSampleAqi(184.5), DEFAULT_PM25_THRESHOLD);
    expect(aboveThreshold.isExceeded).toBe(true);
    expect(aboveThreshold.severity).toBe('high');
    expect(aboveThreshold.excessAmount).toBe(34.5);

    const criticalSpike = evaluatePm25Threshold(createSampleAqi(265), DEFAULT_PM25_THRESHOLD);
    expect(criticalSpike.isExceeded).toBe(true);
    expect(criticalSpike.severity).toBe('critical');
  });

  it('produces unique deduplication keys per city, observation time, and threshold', () => {
    const aqi1 = createSampleAqi(180);
    const aqi2 = createSampleAqi(180, { observedAt: '2026-11-24T09:00' });
    const eval1 = evaluatePm25Threshold(aqi1, 150);
    const eval1Same = evaluatePm25Threshold(aqi1, 150);
    const eval2 = evaluatePm25Threshold(aqi2, 150);
    const evalLowerThreshold = evaluatePm25Threshold(aqi1, 100);

    expect(eval1.dedupeKey).toBe(eval1Same.dedupeKey);
    expect(eval1.dedupeKey).not.toBe(eval2.dedupeKey);
    expect(eval1.dedupeKey).not.toBe(evalLowerThreshold.dedupeKey);
  });

  it('dispatches a browser Notification when permission is granted and skips when denied/default/unsupported', () => {
    const aqi = createSampleAqi(192.4);
    const createdCalls: Array<{ title: string; options?: NotificationOptions }> = [];

    class GrantedNotificationMock {
      static readonly permission: NotificationPermission = 'granted';
      constructor(title: string, options?: NotificationOptions) {
        createdCalls.push({ title, options });
      }
    }

    class DeniedNotificationMock {
      static readonly permission: NotificationPermission = 'denied';
      constructor() {
        throw new Error('Should not construct when denied');
      }
    }

    expect(getBrowserNotificationPermission(GrantedNotificationMock as unknown as NotificationConstructorLike)).toBe(
      'granted'
    );
    expect(getBrowserNotificationPermission(null)).toBe('unsupported');

    const grantedResult = dispatchBrowserPm25Notification(
      aqi,
      150,
      GrantedNotificationMock as unknown as NotificationConstructorLike
    );
    expect(grantedResult.dispatched).toBe(true);
    expect(createdCalls).toHaveLength(1);
    expect(createdCalls[0].title).toContain('Kanpur, Uttar Pradesh');
    expect(createdCalls[0].title).toContain('192.4');
    expect(createdCalls[0].options?.body).toContain('150 µg/m³');

    const deniedResult = dispatchBrowserPm25Notification(
      aqi,
      150,
      DeniedNotificationMock as unknown as NotificationConstructorLike
    );
    expect(deniedResult.dispatched).toBe(false);
    expect(deniedResult.reason).toBe('permission-not-granted');

    const unsupportedResult = dispatchBrowserPm25Notification(aqi, 150, null);
    expect(unsupportedResult.dispatched).toBe(false);
    expect(unsupportedResult.reason).toBe('unsupported');
  });

  it('handles Notification constructor errors gracefully without throwing', () => {
    const aqi = createSampleAqi(210);
    class ThrowingNotificationMock {
      static readonly permission: NotificationPermission = 'granted';
      constructor() {
        throw new TypeError('Illegal constructor in restricted iframe');
      }
    }

    const result = dispatchBrowserPm25Notification(
      aqi,
      150,
      ThrowingNotificationMock as unknown as NotificationConstructorLike
    );
    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('constructor-error');
    expect(result.error).toContain('Illegal constructor');

    const payload = buildPm25NotificationPayload(aqi, 150);
    expect(payload.tag).toBe('vayumitra-pm25-kanpur-uttar-pradesh');
  });

  it('persists and clamps PM2.5 alert preferences safely in storage', () => {
    const storage = createMemoryStorage();
    expect(loadPm25AlertPrefs(storage)).toEqual({
      enabled: true,
      threshold: DEFAULT_PM25_THRESHOLD,
    });

    savePm25AlertPrefs({ enabled: false, threshold: 999 }, storage);
    expect(storage.getItem(PM25_ALERT_STORAGE_KEY)).toBeTruthy();
    expect(loadPm25AlertPrefs(storage)).toEqual({
      enabled: false,
      threshold: 500,
    });

    expect(normalizePm25Threshold(5)).toBe(15);
    expect(normalizePm25Threshold(Number.NaN)).toBe(DEFAULT_PM25_THRESHOLD);
  });
});

describe('liveAudio — manual 16-bit PCM encoding/decoding & resampling for Gemini Live API', () => {
  it('round-trips Float32 samples through 16-bit little-endian PCM base64 accurately', () => {
    const original = new Float32Array([-1, -0.5, 0, 0.25, 0.5, 0.99]);
    const encoded = float32ToPcm16Base64(original);
    const decoded = pcm16Base64ToFloat32(encoded);

    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(decoded[i] - original[i])).toBeLessThan(0.001);
    }
  });

  it('downsamples 48 kHz input audio cleanly to 16 kHz PCM rate', () => {
    const samples48k = new Float32Array(480);
    samples48k.fill(0.5);
    const downsampled16k = downsampleFloat32(samples48k, 48000, 16000);

    expect(downsampled16k.length).toBe(160);
    expect(downsampled16k[0]).toBeCloseTo(0.5, 4);
    expect(downsampled16k[159]).toBeCloseTo(0.5, 4);
  });

  it('computes bounded normalized audio levels for visualizer rendering', () => {
    expect(computeAudioLevel(new Float32Array(0))).toBe(0);
    expect(computeAudioLevel(new Float32Array([0, 0, 0, 0]))).toBe(0);
    const loud = computeAudioLevel(new Float32Array([0.9, -0.9, 0.9, -0.9]));
    expect(loud).toBeLessThanOrEqual(1);
    expect(loud).toBeGreaterThan(0.5);
  });
});
