import { describe, expect, it } from 'vitest';
import type { FamilyProfile, LiveAqiData } from '../types/vayu';
import { getAqiCategory, getWhoPm25Multiple } from '../utils/aqi';
import {
  buildSmogPlanCacheKey,
  calculateCombinedParticulateLoad,
  MAX_CIGARETTES_PER_DAY,
  PLAN_CACHE_PREFIX,
  PM25_PER_CIGARETTE,
} from '../utils/exposureCalculator';
import { buildLocalSmogPlan, buildLocalVoiceBriefing } from '../utils/localFallbackPlan';
import {
  applyThemeToDocument,
  getNextTheme,
  persistTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  type ThemeStorageLike,
} from '../utils/theme';
import { buildVoiceBriefingCacheKey, VOICE_CACHE_PREFIX } from '../services/vayuApiService';
import {
  buildLocalVoiceChatReply,
  detectBrowserSpeechSupport,
  resolveVoiceTransportTransition,
  type BrowserSpeechRecognitionConstructor,
} from '../utils/voiceFallback';

const VOICE_LANGUAGES = [
  'English (India)',
  'Hindi (हिन्दी)',
  'Hinglish',
  'Spanish',
  'French',
  'German',
] as const;

function createSampleAqi(overrides: Partial<LiveAqiData> = {}): LiveAqiData {
  return {
    query: 'New Delhi',
    displayName: 'New Delhi, India',
    admin1: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
    observedAt: '2026-11-23T09:00',
    current: {
      usAqi: 210,
      pm25: 118.6,
      pm10: 192.4,
      no2: 39.2,
      ozone: 22.1,
      co: 980,
    },
    safeWindow: {
      windowLabel: '1:00 PM – 4:00 PM',
      avgAqi: 155,
      minAqi: 148,
      maxAqi: 164,
      avgPm25: 64.2,
      advisory: 'Brief midday dispersion dip.',
      severity: 'restricted',
      startIndex: 13,
      endIndex: 16,
    },
    hourly: [
      {
        isoTime: '2026-11-23T09:00',
        hourLabel: '9:00 AM',
        hour24: 9,
        usAqi: 210,
        pm25: 118.6,
        pm10: 192.4,
      },
    ],
    ...overrides,
  };
}

function createSampleProfile(overrides: Partial<FamilyProfile> = {}): FamilyProfile {
  return {
    members: ['Healthy Adults', 'Children'],
    commute: 'Public Transit (Metro/Bus)',
    homeSetup: '1 HEPA Air Purifier',
    language: 'English',
    cigarettesSmokedToday: 0,
    ...overrides,
  };
}

describe('buildLocalVoiceBriefing — mandatory greeting & multilingual formatting', () => {
  it.each(VOICE_LANGUAGES)(
    'begins with exact "Hello sir" greeting and formats clean spoken prose for %s',
    (language) => {
      const aqi = createSampleAqi();
      const profile = createSampleProfile();
      const plan = buildLocalSmogPlan(aqi, profile);

      const script = buildLocalVoiceBriefing(aqi, plan, language);
      const expectedPrefix =
        'Hello sir, here is your personalized smog action plan for New Delhi, India.';

      expect(script.startsWith(expectedPrefix)).toBe(true);
      expect(script).toContain(String(aqi.current.usAqi));
      expect(script).toContain(aqi.current.pm25.toFixed(1));
      expect(script).toContain(aqi.safeWindow.windowLabel);
      expect(script).toContain(plan.indoorHacks[0].title);

      // Verify clean TTS prose with no raw markdown syntax
      expect(script).not.toMatch(/[*#`_]/);
    }
  );

  it('includes localized vocabulary for Hindi, Hinglish, Spanish, French, and German', () => {
    const aqi = createSampleAqi();
    const plan = buildLocalSmogPlan(aqi, createSampleProfile());

    expect(buildLocalVoiceBriefing(aqi, plan, 'Hindi (हिन्दी)')).toMatch(/माइक्रोग्राम/);
    expect(buildLocalVoiceBriefing(aqi, plan, 'Hinglish')).toMatch(/Bahar jaane ke liye/);
    expect(buildLocalVoiceBriefing(aqi, plan, 'Spanish')).toMatch(/calidad del aire/);
    expect(buildLocalVoiceBriefing(aqi, plan, 'French')).toMatch(/qualité de l'air/);
    expect(buildLocalVoiceBriefing(aqi, plan, 'German')).toMatch(/Luftqualitätsindex/);
  });

  it('incorporates immediate smoker recovery step when cigarettesSmokedToday > 0 and omits it for non-smokers', () => {
    const aqi = createSampleAqi();
    const nonSmokerPlan = buildLocalSmogPlan(aqi, createSampleProfile({ cigarettesSmokedToday: 0 }));
    const smokerPlan = buildLocalSmogPlan(aqi, createSampleProfile({ cigarettesSmokedToday: 4 }));

    const nonSmokerScript = buildLocalVoiceBriefing(aqi, nonSmokerPlan, 'English (India)');
    const smokerScript = buildLocalVoiceBriefing(aqi, smokerPlan, 'English (India)');
    const smokerHinglishScript = buildLocalVoiceBriefing(aqi, smokerPlan, 'Hinglish');

    expect(nonSmokerScript).not.toMatch(/cigarette/i);
    expect(smokerScript).toMatch(/4 cigarettes were logged today/i);
    expect(smokerScript).toMatch(/two hours/i);
    expect(smokerHinglishScript).toMatch(/4 cigarette ke baad/i);
  });
});

describe('buildSmogPlanCacheKey — sessionStorage cache key stability & isolation', () => {
  it('produces identical keys regardless of household member ordering or city casing/whitespace', () => {
    const aqiA = createSampleAqi({ displayName: '  Kanpur, Uttar Pradesh  ' });
    const aqiB = createSampleAqi({ displayName: 'kanpur, uttar pradesh' });

    const profileA = createSampleProfile({
      members: ['Elderly Parents', 'Children', 'Asthma/Respiratory Sensitivity'],
    });
    const profileB = createSampleProfile({
      members: ['Asthma/Respiratory Sensitivity', 'Elderly Parents', 'Children'],
    });

    const keyA = buildSmogPlanCacheKey(aqiA, profileA);
    const keyB = buildSmogPlanCacheKey(aqiB, profileB);

    expect(keyA.startsWith(PLAN_CACHE_PREFIX)).toBe(true);
    expect(keyA).toBe(keyB);
  });

  it('invalidates the cache key whenever AQI, city, commute, setup, language, or cigarette count changes', () => {
    const baseAqi = createSampleAqi();
    const baseProfile = createSampleProfile({ cigarettesSmokedToday: 0 });
    const baseKey = buildSmogPlanCacheKey(baseAqi, baseProfile);

    expect(
      buildSmogPlanCacheKey(
        createSampleAqi({ current: { ...baseAqi.current, usAqi: 211 } }),
        baseProfile
      )
    ).not.toBe(baseKey);

    expect(
      buildSmogPlanCacheKey(baseAqi, createSampleProfile({ commute: 'Work From Home' }))
    ).not.toBe(baseKey);

    expect(
      buildSmogPlanCacheKey(baseAqi, createSampleProfile({ homeSetup: 'Central Filtration' }))
    ).not.toBe(baseKey);

    expect(
      buildSmogPlanCacheKey(baseAqi, createSampleProfile({ language: 'Hinglish/Hindi' }))
    ).not.toBe(baseKey);

    expect(
      buildSmogPlanCacheKey(baseAqi, createSampleProfile({ cigarettesSmokedToday: 2 }))
    ).not.toBe(baseKey);
  });

  it('normalizes out-of-range cigarette counts identically in cache keys', () => {
    const aqi = createSampleAqi();
    const keyNegative = buildSmogPlanCacheKey(
      aqi,
      createSampleProfile({ cigarettesSmokedToday: -3 })
    );
    const keyZero = buildSmogPlanCacheKey(
      aqi,
      createSampleProfile({ cigarettesSmokedToday: 0 })
    );
    const keyOverMax = buildSmogPlanCacheKey(
      aqi,
      createSampleProfile({ cigarettesSmokedToday: 99 })
    );
    const keyMax = buildSmogPlanCacheKey(
      aqi,
      createSampleProfile({ cigarettesSmokedToday: 40 })
    );

    expect(keyNegative).toBe(keyZero);
    expect(keyOverMax).toBe(keyMax);
    expect(keyZero.endsWith('|cigs:0')).toBe(true);
    expect(keyMax.endsWith('|cigs:40')).toBe(true);
  });
});

function createMemoryStorage(initial: Record<string, string> = {}): ThemeStorageLike {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('theme utility — localStorage persistence, system fallback, and toggle logic', () => {
  it('defaults to system prefers-color-scheme on first visit when localStorage is empty', () => {
    const emptyStorage = createMemoryStorage();
    expect(resolveInitialTheme(emptyStorage, true)).toBe('dark');
    expect(resolveInitialTheme(emptyStorage, false)).toBe('light');
  });

  it('respects explicit persisted vayumitra_theme value over system preference', () => {
    const darkStored = createMemoryStorage({ [THEME_STORAGE_KEY]: 'dark' });
    const lightStored = createMemoryStorage({ [THEME_STORAGE_KEY]: 'light' });

    expect(resolveInitialTheme(darkStored, false)).toBe('dark');
    expect(resolveInitialTheme(lightStored, true)).toBe('light');
  });

  it('falls back cleanly when localStorage has invalid values or throws', () => {
    const corruptStorage = createMemoryStorage({ [THEME_STORAGE_KEY]: 'sepia' });
    expect(resolveInitialTheme(corruptStorage, true)).toBe('dark');
    expect(resolveInitialTheme(corruptStorage, false)).toBe('light');

    const throwingStorage: ThemeStorageLike = {
      getItem: () => {
        throw new Error('Storage disabled');
      },
      setItem: () => {
        throw new Error('Storage disabled');
      },
    };
    expect(resolveInitialTheme(throwingStorage, true)).toBe('dark');
    expect(() => persistTheme('dark', throwingStorage)).not.toThrow();
  });

  it('toggles theme mode, persists to vayumitra_theme, and toggles the dark class on documentElement', () => {
    const storage = createMemoryStorage();
    const classes = new Set<string>();
    const mockRoot = {
      classList: {
        toggle: (token: string, force?: boolean) => {
          const shouldAdd = force !== undefined ? force : !classes.has(token);
          if (shouldAdd) classes.add(token);
          else classes.delete(token);
          return shouldAdd;
        },
      },
      style: { colorScheme: '' },
    };

    let current = resolveInitialTheme(storage, false);
    expect(current).toBe('light');

    current = getNextTheme(current);
    expect(current).toBe('dark');
    persistTheme(current, storage);
    applyThemeToDocument(current, mockRoot);

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(classes.has('dark')).toBe(true);
    expect(mockRoot.style.colorScheme).toBe('dark');

    current = getNextTheme(current);
    expect(current).toBe('light');
    persistTheme(current, storage);
    applyThemeToDocument(current, mockRoot);

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(classes.has('dark')).toBe(false);
    expect(mockRoot.style.colorScheme).toBe('light');
  });
});

describe('edge-case resilience — zero AQI, extreme AQI (> 400), and 0 vs. 20+ cigarettes/day', () => {
  it('handles zero AQI (0) and zero PM2.5 cleanly across categorization, plan, voice script, and cache key', () => {
    const zeroAqi = createSampleAqi({
      displayName: 'Shimla, Himachal Pradesh',
      current: { usAqi: 0, pm25: 0, pm10: 0, no2: 0, ozone: 0, co: 0 },
      safeWindow: {
        windowLabel: '10:00 AM – 1:00 PM',
        avgAqi: 0,
        minAqi: 0,
        maxAqi: 0,
        avgPm25: 0,
        advisory: 'Clean mountain air all day.',
        severity: 'safe',
        startIndex: 10,
        endIndex: 13,
      },
    });
    const profile = createSampleProfile({ cigarettesSmokedToday: 0 });

    const category = getAqiCategory(0);
    expect(category.level).toBe('good');
    expect(category.label).toBe('Good');
    expect(getWhoPm25Multiple(0)).toBe('Within WHO 24h guideline (15 µg/m³)');

    const exposure = calculateCombinedParticulateLoad(0, 0);
    expect(exposure.combinedPm25Burden).toBe(0);
    expect(exposure.severity).toBe('non-smoker');

    const plan = buildLocalSmogPlan(zeroAqi, profile);
    expect(plan.smokerRecovery).toBeNull();
    expect(plan.dailyRoutine).toHaveLength(4);
    expect(plan.dailyRoutine.every((block) => block.riskLevel === 'Low')).toBe(true);

    const script = buildLocalVoiceBriefing(zeroAqi, plan, 'English (India)');
    expect(
      script.startsWith(
        'Hello sir, here is your personalized smog action plan for Shimla, Himachal Pradesh.'
      )
    ).toBe(true);
    expect(script).toContain('US AQI is 0');
    expect(script).toContain('PM 2.5 at 0.0');

    const cacheKey = buildSmogPlanCacheKey(zeroAqi, profile);
    expect(cacheKey).toContain('|0|');
    expect(cacheKey.endsWith('|cigs:0')).toBe(true);
  });

  it('handles extreme AQI (> 400) as Hazardous with Severe routine alerts and clean voice output', () => {
    const extremeAqi = createSampleAqi({
      displayName: 'Delhi NCR, India',
      current: { usAqi: 465, pm25: 385.5, pm10: 540.2, no2: 96.4, ozone: 18.0, co: 2800 },
      safeWindow: {
        windowLabel: '2:00 PM – 4:00 PM',
        avgAqi: 410,
        minAqi: 398,
        maxAqi: 425,
        avgPm25: 320.0,
        advisory: 'Hazardous conditions persist; remain indoors.',
        severity: 'avoid',
        startIndex: 14,
        endIndex: 16,
      },
    });
    const profile = createSampleProfile({
      members: ['Elderly Parents', 'Asthma/Respiratory Sensitivity'],
      cigarettesSmokedToday: 0,
    });

    const category = getAqiCategory(465);
    expect(category.level).toBe('hazardous');
    expect(category.label).toBe('Hazardous');
    expect(getWhoPm25Multiple(385.5)).toContain('25.7× WHO 24h limit');

    const plan = buildLocalSmogPlan(extremeAqi, profile);
    expect(plan.dailyRoutine.every((block) => block.riskLevel === 'Severe')).toBe(true);
    expect(plan.headlineAdvisory).toMatch(/indoors|N95/i);
    expect(plan.healthYoga.aqiSafetyGuidance).toMatch(/Kapalabhati|Bhastrika|unfiltered/i);

    const script = buildLocalVoiceBriefing(extremeAqi, plan, 'English (India)');
    expect(script).toContain('465');
    expect(script).toContain('385.5');
    expect(script).not.toMatch(/[*#`_]/);

    const voiceKey = buildVoiceBriefingCacheKey(plan.generatedAt, 'English (India)');
    expect(voiceKey.startsWith(VOICE_CACHE_PREFIX)).toBe(true);
    expect(voiceKey).toContain('::English (India)');
  });

  it('contrasts 0 cigarettes vs. heavy 20+ cigarettes/day exposure across load, recovery protocol, voice script, and cache keys', () => {
    const aqi = createSampleAqi({
      current: { usAqi: 240, pm25: 130.0, pm10: 210.0, no2: 45, ozone: 20, co: 1200 },
    });

    const nonSmokerProfile = createSampleProfile({ cigarettesSmokedToday: 0 });
    const packADayProfile = createSampleProfile({ cigarettesSmokedToday: 20 });
    const heavySmokerProfile = createSampleProfile({ cigarettesSmokedToday: 25 });
    const overCapProfile = createSampleProfile({ cigarettesSmokedToday: 55 });

    const nonSmokerLoad = calculateCombinedParticulateLoad(aqi.current.pm25, 0);
    const packADayLoad = calculateCombinedParticulateLoad(aqi.current.pm25, 20);
    const heavyLoad = calculateCombinedParticulateLoad(aqi.current.pm25, 25);
    const cappedLoad = calculateCombinedParticulateLoad(aqi.current.pm25, 55);

    expect(nonSmokerLoad.hasSmokingExposure).toBe(false);
    expect(nonSmokerLoad.smokingEquivalentPm25).toBe(0);
    expect(nonSmokerLoad.combinedPm25Burden).toBe(130);
    expect(nonSmokerLoad.severity).toBe('non-smoker');

    expect(packADayLoad.hasSmokingExposure).toBe(true);
    expect(packADayLoad.smokingEquivalentPm25).toBe(20 * PM25_PER_CIGARETTE);
    expect(packADayLoad.combinedPm25Burden).toBe(130 + 20 * PM25_PER_CIGARETTE);
    expect(packADayLoad.severity).toBe('severe');

    expect(heavyLoad.smokingEquivalentPm25).toBe(25 * PM25_PER_CIGARETTE);
    expect(heavyLoad.severity).toBe('severe');

    expect(cappedLoad.cigarettesCount).toBe(MAX_CIGARETTES_PER_DAY);
    expect(cappedLoad.smokingEquivalentPm25).toBe(MAX_CIGARETTES_PER_DAY * PM25_PER_CIGARETTE);

    const nonSmokerPlan = buildLocalSmogPlan(aqi, nonSmokerProfile);
    const packADayPlan = buildLocalSmogPlan(aqi, packADayProfile);
    const heavyPlan = buildLocalSmogPlan(aqi, heavySmokerProfile);

    expect(nonSmokerPlan.smokerRecovery).toBeNull();
    expect(packADayPlan.smokerRecovery).not.toBeNull();
    expect(packADayPlan.smokerRecovery?.cigarettesCount).toBe(20);
    expect(packADayPlan.smokerRecovery?.immediateInitials).toHaveLength(4);
    expect(packADayPlan.smokerRecovery?.lungClearingExercises).toHaveLength(4);
    expect(heavyPlan.smokerRecovery?.cigarettesCount).toBe(25);

    const nonSmokerVoice = buildLocalVoiceBriefing(aqi, nonSmokerPlan, 'English (India)');
    const packADayVoice = buildLocalVoiceBriefing(aqi, packADayPlan, 'English (India)');
    expect(nonSmokerVoice).not.toMatch(/cigarette/i);
    expect(packADayVoice).toMatch(/20 cigarettes were logged today/i);

    const key0 = buildSmogPlanCacheKey(aqi, nonSmokerProfile);
    const key20 = buildSmogPlanCacheKey(aqi, packADayProfile);
    const key25 = buildSmogPlanCacheKey(aqi, heavySmokerProfile);
    const keyOver = buildSmogPlanCacheKey(aqi, overCapProfile);

    expect(key0).not.toBe(key20);
    expect(key20).not.toBe(key25);
    expect(key0.endsWith('|cigs:0')).toBe(true);
    expect(key20.endsWith('|cigs:20')).toBe(true);
    expect(key25.endsWith('|cigs:25')).toBe(true);
    expect(keyOver.endsWith(`|cigs:${MAX_CIGARETTES_PER_DAY}`)).toBe(true);
  });
});

describe('voiceFallback — zero-failure Browser Speech transition & offline reply logic', () => {
  it('transitions automatically from gemini-live to browser-speech-fallback on error, timeout, or unexpected close', () => {
    const onError = resolveVoiceTransportTransition('gemini-live', 'live-error');
    expect(onError.mode).toBe('browser-speech-fallback');
    expect(onError.shouldActivateBrowserFallback).toBe(true);
    expect(onError.notice).toMatch(/Browser Voice Mode/i);

    const onTimeout = resolveVoiceTransportTransition('gemini-live', 'live-timeout');
    expect(onTimeout.mode).toBe('browser-speech-fallback');
    expect(onTimeout.shouldActivateBrowserFallback).toBe(true);

    const onUnexpectedClose = resolveVoiceTransportTransition(
      'gemini-live',
      'live-closed-unexpectedly'
    );
    expect(onUnexpectedClose.mode).toBe('browser-speech-fallback');
    expect(onUnexpectedClose.shouldActivateBrowserFallback).toBe(true);

    const onMicDenied = resolveVoiceTransportTransition('gemini-live', 'mic-denied');
    expect(onMicDenied.shouldActivateBrowserFallback).toBe(false);
    expect(onMicDenied.notice).toMatch(/Microphone permission/i);

    const onReady = resolveVoiceTransportTransition('gemini-live', 'live-ready');
    expect(onReady.mode).toBe('gemini-live');
    expect(onReady.notice).toBeNull();
  });

  it('detects standard and webkit SpeechRecognition and speechSynthesis capabilities cleanly', () => {
    const MockRec = function MockSpeechRecognition() {} as unknown as BrowserSpeechRecognitionConstructor;

    expect(detectBrowserSpeechSupport(null)).toEqual({
      recognitionCtor: null,
      hasRecognition: false,
      hasSynthesis: false,
    });

    const webkitEnv = detectBrowserSpeechSupport({
      webkitSpeechRecognition: MockRec,
      speechSynthesis: { speak: () => {}, cancel: () => {} },
    });
    expect(webkitEnv.hasRecognition).toBe(true);
    expect(webkitEnv.recognitionCtor).toBe(MockRec);
    expect(webkitEnv.hasSynthesis).toBe(true);
  });

  it('builds grounded offline spoken replies covering fog/pothole safety, smoker recovery, and live AQI', () => {
    const aqi = createSampleAqi({
      weather: {
        temperatureC: 8.5,
        dewPointC: 8.0,
        relativeHumidityPct: 95,
        windSpeedKmh: 3.0,
        reportedVisibilityMeters: 90,
      },
    });
    const profile = createSampleProfile({
      commute: 'Two-Wheeler (Bike/Scooter)',
      cigarettesSmokedToday: 3,
    });

    const fogReply = buildLocalVoiceChatReply('How is fog and pothole risk for my commute?', aqi, profile);
    expect(fogReply).toMatch(/kilometers per hour/i);
    expect(fogReply).toMatch(/potholes/i);

    const smokerReply = buildLocalVoiceChatReply('What lung exercise after smoking?', aqi, profile);
    expect(smokerReply).toMatch(/3 cigarettes/i);
    expect(smokerReply).toMatch(/two hours/i);

    const generalReply = buildLocalVoiceChatReply('Can we walk outside right now?', aqi, profile);
    expect(generalReply).toContain('New Delhi, India');
    expect(generalReply).toContain('210');

    const soloProfile = createSampleProfile({
      members: ['Individual / Solo'],
      commute: 'Public Transit (Metro/Bus)',
      cigarettesSmokedToday: 0,
    });
    const soloReply = buildLocalVoiceChatReply('Can I go outside today?', aqi, soloProfile);
    expect(soloReply).toMatch(/solo errands or workout/i);
    expect(soloReply).toContain('Public Transit (Metro/Bus)');

    const soloKey = buildSmogPlanCacheKey(aqi, soloProfile);
    const familyKey = buildSmogPlanCacheKey(aqi, profile);
    expect(soloKey).not.toBe(familyKey);
    expect(soloKey).toContain('Individual / Solo');
  });
});


