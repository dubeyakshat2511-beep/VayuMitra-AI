import { lazy, Suspense } from 'react';
import { useVayuMitraController } from './hooks/useVayuMitraController';
import { MapsQuotaBanner } from './components/MapsQuotaBanner';
import { HeaderNav } from './components/HeaderNav';
import { LiveTelemetryBar } from './components/LiveTelemetryBar';
import { Pm25AlertMonitor } from './components/Pm25AlertMonitor';
import { FamilyProfilePanel } from './components/FamilyProfilePanel';
import { FogRoadSafetyCard } from './components/FogRoadSafetyCard';
import { ActionPlanSection } from './components/ActionPlanSection';
import { AppFooter } from './components/AppFooter';

const LiveVoiceAssistantModal = lazy(() =>
  import('./components/LiveVoiceAssistantModal').then((mod) => ({
    default: mod.LiveVoiceAssistantModal,
  }))
);

/**
 * Declarative root application shell for VayuMitra AI.
 * Delegates state orchestration to {@link useVayuMitraController} and composes
 * single-responsibility telemetry, road-safety, profile, action-plan, and voice views.
 */
export default function App() {
  const {
    cityInput,
    setCityInput,
    aqiData,
    isLoadingAqi,
    aqiError,
    profile,
    setProfile,
    plan,
    isGeneratingPlan,
    isCooldownActive,
    generationStatus,
    planError,
    checkedSwapIds,
    mapsQuotaExceeded,
    theme,
    isLiveVoiceOpen,
    setIsLiveVoiceOpen,
    hasUnsavedChanges,
    handleToggleTheme,
    handleFetchCity,
    handleGeneratePlan,
    handleToggleSwap,
  } = useVayuMitraController();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-emerald-600 focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      <MapsQuotaBanner visible={mapsQuotaExceeded} />

      <HeaderNav
        onGeneratePlan={handleGeneratePlan}
        onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
        isGenerating={isGeneratingPlan || isCooldownActive}
        canGenerate={Boolean(aqiData) && !isLoadingAqi}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <LiveTelemetryBar
        cityInput={cityInput}
        onCityInputChange={setCityInput}
        onFetchCity={(query, location) => {
          void handleFetchCity(query, location);
        }}
        aqiData={aqiData}
        isLoading={isLoadingAqi}
        error={aqiError}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 focus:outline-none"
      >
        <Pm25AlertMonitor aqiData={aqiData} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <FamilyProfilePanel
              profile={profile}
              onProfileChange={setProfile}
              onGeneratePlan={handleGeneratePlan}
              isGenerating={isGeneratingPlan}
              isCooldownActive={isCooldownActive}
              generationStatus={generationStatus}
              canGenerate={Boolean(aqiData) && !isLoadingAqi}
              hasUnsavedChanges={hasUnsavedChanges}
              ambientPm25={aqiData?.current.pm25 ?? null}
              ambientAqi={aqiData?.current.usAqi ?? null}
            />
          </div>

          <div className="lg:col-span-8">
            <FogRoadSafetyCard
              aqiData={aqiData}
              profile={profile}
              roadSafetyAdvice={plan?.roadSafetyAdvice ?? null}
            />

            <ActionPlanSection
              aqiData={aqiData}
              profile={profile}
              plan={plan}
              isGenerating={isGeneratingPlan}
              isCooldownActive={isCooldownActive}
              generationStatus={generationStatus}
              error={planError}
              checkedSwapIds={checkedSwapIds}
              onToggleSwap={handleToggleSwap}
              onGeneratePlan={handleGeneratePlan}
              onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
            />
          </div>
        </div>
      </main>

      {isLiveVoiceOpen && (
        <Suspense fallback={null}>
          <LiveVoiceAssistantModal
            isOpen={isLiveVoiceOpen}
            onClose={() => setIsLiveVoiceOpen(false)}
            aqiData={aqiData}
            profile={profile}
            plan={plan}
          />
        </Suspense>
      )}

      <AppFooter />
    </div>
  );
}
