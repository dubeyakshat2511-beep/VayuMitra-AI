import { Check, Loader2, Sparkles, User } from 'lucide-react';
import type {
  CommuteOption,
  FamilyProfile,
  HomeAirSetupOption,
  HouseholdMemberOption,
  LanguageOption,
} from '../types/vayu';
import {
  INDIVIDUAL_SOLO_MEMBER,
  isIndividualSoloProfile,
  toggleHouseholdMember,
} from '../utils/exposureCalculator';
import { SmokerExposurePanel } from './SmokerExposurePanel';

const HOUSEHOLD_MEMBER_OPTIONS: {
  value: HouseholdMemberOption;
  detail: string;
  isSolo?: boolean;
}[] = [
  {
    value: INDIVIDUAL_SOLO_MEMBER,
    detail: 'Single adult baseline — personal routines, solo commute & fitness',
    isSolo: true,
  },
  { value: 'Healthy Adults', detail: 'Multi-adult household & shared daily commutes' },
  { value: 'Children', detail: 'Developing lungs, school transit & outdoor play' },
  { value: 'Elderly Parents', detail: 'Cardiopulmonary & early-morning walk risk' },
  { value: 'Asthma/Respiratory Sensitivity', detail: 'Inhaler readiness & low PM2.5 triggers' },
  { value: 'Outdoor Runner/Athlete', detail: 'High minute-ventilation exposure' },
];

const COMMUTE_OPTIONS: CommuteOption[] = [
  'Two-Wheeler (Bike/Scooter)',
  'Petrol/Diesel Car',
  'Public Transit (Metro/Bus)',
  'Auto/E-Rickshaw',
  'Work From Home',
];

const HOME_SETUP_OPTIONS: HomeAirSetupOption[] = [
  'No Air Purifier (Budget/Natural hacks needed)',
  '1 HEPA Air Purifier',
  'Central Filtration',
];

const LANGUAGE_OPTIONS: { value: LanguageOption; label: string }[] = [
  { value: 'English', label: 'English' },
  { value: 'Hinglish/Hindi', label: 'Hinglish / Hindi' },
];

/** Props accepted by {@link FamilyProfilePanel}. */
export interface FamilyProfilePanelProps {
  /** Current household vulnerability, commute, home setup, smoking, and language profile. */
  profile: FamilyProfile;
  /** Callback fired when any field in the profile changes. */
  onProfileChange: (next: FamilyProfile) => void;
  /** Triggers smog action plan generation for the current city and profile. */
  onGeneratePlan: () => void;
  /** True while a smog action plan request is in flight. */
  isGenerating: boolean;
  /** True during the brief post-generation cooldown window. */
  isCooldownActive?: boolean;
  /** Optional status message shown inside the primary CTA while generating. */
  generationStatus?: string | null;
  /** True when live AQI data is ready and generation is allowed. */
  canGenerate: boolean;
  /** True when profile or city inputs changed since the last generated plan. */
  hasUnsavedChanges: boolean;
  /** Live ambient PM2.5 reading (µg/m³) passed into {@link SmokerExposurePanel}. */
  ambientPm25?: number | null;
  /** Live ambient US AQI passed into {@link SmokerExposurePanel}. */
  ambientAqi?: number | null;
}

/**
 * Household vulnerability, lifestyle, and daily cigarette exposure configuration sidebar.
 * Supports baseline "Individual / Solo" mode alongside family-dependent profiles.
 */
export function FamilyProfilePanel({
  profile,
  onProfileChange,
  onGeneratePlan,
  isGenerating,
  isCooldownActive = false,
  generationStatus = null,
  canGenerate,
  hasUnsavedChanges,
  ambientPm25 = null,
  ambientAqi = null,
}: FamilyProfilePanelProps) {
  const soloActive = isIndividualSoloProfile(profile.members);

  const handleToggleMember = (member: HouseholdMemberOption) => {
    const nextMembers = toggleHouseholdMember(profile.members, member);
    onProfileChange({ ...profile, members: nextMembers });
  };

  return (
    <aside
      id="family-profile"
      aria-label="Family and lifestyle profile configuration"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 transition-colors duration-150"
    >
      {/* Header */}
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Family &amp; Lifestyle Profile
          </h2>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 whitespace-nowrap">
            {soloActive ? 'Solo Mode' : 'Household Mode'}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Tailor inversion schedules, indoor filtration hacks, and emission swaps to your routine.
        </p>
      </div>

      {/* Household Members Multi-Select */}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Household Vulnerability
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {profile.members.length} selected
          </span>
        </div>

        <div className="space-y-2" role="group" aria-label="Household vulnerability options">
          {HOUSEHOLD_MEMBER_OPTIONS.map((opt) => {
            const selected = profile.members.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={selected}
                aria-label={`${selected ? 'Deselect' : 'Select'} ${opt.value} profile option`}
                onClick={() => handleToggleMember(opt.value)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors duration-150 flex items-start gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  selected
                    ? 'bg-emerald-50/75 dark:bg-emerald-950/45 border-emerald-600/60 dark:border-emerald-500/60 text-slate-900 dark:text-slate-100'
                    : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                    selected
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {selected ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : opt.isSolo ? (
                    <User className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium leading-snug">
                    {opt.isSolo && (
                      <User
                        className={`w-3.5 h-3.5 shrink-0 ${
                          selected
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    <span>{opt.value}</span>
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {opt.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cigarettes Smoked Today Tracker */}
      <SmokerExposurePanel
        cigarettesSmokedToday={profile.cigarettesSmokedToday}
        onChangeCigarettes={(nextCount) =>
          onProfileChange({ ...profile, cigarettesSmokedToday: nextCount })
        }
        ambientPm25={ambientPm25}
        ambientAqi={ambientAqi}
      />

      {/* Commute & Home Setup Dropdowns */}
      <div className="p-5 sm:p-6 space-y-4">
        <div>
          <label
            htmlFor="commute-select"
            className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1.5"
          >
            Primary Daily Commute
          </label>
          <select
            id="commute-select"
            value={profile.commute}
            onChange={(e) =>
              onProfileChange({ ...profile, commute: e.target.value as CommuteOption })
            }
            className="w-full h-11 px-3.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/25 transition-colors cursor-pointer"
          >
            {COMMUTE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="home-setup-select"
            className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1.5"
          >
            Home Air Setup
          </label>
          <select
            id="home-setup-select"
            value={profile.homeSetup}
            onChange={(e) =>
              onProfileChange({ ...profile, homeSetup: e.target.value as HomeAirSetupOption })
            }
            className="w-full h-11 px-3.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/25 transition-colors cursor-pointer"
          >
            {HOME_SETUP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Language Segmented Toggle */}
        <div>
          <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
            Community Sharing Language
          </span>
          <div
            role="group"
            aria-label="Language selection"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-lg"
          >
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = profile.language === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onProfileChange({ ...profile, language: opt.value })}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Primary Action Footer */}
      <div className="p-5 sm:p-6 bg-slate-50/70 dark:bg-slate-950/60 rounded-b-xl space-y-2.5">
        <button
          type="button"
          onClick={onGeneratePlan}
          disabled={!canGenerate || isGenerating || isCooldownActive}
          className="w-full h-12 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 rounded-lg transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        >
          {isGenerating || isCooldownActive ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          ) : (
            <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {isGenerating
              ? generationStatus || 'Analyzing Live AQI & Profile...'
              : isCooldownActive
                ? 'Ready in a moment...'
                : 'Generate Personalized Smog Plan'}
          </span>
        </button>

        {hasUnsavedChanges && !isGenerating && (
          <p
            aria-live="polite"
            className="text-xs text-amber-700 dark:text-amber-300 text-center font-medium"
          >
            Profile or location updated — generate again to refresh your action plan.
          </p>
        )}
      </div>
    </aside>
  );
}
