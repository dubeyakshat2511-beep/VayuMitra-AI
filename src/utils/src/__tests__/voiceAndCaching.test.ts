import { describe, expect, it } from 'vitest';
import type { FamilyProfile, LiveAqiData } from '../types/vayu';
import { buildSmogPlanCacheKey, PLAN_CACHE_PREFIX } from '../utils/exposureCalculator';
import { buildLocalSmogPlan, buildLocalVoiceBriefing } from '../utils/localFallbackPlan';

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
