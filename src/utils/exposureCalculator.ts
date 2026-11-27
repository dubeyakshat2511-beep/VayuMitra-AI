import type { FamilyProfile, HouseholdMemberOption, LiveAqiData } from '../types/vayu';

/** Baseline single-adult household option. */
export const INDIVIDUAL_SOLO_MEMBER: HouseholdMemberOption = 'Individual / Solo';

/** Family-dependent household options that are mutually exclusive with solo mode. */
export const FAMILY_DEPENDENT_MEMBERS: readonly HouseholdMemberOption[] = [
  'Children',
  'Elderly Parents',
];

/** High-level household profile mode passed into Gemini prompts and offline fallbacks. */
export type HouseholdMode = 'individual' | 'family';

/**
 * Returns true when the profile represents a single adult ("Individual / Solo")
 * with no family-dependent selections (Children or Elderly Parents).
 */
export function isIndividualSoloProfile(
  members: readonly HouseholdMemberOption[]
): boolean {
  const hasFamilyDependents = FAMILY_DEPENDENT_MEMBERS.some((dep) =>
    members.includes(dep)
  );
  if (hasFamilyDependents) {
    return false;
  }
  return members.includes(INDIVIDUAL_SOLO_MEMBER);
}

/**
 * Returns `'individual'` when solo-adult mode is active, or `'family'` otherwise.
 */
export function getHouseholdMode(
  members: readonly HouseholdMemberOption[]
): HouseholdMode {
  return isIndividualSoloProfile(members) ? 'individual' : 'family';
}

/**
 * Pure state-transition helper for toggling household vulnerability options:
 * - Enabling `'Individual / Solo'` clears family-dependent options (`Children`,
 *   `Elderly Parents`) and multi-adult `'Healthy Adults'`, while keeping personal
 *   health/fitness modifiers (`Asthma/Respiratory Sensitivity`, `Outdoor Runner/Athlete`).
 * - Enabling family dependents or `'Healthy Adults'` automatically deselects
 *   `'Individual / Solo'`.
 * - Deselecting the last remaining option falls back cleanly to `['Individual / Solo']`.
 */
export function toggleHouseholdMember(
  currentMembers: readonly HouseholdMemberOption[],
  target: HouseholdMemberOption
): HouseholdMemberOption[] {
  const exists = currentMembers.includes(target);

  if (target === INDIVIDUAL_SOLO_MEMBER) {
    if (exists) {
      const remaining = currentMembers.filter((m) => m !== INDIVIDUAL_SOLO_MEMBER);
      return remaining.length > 0 ? remaining : [INDIVIDUAL_SOLO_MEMBER];
    }
    const personalModifiers = currentMembers.filter(
      (m) =>
        m === 'Asthma/Respiratory Sensitivity' ||
        m === 'Outdoor Runner/Athlete'
    );
    return [INDIVIDUAL_SOLO_MEMBER, ...personalModifiers];
  }

  const isFamilyOrMultiAdult =
    FAMILY_DEPENDENT_MEMBERS.includes(target) || target === 'Healthy Adults';

  if (exists) {
    const remaining = currentMembers.filter((m) => m !== target);
    return remaining.length > 0 ? remaining : [INDIVIDUAL_SOLO_MEMBER];
  }

  const base = isFamilyOrMultiAdult
    ? currentMembers.filter((m) => m !== INDIVIDUAL_SOLO_MEMBER)
    : [...currentMembers];

  return [...base, target];
}

/**
 * Equivalent 24-hour PM2.5 lung burden (µg/m³) added per cigarette smoked,
 * based on the widely cited Berkeley Earth particulate-equivalence rule of thumb.
 */
export const PM25_PER_CIGARETTE = 22;

/** Minimum supported daily cigarette count. */
export const MIN_CIGARETTES_PER_DAY = 0;

/** Maximum supported daily cigarette count in the lifestyle tracker. */
export const MAX_CIGARETTES_PER_DAY = 40;

/** Prefix used to namespace cached personalized smog plans in sessionStorage. */
export const PLAN_CACHE_PREFIX = 'vayumitra_plan_v2::';

/** Qualitative severity tier for combined ambient + smoking PM2.5 exposure. */
export type CombinedBurdenSeverity = 'non-smoker' | 'elevated' | 'high' | 'severe';

/** Structured breakdown of ambient city PM2.5 plus daily cigarette particulate load. */
export interface CombinedParticulateLoad {
  /** Clamped integer number of cigarettes smoked today (0–40). */
  cigarettesCount: number;
  /** Validated live ambient PM2.5 reading in µg/m³, or null if unavailable. */
  ambientPm25: number | null;
  /** Equivalent PM2.5 burden (µg/m³) contributed strictly by cigarettes smoked today. */
  smokingEquivalentPm25: number;
  /** Combined equivalent PM2.5 lung burden (µg/m³), rounded to 1 decimal place. */
  combinedPm25Burden: number;
  /** True when at least 1 cigarette has been logged today. */
  hasSmokingExposure: boolean;
  /** Severity classification derived from cigarette count and combined PM2.5 burden. */
  severity: CombinedBurdenSeverity;
  /** Human-readable severity label for UI badges and summaries. */
  severityLabel: string;
}

/**
 * Normalizes a raw daily cigarette count into a safe integer between
 * {@link MIN_CIGARETTES_PER_DAY} and {@link MAX_CIGARETTES_PER_DAY}.
 */
export function clampCigaretteCount(rawCount: number | null | undefined): number {
  if (typeof rawCount !== 'number' || !Number.isFinite(rawCount)) {
    return MIN_CIGARETTES_PER_DAY;
  }
  return Math.max(
    MIN_CIGARETTES_PER_DAY,
    Math.min(MAX_CIGARETTES_PER_DAY, Math.round(rawCount))
  );
}

/**
 * Computes the equivalent PM2.5 particulate load (µg/m³) attributable to daily smoking.
 */
export function calculateSmokingEquivalentPm25(
  cigarettesSmokedToday: number | null | undefined
): number {
  return clampCigaretteCount(cigarettesSmokedToday) * PM25_PER_CIGARETTE;
}

/**
 * Computes the real-time combined PM2.5 particulate burden from live ambient air
 * quality and cigarettes smoked today, along with a qualitative severity tier.
 */
export function calculateCombinedParticulateLoad(
  ambientPm25: number | null | undefined,
  cigarettesSmokedToday: number | null | undefined
): CombinedParticulateLoad {
  const cigarettesCount = clampCigaretteCount(cigarettesSmokedToday);
  const smokingEquivalentPm25 = cigarettesCount * PM25_PER_CIGARETTE;
  const livePm25 =
    typeof ambientPm25 === 'number' && Number.isFinite(ambientPm25) && ambientPm25 >= 0
      ? ambientPm25
      : null;

  const combinedPm25Burden = Number(
    ((livePm25 ?? 0) + smokingEquivalentPm25).toFixed(1)
  );
  const hasSmokingExposure = cigarettesCount > 0;

  let severity: CombinedBurdenSeverity;
  let severityLabel: string;

  if (!hasSmokingExposure) {
    severity = 'non-smoker';
    severityLabel = 'Combined Particulate Load · Non-Smoker';
  } else if (combinedPm25Burden >= 200 || cigarettesCount >= 6) {
    severity = 'severe';
    severityLabel = 'Severe Combined Lung Burden';
  } else if (combinedPm25Burden >= 100 || cigarettesCount >= 3) {
    severity = 'high';
    severityLabel = 'High Combined Lung Burden';
  } else {
    severity = 'elevated';
    severityLabel = 'Elevated Combined Lung Burden';
  }

  return {
    cigarettesCount,
    ambientPm25: livePm25,
    smokingEquivalentPm25,
    combinedPm25Burden,
    hasSmokingExposure,
    severity,
    severityLabel,
  };
}

/**
 * Builds a deterministic, member-order-independent `sessionStorage` cache key for
 * a personalized smog action plan based on city, live US AQI, household profile,
 * commute, home air setup, language, and daily cigarette count.
 */
export function buildSmogPlanCacheKey(
  aqi: Pick<LiveAqiData, 'displayName' | 'query' | 'current'> | null,
  profile: FamilyProfile
): string {
  const city = (aqi?.displayName || aqi?.query || '').trim().toLowerCase();
  const usAqi = aqi?.current.usAqi ?? 0;
  const household = [...profile.members].sort().join(',');
  const cigs = clampCigaretteCount(profile.cigarettesSmokedToday);
  return `${PLAN_CACHE_PREFIX}${city}|${usAqi}|${household}|${profile.commute}|${profile.homeSetup}|${profile.language}|cigs:${cigs}`;
}
