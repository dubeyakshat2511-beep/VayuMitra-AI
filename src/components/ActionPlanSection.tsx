import { useState, type KeyboardEvent } from 'react';
import {
  Activity,
  Clock,
  HeartPulse,
  Home,
  Leaf,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { FamilyProfile, LiveAqiData, SmogActionPlan, YogaSession } from '../types/vayu';
import { RoutineTab } from './RoutineTab';
import { IndoorHacksTab } from './IndoorHacksTab';
import { SustainableSwapsTab } from './SustainableSwapsTab';
import { CommunityAlertTab } from './CommunityAlertTab';
import { HealthYogaTab } from './HealthYogaTab';
import { TrainYogaTab } from './TrainYogaTab';
import { BreathingPacerModal } from './BreathingPacerModal';
import { VoiceAssistantBar } from './VoiceAssistantBar';
import { SmokerRecoveryCard } from './SmokerRecoveryCard';

type TabKey = 'routine' | 'hacks' | 'health' | 'train' | 'swaps' | 'community';

const TABS: { key: TabKey; label: string; icon: typeof Clock }[] = [
  { key: 'routine', label: 'Routine', icon: Clock },
  { key: 'hacks', label: 'Indoor Hacks', icon: Home },
  { key: 'health', label: 'Health', icon: HeartPulse },
  { key: 'train', label: 'Train', icon: Activity },
  { key: 'swaps', label: 'Swaps', icon: Leaf },
  { key: 'community', label: 'RWA Alert', icon: Megaphone },
];

/** Props accepted by {@link ActionPlanSection}. */
export interface ActionPlanSectionProps {
  /** Live Open-Meteo telemetry for the selected city. */
  aqiData: LiveAqiData | null;
  /** User's household, commute, air setup, language, and smoking profile. */
  profile: FamilyProfile;
  /** Generated personalized smog action plan, or null before generation. */
  plan: SmogActionPlan | null;
  /** True while the plan request is in flight. */
  isGenerating: boolean;
  /** True during the post-generation button cooldown window. */
  isCooldownActive?: boolean;
  /** Live progress status message displayed during loading. */
  generationStatus?: string | null;
  /** Error message when plan generation fails. */
  error: string | null;
  /** Checked state map for sustainable habit swaps. */
  checkedSwapIds: Record<string, boolean>;
  /** Toggles completion state of a sustainable swap item by ID. */
  onToggleSwap: (id: string) => void;
  /** Triggers generation or regeneration of the smog action plan. */
  onGeneratePlan: () => void;
  /** Optional handler to open the real-time Gemini Live voice assistant. */
  onOpenLiveVoice?: () => void;
}

/**
 * Primary workspace card hosting the generated Personalized Smog Action Plan,
 * multilingual voice read-aloud bar, conditional Smoker Lung-Recovery protocol,
 * tabbed routines/hacks/yoga/swaps/RWA views, and the visual Breathing Pacer modal.
 */
export function ActionPlanSection({
  aqiData,
  profile,
  plan,
  isGenerating,
  isCooldownActive = false,
  generationStatus = null,
  error,
  checkedSwapIds,
  onToggleSwap,
  onGeneratePlan,
  onOpenLiveVoice,
}: ActionPlanSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('routine');
  const [activePacerSession, setActivePacerSession] = useState<YogaSession | null>(null);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const nextTab = TABS[nextIndex];
      setActiveTab(nextTab.key);
      document.getElementById(`plan-tab-${nextTab.key}`)?.focus();
    }
  };

  return (
    <section
      id="action-plan"
      aria-label="Personalized smog action plan"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors duration-150"
    >
      {/* Top Plan Header & Advisory */}
      <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Personalized Smog Action Plan
            </h2>
            {plan ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{plan.citySummary}</p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Structured respiratory routine, indoor air filtration hacks, lung-care yoga, indoor athletic conditioning, emission swaps, and an RWA society notice tailored to live conditions.
              </p>
            )}
          </div>

          {plan && !isGenerating && (
            <button
              type="button"
              onClick={onGeneratePlan}
              disabled={isCooldownActive}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${isCooldownActive ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Regenerate</span>
            </button>
          )}
        </div>

        {plan && (
          <div className="mt-4 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            <span className="font-semibold text-slate-900 dark:text-white">Priority Directive: </span>
            {plan.headlineAdvisory}
          </div>
        )}
      </div>

      {/* Optional Multilingual Voice Assistant Read-Aloud Bar */}
      {plan && (
        <VoiceAssistantBar
          aqiData={aqiData}
          plan={plan}
          activeTab={activeTab}
          isGeneratingPlan={isGenerating}
          onOpenLiveVoice={onOpenLiveVoice}
        />
      )}

      {/* Dedicated Smoker Lung-Recovery Initials & Exercises Card (ONLY when cigarettesSmokedToday > 0) */}
      {!isGenerating &&
        !error &&
        plan &&
        aqiData &&
        plan.smokerRecovery &&
        plan.smokerRecovery.cigarettesCount > 0 && (
          <SmokerRecoveryCard
            recovery={plan.smokerRecovery}
            usAqi={aqiData.current.usAqi}
            onStartTimer={setActivePacerSession}
          />
        )}

      {/* Section Tab Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-4 sm:px-6 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Smog action plan sections"
          className="flex items-center gap-1 sm:gap-2 min-w-max"
        >
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                id={`plan-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`plan-panel-${tab.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`relative py-3.5 px-3 text-sm font-semibold inline-flex items-center gap-2 border-b-2 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
                  isActive
                    ? 'border-emerald-600 dark:border-emerald-400 text-emerald-800 dark:text-emerald-300'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Body Content */}
      <div className="p-5 sm:p-6">
        {/* Error State */}
        {error && !isGenerating && (
          <div
            role="alert"
            className="p-5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 text-red-900 dark:text-red-100 space-y-3"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-red-950 dark:text-red-100">Unable to generate smog action plan</h3>
                <p className="text-sm text-red-800 dark:text-red-200 leading-relaxed">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onGeneratePlan}
              disabled={!aqiData}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500 disabled:bg-red-300 dark:disabled:bg-red-900/50 rounded-lg transition-colors cursor-pointer"
            >
              Try Generating Again
            </button>
          </div>
        )}

        {/* Loading Skeleton State */}
        {isGenerating && (
          <div className="space-y-6" aria-busy="true" aria-live="polite" aria-label="Generating personalized plan">
            {generationStatus && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{generationStatus}</p>
            )}
            <div className="space-y-6 animate-pulse">
              <div className="space-y-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="h-4 w-56 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3.5 w-80 bg-slate-100 dark:bg-slate-800/70 rounded" />
              </div>
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="grid grid-cols-1 md:grid-cols-12 gap-5 py-3">
                  <div className="md:col-span-4 space-y-2">
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/70 rounded" />
                    <div className="h-3 w-40 bg-slate-100 dark:bg-slate-800/70 rounded" />
                  </div>
                  <div className="md:col-span-8 space-y-2.5">
                    <div className="h-14 w-full bg-slate-100 dark:bg-slate-800/70 rounded-lg" />
                    <div className="h-3 w-11/12 bg-slate-100 dark:bg-slate-800/70 rounded" />
                    <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800/70 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty / Ready State */}
        {!isGenerating && !error && !plan && (
          <div className="py-12 text-center max-w-md mx-auto space-y-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 mx-auto flex items-center justify-center">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Ready to build your personalized winter smog protocol
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Confirm your household members, daily commute, and home air setup, then generate your live action plan including lung-care yoga and indoor conditioning.
              </p>
            </div>
            <button
              type="button"
              onClick={onGeneratePlan}
              disabled={!aqiData}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 rounded-lg transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Generate Personalized Smog Plan</span>
            </button>
          </div>
        )}

        {/* Populated Section Views */}
        {!isGenerating && !error && plan && aqiData && (
          <div
            role="tabpanel"
            id={`plan-panel-${activeTab}`}
            aria-labelledby={`plan-tab-${activeTab}`}
          >
            {activeTab === 'routine' && (
              <RoutineTab
                routine={plan.dailyRoutine}
                safeWindowLabel={aqiData.safeWindow.windowLabel}
              />
            )}
            {activeTab === 'hacks' && (
              <IndoorHacksTab hacks={plan.indoorHacks} homeSetup={profile.homeSetup} />
            )}
            {activeTab === 'health' && plan.healthYoga && (
              <HealthYogaTab
                module={plan.healthYoga}
                usAqi={aqiData.current.usAqi}
                pm25={aqiData.current.pm25}
                profile={profile}
                smokerRecovery={plan.smokerRecovery ?? null}
                onStartTimer={setActivePacerSession}
              />
            )}
            {activeTab === 'train' && plan.trainYoga && (
              <TrainYogaTab
                module={plan.trainYoga}
                usAqi={aqiData.current.usAqi}
                pm25={aqiData.current.pm25}
                profile={profile}
                smokerRecovery={plan.smokerRecovery ?? null}
                onStartTimer={setActivePacerSession}
              />
            )}
            {activeTab === 'swaps' && (
              <SustainableSwapsTab
                swaps={plan.sustainableSwaps}
                checkedIds={checkedSwapIds}
                onToggleSwap={onToggleSwap}
              />
            )}
            {activeTab === 'community' && (
              <CommunityAlertTab
                alert={plan.communityAlert}
                cityName={aqiData.displayName}
                usAqi={aqiData.current.usAqi}
              />
            )}
          </div>
        )}
      </div>

      {/* Built-In Calming Visual Breathing Pacer Modal */}
      {activePacerSession && aqiData && (
        <BreathingPacerModal
          session={activePacerSession}
          usAqi={aqiData.current.usAqi}
          onClose={() => setActivePacerSession(null)}
        />
      )}
    </section>
  );
}
