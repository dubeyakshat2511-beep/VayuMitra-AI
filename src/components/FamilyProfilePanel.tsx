import { Check, Loader2, Sparkles } from 'lucide-react';
import type {
  CommuteOption,
  FamilyProfile,
  HomeAirSetupOption,
  HouseholdMemberOption,
  LanguageOption,
} from '../types/vayu';

const HOUSEHOLD_MEMBER_OPTIONS: { value: HouseholdMemberOption; detail: string }[] = [
  { value: 'Healthy Adults', detail: 'Working adults & daily commuters' },
  { value: 'Children', detail: 'Developing lungs, school transit' },
  { value: 'Elderly Parents', detail: 'Cardiopulmonary & morning walk risk' },
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

interface FamilyProfilePanelProps {
  profile: FamilyProfile;
  onProfileChange: (next: FamilyProfile) => void;
  onGeneratePlan: () => void;
  isGenerating: boolean;
  isCooldownActive?: boolean;
  generationStatus?: string | null;
  canGenerate: boolean;
  hasUnsavedChanges: boolean;
}

export function FamilyProfilePanel({
  profile,
  onProfileChange,
  onGeneratePlan,
  isGenerating,
  isCooldownActive = false,
  generationStatus = null,
  canGenerate,
  hasUnsavedChanges,
}: FamilyProfilePanelProps) {
  const toggleMember = (member: HouseholdMemberOption) => {
    const exists = profile.members.includes(member);
    if (exists && profile.members.length === 1) {
      // Keep at least one household member selected
      return;
    }
    const nextMembers = exists
      ? profile.members.filter((m) => m !== member)
      : [...profile.members, member];
    onProfileChange({ ...profile, members: nextMembers });
  };

  return (
    <aside
      id="family-profile"
      aria-label="Family and lifestyle profile configuration"
      className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100"
    >
      {/* Header */}
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          Family &amp; Lifestyle Profile
        </h2>
        <p className="mt-1 text-sm text-slate-600 leading-relaxed">
          Tailor inversion schedules, indoor filtration hacks, and emission swaps to your household.
        </p>
      </div>

      {/* Household Members Multi-Select */}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900">Household Members</span>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {profile.members.length} selected
          </span>
        </div>

        <div className="space-y-2" role="group" aria-label="Household members">
          {HOUSEHOLD_MEMBER_OPTIONS.map((opt) => {
            const selected = profile.members.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleMember(opt.value)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors duration-150 flex items-start gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  selected
                    ? 'bg-emerald-50/70 border-emerald-600/50 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                    selected
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-300'
                  }`}
                >
                  {selected && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug">{opt.value}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{opt.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Commute & Home Setup Dropdowns */}
      <div className="p-5 sm:p-6 space-y-4">
        <div>
          <label
            htmlFor="commute-select"
            className="block text-sm font-semibold text-slate-900 mb-1.5"
          >
            Primary Daily Commute
          </label>
          <select
            id="commute-select"
            value={profile.commute}
            onChange={(e) =>
              onProfileChange({ ...profile, commute: e.target.value as CommuteOption })
            }
            className="w-full h-11 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/25 transition-colors cursor-pointer"
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
            className="block text-sm font-semibold text-slate-900 mb-1.5"
          >
            Home Air Setup
          </label>
          <select
            id="home-setup-select"
            value={profile.homeSetup}
            onChange={(e) =>
              onProfileChange({ ...profile, homeSetup: e.target.value as HomeAirSetupOption })
            }
            className="w-full h-11 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/25 transition-colors cursor-pointer"
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
          <span className="block text-sm font-semibold text-slate-900 mb-1.5">
            Community Sharing Language
          </span>
          <div
            role="group"
            aria-label="Language selection"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg"
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
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
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
      <div className="p-5 sm:p-6 bg-slate-50/70 rounded-b-xl space-y-2.5">
        <button
          type="button"
          onClick={onGeneratePlan}
          disabled={!canGenerate || isGenerating || isCooldownActive}
          className="w-full h-12 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
          <p className="text-xs text-amber-700 text-center font-medium">
            Profile or location updated — generate again to refresh your action plan.
          </p>
        )}
      </div>
    </aside>
  );
}
