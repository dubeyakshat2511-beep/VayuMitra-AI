export type HouseholdMemberOption =
  | 'Individual / Solo'
  | 'Healthy Adults'
  | 'Children'
  | 'Elderly Parents'
  | 'Asthma/Respiratory Sensitivity'
  | 'Outdoor Runner/Athlete';

export type CommuteOption =
  | 'Two-Wheeler (Bike/Scooter)'
  | 'Petrol/Diesel Car'
  | 'Public Transit (Metro/Bus)'
  | 'Auto/E-Rickshaw'
  | 'Work From Home';

export type HomeAirSetupOption =
  | 'No Air Purifier (Budget/Natural hacks needed)'
  | '1 HEPA Air Purifier'
  | 'Central Filtration';

export type LanguageOption = 'English' | 'Hinglish/Hindi';

export interface FamilyProfile {
  members: HouseholdMemberOption[];
  commute: CommuteOption;
  homeSetup: HomeAirSetupOption;
  language: LanguageOption;
  cigarettesSmokedToday: number;
}

export interface LocationSelection {
  name: string;
  displayName: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  isLandmark?: boolean;
}

export interface HourlyAqiPoint {
  isoTime: string;
  hourLabel: string;
  hour24: number;
  usAqi: number;
  pm25: number;
  pm10: number;
}

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

export type RoutineRiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe';

export interface RoutineBlock {
  period: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  timeRange: string;
  riskLevel: RoutineRiskLevel;
  ventilationAction: string;
  inversionExplanation: string;
  maskGuidance: string;
  familyActions: string[];
}

export interface IndoorHack {
  title: string;
  estimatedPm25ReductionPct: number;
  costEstimate: string;
  timeRequired: string;
  howToExecute: string;
  whyItWorks: string;
}

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

export interface CommunityAlert {
  subject: string;
  lines: string[];
  languageUsed: string;
  callToAction: string;
}

export type YogaSessionType = 'Pranayama' | 'Restorative' | 'Dynamic Flow';

export interface BreathingPacerConfig {
  inhaleSec: number;
  holdSec: number;
  exhaleSec: number;
}

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

export interface HealthYogaModule {
  summary: string;
  aqiSafetyGuidance: string;
  sessions: YogaSession[];
}

export interface TrainYogaModule {
  summary: string;
  smogConditioningNote: string;
  sessions: YogaSession[];
}

export interface SmokerInitialStep {
  id: string;
  title: string;
  timingWindow: string;
  action: string;
  physiologicalReason: string;
}

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
