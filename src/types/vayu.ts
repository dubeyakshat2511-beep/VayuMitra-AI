export type HouseholdMemberOption =
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
}
