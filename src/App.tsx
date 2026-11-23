import { useCallback, useEffect, useRef, useState } from 'react';
import type { FamilyProfile, LiveAqiData, LocationSelection, SmogActionPlan } from './types/vayu';
import { buildLocalSmogPlan } from './utils/localFallbackPlan';
import { Header } from './components/Header';
import { LiveTelemetryBar } from './components/LiveTelemetryBar';
import { FamilyProfilePanel } from './components/FamilyProfilePanel';
import { ActionPlanWorkspace } from './components/ActionPlanWorkspace';

const DEFAULT_CITY = 'Kanpur, Uttar Pradesh';
const PLAN_CACHE_PREFIX = 'vayumitra_plan_v1::';
const COOLDOWN_MS = 3000;
const RETRY_DELAY_MS = 4000;

const DEFAULT_PROFILE: FamilyProfile = {
  members: ['Healthy Adults', 'Children', 'Elderly Parents'],
  commute: 'Two-Wheeler (Bike/Scooter)',
  homeSetup: 'No Air Purifier (Budget/Natural hacks needed)',
  language: 'English',
};

function buildPlanCacheKey(aqi: LiveAqiData | null, profile: FamilyProfile): string {
  const city = (aqi?.displayName || aqi?.query || '').trim().toLowerCase();
  const usAqi = aqi?.current.usAqi ?? 0;
  const household = [...profile.members].sort().join(',');
  return `${PLAN_CACHE_PREFIX}${city}|${usAqi}|${household}|${profile.commute}|${profile.homeSetup}|${profile.language}`;
}

function readCachedPlan(cacheKey: string): SmogActionPlan | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SmogActionPlan;
    if (parsed && Array.isArray(parsed.dailyRoutine) && parsed.healthYoga && parsed.trainYoga) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedPlan(cacheKey: string, plan: SmogActionPlan): void {
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(plan));
  } catch {
    // Ignore storage quota or restricted-mode errors
  }
}

export default function App() {
  const [cityInput, setCityInput] = useState<string>(DEFAULT_CITY);
  const [aqiData, setAqiData] = useState<LiveAqiData | null>(null);
  const [isLoadingAqi, setIsLoadingAqi] = useState<boolean>(true);
  const [aqiError, setAqiError] = useState<string | null>(null);

  const [profile, setProfile] = useState<FamilyProfile>(DEFAULT_PROFILE);

  const [plan, setPlan] = useState<SmogActionPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<boolean>(false);
  const [isCooldownActive, setIsCooldownActive] = useState<boolean>(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [lastPlanFingerprint, setLastPlanFingerprint] = useState<string>('');
  const [checkedSwapIds, setCheckedSwapIds] = useState<Record<string, boolean>>({});
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState<boolean>(false);

  const inFlightRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  const applyResolvedPlan = useCallback(
    (resolvedPlan: SmogActionPlan, cacheKey: string) => {
      setPlan(resolvedPlan);
      setLastPlanFingerprint(cacheKey);
      writeCachedPlan(cacheKey, resolvedPlan);

      const initialChecked: Record<string, boolean> = {};
      if (resolvedPlan.sustainableSwaps?.[0]?.id) {
        initialChecked[resolvedPlan.sustainableSwaps[0].id] = true;
      }
      setCheckedSwapIds(initialChecked);
    },
    []
  );

  const generateSmogPlan = useCallback(
    async (targetAqi: LiveAqiData, targetProfile: FamilyProfile) => {
      if (inFlightRef.current) return;

      const cacheKey = buildPlanCacheKey(targetAqi, targetProfile);

      // Instant 0ms sessionStorage cache hit for identical inputs
      const cachedPlan = readCachedPlan(cacheKey);
      if (cachedPlan) {
        setPlanError(null);
        setGenerationStatus(null);
        applyResolvedPlan(cachedPlan, cacheKey);
        return;
      }

      inFlightRef.current = true;
      setIsGeneratingPlan(true);
      setIsCooldownActive(true);
      setGenerationStatus('Analyzing Live AQI & Profile...');
      setPlanError(null);

      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
      cooldownTimerRef.current = window.setTimeout(() => {
        setIsCooldownActive(false);
        cooldownTimerRef.current = null;
      }, COOLDOWN_MS);

      try {
        const sendRequest = async (isRetry: boolean) =>
          fetch('/api/smog-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aqiData: targetAqi,
              profile: targetProfile,
              isRetry,
            }),
          });

        let res = await sendRequest(false);

        // Automatic single retry after 4-second delay on HTTP 429 rate-limit
        if (res.status === 429) {
          setGenerationStatus('Optimizing air quality analysis...');
          await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
          res = await sendRequest(true);
        }

        if (res.status === 429) {
          const fallbackPlan = buildLocalSmogPlan(targetAqi, targetProfile);
          applyResolvedPlan(fallbackPlan, cacheKey);
          return;
        }

        const body = (await res.json()) as SmogActionPlan & { error?: string };
        if (!res.ok) {
          throw new Error(body.error || `Plan generation failed (HTTP ${res.status})`);
        }

        applyResolvedPlan(body, cacheKey);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to generate your personalized smog action plan.';
        if (
          message.includes('429') ||
          message.toLowerCase().includes('rate limit') ||
          message.toLowerCase().includes('quota')
        ) {
          const fallbackPlan = buildLocalSmogPlan(targetAqi, targetProfile);
          applyResolvedPlan(fallbackPlan, cacheKey);
        } else {
          setPlanError(message);
        }
      } finally {
        inFlightRef.current = false;
        setIsGeneratingPlan(false);
        setGenerationStatus(null);
      }
    },
    [applyResolvedPlan]
  );

  const fetchLiveAqi = useCallback(
    async (query: string, exactLocation?: LocationSelection) => {
      setIsLoadingAqi(true);
      setAqiError(null);

      try {
        const params = new URLSearchParams();
        params.set('city', query);
        if (exactLocation) {
          params.set('lat', String(exactLocation.latitude));
          params.set('lon', String(exactLocation.longitude));
          params.set('displayName', exactLocation.displayName);
          if (exactLocation.admin1) params.set('admin1', exactLocation.admin1);
          if (exactLocation.country) params.set('country', exactLocation.country);
        }

        const res = await fetch(`/api/aqi?${params.toString()}`);
        const body = (await res.json()) as LiveAqiData & { error?: string };
        if (!res.ok) {
          throw new Error(body.error || `Failed to fetch live AQI (HTTP ${res.status})`);
        }
        setAqiData(body);
      } catch (err) {
        setAqiError(
          err instanceof Error ? err.message : 'Unable to reach Open-Meteo Air Quality API.'
        );
      } finally {
        setIsLoadingAqi(false);
      }
    },
    []
  );

  // Fetch only free Open-Meteo AQI on page load (never auto-call Gemini)
  useEffect(() => {
    fetchLiveAqi(DEFAULT_CITY);
  }, [fetchLiveAqi]);

  const handleGenerateClick = () => {
    if (!aqiData || isGeneratingPlan || isCooldownActive) return;
    const planSection = document.getElementById('action-plan');
    if (planSection && window.innerWidth < 1024) {
      planSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    generateSmogPlan(aqiData, profile);
  };

  const handleToggleSwap = (id: string) => {
    setCheckedSwapIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const hasUnsavedChanges =
    Boolean(plan) && buildPlanCacheKey(aqiData, profile) !== lastPlanFingerprint;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Header
        onGeneratePlan={handleGenerateClick}
        isGenerating={isGeneratingPlan || isCooldownActive}
        canGenerate={Boolean(aqiData) && !isLoadingAqi}
      />

      <LiveTelemetryBar
        cityInput={cityInput}
        onCityInputChange={setCityInput}
        onFetchCity={(q, loc) => fetchLiveAqi(q, loc)}
        aqiData={aqiData}
        isLoading={isLoadingAqi}
        error={aqiError}
      />

      <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <FamilyProfilePanel
              profile={profile}
              onProfileChange={setProfile}
              onGeneratePlan={handleGenerateClick}
              isGenerating={isGeneratingPlan}
              isCooldownActive={isCooldownActive}
              generationStatus={generationStatus}
              canGenerate={Boolean(aqiData) && !isLoadingAqi}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          </div>

          <div className="lg:col-span-8">
            <ActionPlanWorkspace
              aqiData={aqiData}
              profile={profile}
              plan={plan}
              isGenerating={isGeneratingPlan}
              isCooldownActive={isCooldownActive}
              generationStatus={generationStatus}
              error={planError}
              checkedSwapIds={checkedSwapIds}
              onToggleSwap={handleToggleSwap}
              onGeneratePlan={handleGenerateClick}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            VayuMitra AI — Urban Air Quality &amp; Smog Assistant. Live readings sourced from Open-Meteo Atmospheric &amp; Air Quality APIs.
          </p>
          <p className="text-slate-400">
            Health guidance is informational; consult a physician for acute respiratory symptoms.
          </p>
        </div>
      </footer>
    </div>
  );
}
