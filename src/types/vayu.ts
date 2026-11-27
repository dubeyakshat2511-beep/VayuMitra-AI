/** Supported household vulnerability and lifestyle profile tags. */
export type HouseholdMemberOption =
  | 'Individual / Solo'
  | 'Healthy Adults'
  | 'Children'
  | 'Elderly Parents'
  | 'Asthma/Respiratory Sensitivity'
  | 'Outdoor Runner/Athlete';

/** Supported primary daily commute modes used for exposure and fog-speed modeling. */
export type CommuteOption =
  | 'Two-Wheeler (Bike/Scooter)'
  | 'Petrol/Diesel Car'
  | 'Public Transit (Metro/Bus)'
  | 'Auto/E-Rickshaw'
  | 'Work From Home';

/** Supported indoor air filtration hardware configurations. */
export type HomeAirSetupOption =
  | 'No Air Purifier (Budget/Natural hacks needed)'
  | '1 HEPA Air Purifier'
  | 'Central Filtration';

/** Supported languages for community RWA WhatsApp alerts. */
export type LanguageOption = 'English' | 'Hinglish/Hindi';

/** Complete household vulnerability, commute, indoor air, language, and smoking profile. */
export interface FamilyProfile {
  members: HouseholdMemberOption[];
  commute: CommuteOption;
  homeSetup: HomeAirSetupOption;
  language: LanguageOption;
  cigarettesSmokedToday: number;
}

/** Resolved city, locality, or pinned landmark coordinate selection. */
export interface LocationSelection {
  name: string;
  displayName: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  isLandmark?: boolean;
}

/** Single hourly air quality data point in the 24-hour dispersion forecast. */
export interface HourlyAqiPoint {
  isoTime: string;
  hourLabel: string;
  hour24: number;
  usAqi: number;
  pm25: number;
  pm10: number;
}

/** Computed lowest-particulate 2-hour daytime outdoor window from the 24-hour forecast. */
export interface SafeOutdoorWindow {
  windowLabel: string;
  avgAqi: number;
  minAqi: number;
  maxAqi: number;
  avgPm25: number;
  advisory: string;
  severity: 'safe' | 'caution' | 'restricted' | 'avoid';
  startIndex: number;
  endIndex: number;
}

/** Live meteorological readings from Open-Meteo used for winter fog & braking risk modeling. */
export interface LiveWeatherSnapshot {
  temperatureC: number;
  dewPointC: number;
  relativeHumidityPct: number;
  windSpeedKmh: number;
  reportedVisibilityMeters: number | null;
}

/** Consolidated live air quality, weather, and 24-hour forecast payload returned by `/api/aqi`. */
export interface LiveAqiData {
  query: string;
  displayName: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  observedAt: string;
  current: {
    usAqi: number;
    pm25: number;
    pm10: number;
    no2: number | null;
    ozone: number | null;
    co: number | null;
  };
  weather?: LiveWeatherSnapshot | null;
  safeWindow: SafeOutdoorWindow;
  hourly: HourlyAqiPoint[];
}

/** Qualitative exposure risk severity for a time-blocked daily routine period. */
export type RoutineRiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe';

/** Single chronological block in the inversion-aware daily smog routine. */
export interface RoutineBlock {
  period: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  timeRange: string;
  riskLevel: RoutineRiskLevel;
  ventilationAction: string;
  inversionExplanation: string;
  maskGuidance: string;
  familyActions: string[];
}

/** Budget-friendly indoor particle reduction measure tailored to home air setup. */
export interface IndoorHack {
  title: string;
  estimatedPm25ReductionPct: number;
  costEstimate: string;
  timeRequired: string;
  howToExecute: string;
  whyItWorks: string;
}

/** Actionable habit swap reducing weekly CO2 and PM2.5/NOx emissions. */
export interface SustainableSwap {
  id: string;
  category: 'Commute' | 'Cooking' | 'Waste';
  title: string;
  currentHabit: string;
  sustainableAction: string;
  weeklyCo2SavedKg: number;
  weeklyPm25NoxPreventedGrams: number;
  lungHealthBenefit: string;
  practicalTip: string;
}

/** Ready-to-share 4-line residential society (RWA) WhatsApp smog notice. */
export interface CommunityAlert {
  subject: string;
  lines: string[];
  languageUsed: string;
  callToAction: string;
}

/** Classification of an indoor yoga or pranayama practice session. */
export type YogaSessionType = 'Pranayama' | 'Restorative' | 'Dynamic Flow';

/** Inhale, hold, and exhale cadence (in seconds) for the visual Breathing Pacer modal. */
export interface BreathingPacerConfig {
  inhaleSec: number;
  holdSec: number;
  exhaleSec: number;
}

/** Structured indoor yoga, breathwork, or lung-clearing exercise session. */
export interface YogaSession {
  id: string;
  name: string;
  categoryGroup: string;
  sessionType: YogaSessionType;
  durationMinutes: number;
  durationLabel: string;
  howToSteps: string[];
  lungOrPerformanceImpact: string;
  tailoredNote: string;
  pacerConfig: BreathingPacerConfig;
}

/** Indoor lung-care yoga and pranayama module tailored to live AQI. */
export interface HealthYogaModule {
  summary: string;
  aqiSafetyGuidance: string;
  sessions: YogaSession[];
}

/** High-AQI indoor athletic yoga and breath-conditioning module. */
export interface TrainYogaModule {
  summary: string;
  smogConditioningNote: string;
  sessions: YogaSession[];
}

/** Single immediate first-60-minute recovery action for users who logged cigarettes today. */
export interface SmokerInitialStep {
  id: string;
  title: string;
  timingWindow: string;
  action: string;
  physiologicalReason: string;
}

/** Conditional smoker lung-recovery protocol generated when daily cigarette count > 0. */
export interface SmokerRecoveryModule {
  cigarettesCount: number;
  smokingEquivalentPm25: number;
  combinedPm25Burden: number;
  burdenSummary: string;
  cardioWarning: string;
  immediateInitials: SmokerInitialStep[];
  lungClearingExercises: YogaSession[];
}

/** Tailored winter fog visibility, safe speed cap, and pothole-braking guidance. */
export interface RoadSafetyAdvice {
  visibilityMeters: number;
  fogSeverity: string;
  safeSpeedCapKmh: number;
  potholeBrakingRisk: string;
  commuteDirective: string;
  hazardChecklist: string[];
}

/** Full consolidated personalized winter smog action plan returned by `/api/smog-plan`. */
export interface SmogActionPlan {
  generatedAt: string;
  citySummary: string;
  headlineAdvisory: string;
  dailyRoutine: RoutineBlock[];
  indoorHacks: IndoorHack[];
  sustainableSwaps: SustainableSwap[];
  communityAlert: CommunityAlert;
  healthYoga: HealthYogaModule;
  trainYoga: TrainYogaModule;
  smokerRecovery?: SmokerRecoveryModule | null;
  roadSafetyAdvice?: RoadSafetyAdvice | null;
}
