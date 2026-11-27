import { describe, expect, it } from 'vitest';
import type { FamilyProfile, LiveAqiData } from '../types/vayu';
import { formatObservedTime, getAqiCategory, getWhoPm25Multiple } from '../utils/aqi';
import {
  calculateCombinedParticulateLoad,
  calculateSmokingEquivalentPm25,
  clampCigaretteCount,
  getHouseholdMode,
  INDIVIDUAL_SOLO_MEMBER,
  isIndividualSoloProfile,
  MAX_CIGARETTES_PER_DAY,
  PM25_PER_CIGARETTE,
  toggleHouseholdMember,
} from '../utils/exposureCalculator';
import {
  calculateFogHazard,
  calculateStoppingDistanceMeters,
  estimateDewPointC,
} from '../utils/fogHazardCalculator';
import { buildLocalSmogPlan } from '../utils/localFallbackPlan';

function createMockAqiData(overrides: Partial<LiveAqiData> = {}): LiveAqiData {
  return {
    query: 'Kanpur, Uttar Pradesh',
    displayName: 'Kanpur, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 26.4499,
    longitude: 80.3319,
    timezone: 'Asia/Kolkata',
    observedAt: '2026-11-23T08:30',
    current: {
      usAqi: 245,
      pm25: 138.4,
      pm10: 215.2,
      no2: 42.1,
      ozone: 28.5,
      co: 1120,
    },
    safeWindow: {
      windowLabel: '1:00 PM – 4:00 PM',
      avgAqi: 162,
      minAqi: 152,
      maxAqi: 171,
      avgPm25: 68.5,
      advisory: 'Lowest relative daytime particulate dispersion window.',
      severity: 'restricted',
      startIndex: 13,
      endIndex: 16,
    },
    hourly: [
      {
        isoTime: '2026-11-23T08:00',
        hourLabel: '8:00 AM',
        hour24: 8,
        usAqi: 245,
        pm25: 138.4,
        pm10: 215.2,
      },
      {
        isoTime: '2026-11-23T14:00',
        hourLabel: '2:00 PM',
        hour24: 14,
        usAqi: 162,
        pm25: 68.5,
        pm10: 120.0,
      },
    ],
    ...overrides,
  };
}

function createProfile(overrides: Partial<FamilyProfile> = {}): FamilyProfile {
  return {
    members: ['Healthy Adults'],
    commute: 'Two-Wheeler (Bike/Scooter)',
    homeSetup: 'No Air Purifier (Budget/Natural hacks needed)',
    language: 'English',
    cigarettesSmokedToday: 0,
    ...overrides,
  };
}

describe('exposureCalculator — cigarette & combined PM2.5 particulate load', () => {
  it('clamps cigarette counts safely into [0, 40] and handles invalid inputs', () => {
    expect(clampCigaretteCount(0)).toBe(0);
    expect(clampCigaretteCount(-5)).toBe(0);
    expect(clampCigaretteCount(Number.NaN)).toBe(0);
    expect(clampCigaretteCount(null)).toBe(0);
    expect(clampCigaretteCount(undefined)).toBe(0);
    expect(clampCigaretteCount(3.6)).toBe(4);
    expect(clampCigaretteCount(55)).toBe(MAX_CIGARETTES_PER_DAY);
  });

  it('computes ~22 µg/m³ equivalent PM2.5 per cigarette', () => {
    expect(PM25_PER_CIGARETTE).toBe(22);
    expect(calculateSmokingEquivalentPm25(0)).toBe(0);
    expect(calculateSmokingEquivalentPm25(1)).toBe(22);
    expect(calculateSmokingEquivalentPm25(5)).toBe(110);
    expect(calculateSmokingEquivalentPm25(10)).toBe(220);
  });

  it('calculates non-smoker baseline accurately without inflating burden', () => {
    const result = calculateCombinedParticulateLoad(42.3, 0);
    expect(result.cigarettesCount).toBe(0);
    expect(result.ambientPm25).toBe(42.3);
    expect(result.smokingEquivalentPm25).toBe(0);
    expect(result.combinedPm25Burden).toBe(42.3);
    expect(result.hasSmokingExposure).toBe(false);
    expect(result.severity).toBe('non-smoker');
  });

  it('categorizes elevated, high, and severe combined particulate loads correctly', () => {
    const elevated = calculateCombinedParticulateLoad(25.5, 1);
    expect(elevated.combinedPm25Burden).toBe(47.5);
    expect(elevated.hasSmokingExposure).toBe(true);
    expect(elevated.severity).toBe('elevated');

    const high = calculateCombinedParticulateLoad(30.0, 4);
    expect(high.smokingEquivalentPm25).toBe(88);
    expect(high.combinedPm25Burden).toBe(118);
    expect(high.severity).toBe('high');

    const severeByCount = calculateCombinedParticulateLoad(18.0, 6);
    expect(severeByCount.combinedPm25Burden).toBe(150);
    expect(severeByCount.severity).toBe('severe');

    const severeByAmbientPlusSmoke = calculateCombinedParticulateLoad(185.4, 1);
    expect(severeByAmbientPlusSmoke.combinedPm25Burden).toBe(207.4);
    expect(severeByAmbientPlusSmoke.severity).toBe('severe');
  });

  it('handles missing ambient PM2.5 gracefully', () => {
    const result = calculateCombinedParticulateLoad(null, 3);
    expect(result.ambientPm25).toBeNull();
    expect(result.smokingEquivalentPm25).toBe(66);
    expect(result.combinedPm25Burden).toBe(66);
    expect(result.severity).toBe('high');
  });
});

describe('aqi utility — US AQI severity categorization & formatting', () => {
  it('maps every US AQI band and boundary cleanly', () => {
    expect(getAqiCategory(0).level).toBe('good');
    expect(getAqiCategory(50).label).toBe('Good');
    expect(getAqiCategory(51).level).toBe('moderate');
    expect(getAqiCategory(100).label).toBe('Moderate');
    expect(getAqiCategory(101).level).toBe('sensitive');
    expect(getAqiCategory(150).label).toBe('Unhealthy for Sensitive Groups');
    expect(getAqiCategory(151).level).toBe('unhealthy');
    expect(getAqiCategory(200).label).toBe('Unhealthy');
    expect(getAqiCategory(201).level).toBe('very-unhealthy');
    expect(getAqiCategory(300).label).toBe('Very Unhealthy');
    expect(getAqiCategory(301).level).toBe('hazardous');
    expect(getAqiCategory(450).label).toBe('Hazardous');
  });

  it('computes WHO 24-hour PM2.5 multiple and formats timestamps cleanly', () => {
    expect(getWhoPm25Multiple(12)).toContain('Within WHO 24h guideline');
    expect(getWhoPm25Multiple(45)).toBe('3.0× WHO 24h limit (15 µg/m³)');
    expect(formatObservedTime('2026-11-23T14:30')).toBe('2026-11-23 · 2:30 PM local');
    expect(formatObservedTime('')).toBe('Live reading');
  });
});

describe('buildLocalSmogPlan — fallback smog & smoker-recovery plan generation', () => {
  it('omits smokerRecovery for non-smokers and enforces severe AQI safety rules for seniors, children, and asthma', () => {
    const aqi = createMockAqiData({
      current: { usAqi: 265, pm25: 155.0, pm10: 240.0, no2: 40, ozone: 20, co: 1000 },
    });
    const profile = createProfile({
      members: ['Elderly Parents', 'Children', 'Asthma/Respiratory Sensitivity'],
      cigarettesSmokedToday: 0,
    });

    const plan = buildLocalSmogPlan(aqi, profile);

    expect(plan.smokerRecovery).toBeNull();
    expect(plan.dailyRoutine.map((r) => r.period)).toEqual([
      'Morning',
      'Afternoon',
      'Evening',
      'Night',
    ]);
    expect(plan.indoorHacks).toHaveLength(4);
    expect(plan.sustainableSwaps.map((s) => s.category)).toEqual([
      'Commute',
      'Cooking',
      'Waste',
    ]);
    expect(plan.communityAlert.lines).toHaveLength(4);
    expect(plan.healthYoga.sessions).toHaveLength(6);
    expect(plan.trainYoga.sessions).toHaveLength(5);

    // Severe AQI safety rule for vulnerable households
    expect(plan.healthYoga.aqiSafetyGuidance).toMatch(/Kapalabhati|Bhastrika/i);
    for (const session of plan.healthYoga.sessions) {
      expect(session.pacerConfig.holdSec).toBeLessThanOrEqual(2);
    }
  });

  it('generates calibrated smokerRecovery initials & lung-clearing drills when cigarettesSmokedToday > 0', () => {
    const aqi = createMockAqiData({
      current: { usAqi: 215, pm25: 120.0, pm10: 190.0, no2: 38, ozone: 24, co: 950 },
    });
    const profile = createProfile({
      members: ['Healthy Adults', 'Outdoor Runner/Athlete'],
      homeSetup: '1 HEPA Air Purifier',
      cigarettesSmokedToday: 5,
    });

    const plan = buildLocalSmogPlan(aqi, profile);

    const recovery = plan.smokerRecovery;
    expect(recovery).not.toBeNull();
    if (!recovery) return;

    expect(recovery.cigarettesCount).toBe(5);
    expect(recovery.smokingEquivalentPm25).toBe(110);
    expect(recovery.combinedPm25Burden).toBe(230);

    // 4 immediate first-60-minute initials
    expect(recovery.immediateInitials).toHaveLength(4);
    const initialTitles = recovery.immediateInitials.map((i) => i.title).join(' | ');
    expect(initialTitles).toMatch(/Steam/i);
    expect(initialTitles).toMatch(/Vitamin-C|Hydration/i);
    expect(initialTitles).toMatch(/2-Hour|Exertion/i);
    expect(initialTitles).toMatch(/Filtered|Indoor/i);

    // 4 targeted lung-clearing exercises
    expect(recovery.lungClearingExercises).toHaveLength(4);
    const exerciseNames = recovery.lungClearingExercises.map((e) => e.name).join(' | ');
    expect(exerciseNames).toMatch(/Pursed-Lip/i);
    expect(exerciseNames).toMatch(/Diaphragmatic/i);
    expect(exerciseNames).toMatch(/Huff Coughing/i);
    expect(exerciseNames).toMatch(/Bhramari|Nadi Shodhana/i);

    // Cardio warning and Train/Health integration
    expect(recovery.cardioWarning).toMatch(/outdoor cardio|2 hours/i);
    expect(plan.trainYoga.smogConditioningNote).toMatch(/2 hours|smoking/i);
    expect(plan.headlineAdvisory).toMatch(/60-minute/i);
  });

  it('generates Hinglish community alert when language is Hinglish/Hindi', () => {
    const aqi = createMockAqiData({
      displayName: 'New Delhi, India',
      current: { usAqi: 180, pm25: 92.5, pm10: 150.0, no2: 30, ozone: 25, co: 800 },
    });
    const profile = createProfile({
      language: 'Hinglish/Hindi',
      commute: 'Petrol/Diesel Car',
    });

    const plan = buildLocalSmogPlan(aqi, profile);
    expect(plan.communityAlert.languageUsed).toBe('Hinglish / Hindi');
    expect(plan.communityAlert.lines).toHaveLength(4);
    expect(plan.communityAlert.lines.join(' ')).toMatch(/New Delhi, India/);
  });

  it('distinguishes moderate AQI non-smoker plans from heavy smoker (10+) recovery plans', () => {
    const moderateAqi = createMockAqiData({
      current: { usAqi: 85, pm25: 28.0, pm10: 54.0, no2: 18, ozone: 32, co: 420 },
      safeWindow: {
        windowLabel: '12:00 PM – 3:00 PM',
        avgAqi: 72,
        minAqi: 68,
        maxAqi: 76,
        avgPm25: 21.5,
        advisory: 'Moderate daytime air quality.',
        severity: 'caution',
        startIndex: 12,
        endIndex: 15,
      },
    });

    const nonSmokerPlan = buildLocalSmogPlan(
      moderateAqi,
      createProfile({ members: ['Healthy Adults'], cigarettesSmokedToday: 0 })
    );
    expect(nonSmokerPlan.smokerRecovery).toBeNull();
    expect(nonSmokerPlan.healthYoga.sessions[0].pacerConfig.holdSec).toBe(4);

    const heavySmokerPlan = buildLocalSmogPlan(
      moderateAqi,
      createProfile({ members: ['Healthy Adults'], cigarettesSmokedToday: 12 })
    );
    expect(heavySmokerPlan.smokerRecovery).not.toBeNull();
    expect(heavySmokerPlan.smokerRecovery?.cigarettesCount).toBe(12);
    expect(heavySmokerPlan.smokerRecovery?.smokingEquivalentPm25).toBe(264);
    expect(heavySmokerPlan.smokerRecovery?.combinedPm25Burden).toBe(292);
    expect(heavySmokerPlan.healthYoga.sessions[0].pacerConfig.holdSec).toBe(2);
    expect(heavySmokerPlan.healthYoga.aqiSafetyGuidance).toMatch(/Kapalabhati|Bhastrika/i);
  });
});

describe('fogHazardCalculator — winter fog visibility, safe speed cap & pothole-braking risk', () => {
  it('estimates dew point accurately via Magnus approximation and computes wet vs dry stopping distance', () => {
    expect(estimateDewPointC(10, 100)).toBeCloseTo(10, 1);
    expect(estimateDewPointC(20, 50)).toBeLessThan(12);
    expect(calculateStoppingDistanceMeters(40, true)).toBeGreaterThan(
      calculateStoppingDistanceMeters(40, false)
    );
  });

  it('classifies zero-visibility smog-fog vs dense fog vs clear winter roads accurately', () => {
    const zeroVis = calculateFogHazard({
      temperatureC: 7.5,
      dewPointC: 7.2,
      relativeHumidityPct: 98,
      windSpeedKmh: 2.5,
      pm25: 290,
      commute: 'Two-Wheeler (Bike/Scooter)',
    });
    expect(zeroVis.estimatedVisibilityMeters).toBeLessThanOrEqual(50);
    expect(zeroVis.fogSeverity).toBe('Zero-Visibility Smog-Fog');
    expect(zeroVis.safeSpeedCapKmh).toBe(15);
    expect(zeroVis.potholeBrakingRisk).toBe('Extreme');

    const denseFogCar = calculateFogHazard({
      temperatureC: 9.0,
      dewPointC: 8.0,
      relativeHumidityPct: 92,
      windSpeedKmh: 4.0,
      pm25: 190,
      commute: 'Petrol/Diesel Car',
    });
    expect(denseFogCar.estimatedVisibilityMeters).toBeLessThanOrEqual(200);
    expect(denseFogCar.fogSeverity).toBe('Dense Fog');
    expect(denseFogCar.safeSpeedCapKmh).toBe(30);
    expect(denseFogCar.potholeBrakingRisk).toBe('Extreme');

    const clearDay = calculateFogHazard({
      temperatureC: 24.0,
      dewPointC: 10.0,
      relativeHumidityPct: 40,
      windSpeedKmh: 16.0,
      pm25: 14,
      commute: 'Petrol/Diesel Car',
    });
    expect(clearDay.estimatedVisibilityMeters).toBeGreaterThan(1500);
    expect(clearDay.fogSeverity).toBe('Clear');
    expect(clearDay.safeSpeedCapKmh).toBe(60);
    expect(clearDay.potholeBrakingRisk).toBe('Low');
  });

  it('populates roadSafetyAdvice inside buildLocalSmogPlan from live weather and PM2.5 telemetry', () => {
    const foggyAqi = createMockAqiData({
      current: { usAqi: 310, pm25: 230.0, pm10: 320.0, no2: 52, ozone: 14, co: 1650 },
      weather: {
        temperatureC: 8.2,
        dewPointC: 7.6,
        relativeHumidityPct: 96,
        windSpeedKmh: 3.1,
        reportedVisibilityMeters: 80,
      },
    });
    const plan = buildLocalSmogPlan(
      foggyAqi,
      createProfile({ commute: 'Two-Wheeler (Bike/Scooter)' })
    );

    expect(plan.roadSafetyAdvice).toBeDefined();
    expect(plan.roadSafetyAdvice?.visibilityMeters).toBeLessThanOrEqual(100);
    expect(plan.roadSafetyAdvice?.safeSpeedCapKmh).toBeLessThanOrEqual(25);
    expect(plan.roadSafetyAdvice?.potholeBrakingRisk).toBe('Extreme');
    expect(plan.roadSafetyAdvice?.hazardChecklist.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Individual / Solo profile mode — mutual exclusion & solo-focused recommendations', () => {
  it('enforces mutual exclusion between Individual / Solo and family-dependent toggles while preserving personal modifiers', () => {
    expect(isIndividualSoloProfile([INDIVIDUAL_SOLO_MEMBER])).toBe(true);
    expect(getHouseholdMode([INDIVIDUAL_SOLO_MEMBER])).toBe('individual');

    // Selecting Children or Elderly Parents automatically deselects Individual / Solo
    const withChildren = toggleHouseholdMember([INDIVIDUAL_SOLO_MEMBER], 'Children');
    expect(withChildren).toEqual(['Children']);
    expect(isIndividualSoloProfile(withChildren)).toBe(false);
    expect(getHouseholdMode(withChildren)).toBe('family');

    // Selecting Individual / Solo clears family dependents while keeping personal runner/asthma modifiers
    const backToSolo = toggleHouseholdMember(
      ['Children', 'Elderly Parents', 'Outdoor Runner/Athlete'],
      INDIVIDUAL_SOLO_MEMBER
    );
    expect(backToSolo).toEqual([INDIVIDUAL_SOLO_MEMBER, 'Outdoor Runner/Athlete']);
    expect(isIndividualSoloProfile(backToSolo)).toBe(true);
    expect(getHouseholdMode(backToSolo)).toBe('individual');

    // Deselecting the last remaining family option cleanly falls back to Individual / Solo
    const fallbackSolo = toggleHouseholdMember(['Elderly Parents'], 'Elderly Parents');
    expect(fallbackSolo).toEqual([INDIVIDUAL_SOLO_MEMBER]);
  });

  it('generates solo-focused routines, ventilation, and fitness guidance without child or elderly care instructions', () => {
    const aqi = createMockAqiData({
      current: { usAqi: 185, pm25: 102.0, pm10: 175.0, no2: 36, ozone: 24, co: 880 },
    });
    const soloProfile = createProfile({
      members: [INDIVIDUAL_SOLO_MEMBER, 'Outdoor Runner/Athlete'],
      commute: 'Two-Wheeler (Bike/Scooter)',
      homeSetup: '1 HEPA Air Purifier',
      cigarettesSmokedToday: 0,
    });

    const plan = buildLocalSmogPlan(aqi, soloProfile);

    expect(plan.headlineAdvisory).toMatch(/solo/i);
    expect(plan.dailyRoutine).toHaveLength(4);

    const routineText = plan.dailyRoutine
      .map((block) => `${block.ventilationAction} ${block.maskGuidance} ${block.familyActions.join(' ')}`)
      .join(' ');
    expect(routineText).toMatch(/solo/i);
    expect(routineText).toMatch(/commute|workspace|workout/i);
    expect(routineText).not.toMatch(/elderly parents|kids-size|school transit/i);

    // Indoor HEPA hack and Health/Train yoga should reflect solo bedroom/workspace & fitness schedule
    expect(plan.indoorHacks[0].howToExecute).toMatch(/workspace/i);
    expect(plan.indoorHacks[0].howToExecute).not.toMatch(/family room/i);

    const yogaText = [
      plan.healthYoga.summary,
      ...plan.healthYoga.sessions.map((s) => s.tailoredNote),
      plan.trainYoga.summary,
    ].join(' ');
    expect(yogaText).toMatch(/solo|personal/i);
    expect(yogaText).not.toMatch(/elderly parents|children and seniors|safe for seniors/i);
  });

  it('scales combined PM2.5 and recovery guidance across 0 vs 20+ cigarettes/day for solo and dependent profiles', () => {
    const aqi = createMockAqiData({
      current: { usAqi: 210, pm25: 115.0, pm10: 190.0, no2: 38, ozone: 22, co: 980 },
    });

    const soloZero = calculateCombinedParticulateLoad(aqi.current.pm25, 0);
    const soloTwenty = calculateCombinedParticulateLoad(aqi.current.pm25, 20);
    const soloTwentyFive = calculateCombinedParticulateLoad(aqi.current.pm25, 25);

    expect(soloZero.severity).toBe('non-smoker');
    expect(soloZero.combinedPm25Burden).toBe(115);

    expect(soloTwenty.severity).toBe('severe');
    expect(soloTwenty.smokingEquivalentPm25).toBe(440);
    expect(soloTwenty.combinedPm25Burden).toBe(555);

    expect(soloTwentyFive.severity).toBe('severe');
    expect(soloTwentyFive.smokingEquivalentPm25).toBe(550);
    expect(soloTwentyFive.combinedPm25Burden).toBe(665);

    const soloHeavyPlan = buildLocalSmogPlan(
      aqi,
      createProfile({ members: [INDIVIDUAL_SOLO_MEMBER], cigarettesSmokedToday: 22 })
    );
    expect(soloHeavyPlan.smokerRecovery?.cigarettesCount).toBe(22);
    expect(soloHeavyPlan.smokerRecovery?.combinedPm25Burden).toBe(115 + 22 * PM25_PER_CIGARETTE);
    expect(soloHeavyPlan.headlineAdvisory).toMatch(/solo/i);

    const dependentZeroPlan = buildLocalSmogPlan(
      aqi,
      createProfile({ members: ['Children', 'Elderly Parents'], cigarettesSmokedToday: 0 })
    );
    expect(dependentZeroPlan.smokerRecovery).toBeNull();
    expect(dependentZeroPlan.dailyRoutine[0].familyActions.join(' ')).toMatch(/elderly parents|children/i);
  });

  it('evaluates zero-visibility pileup risk conservatively for two-wheelers vs cars vs work-from-home', () => {
    const baseZeroVis = {
      temperatureC: 6.5,
      dewPointC: 6.4,
      relativeHumidityPct: 99,
      windSpeedKmh: 2.0,
      pm25: 310,
      reportedVisibilityMeters: 35,
    };

    const twoWheeler = calculateFogHazard({
      ...baseZeroVis,
      commute: 'Two-Wheeler (Bike/Scooter)',
    });
    const car = calculateFogHazard({
      ...baseZeroVis,
      commute: 'Petrol/Diesel Car',
    });
    const wfh = calculateFogHazard({
      ...baseZeroVis,
      commute: 'Work From Home',
    });

    expect(twoWheeler.fogSeverity).toBe('Zero-Visibility Smog-Fog');
    expect(twoWheeler.potholeBrakingRisk).toBe('Extreme');
    expect(twoWheeler.safeSpeedCapKmh).toBeLessThanOrEqual(car.safeSpeedCapKmh);
    expect(wfh.fogSeverity).toBe('Zero-Visibility Smog-Fog');
    expect(wfh.commuterTips.length).toBeGreaterThanOrEqual(3);
  });
});

