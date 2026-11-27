import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FamilyProfile,
  LiveAqiData,
  LocationSelection,
  SmogActionPlan,
} from '../types/vayu';
import {
  buildSmogPlanCacheKey,
  INDIVIDUAL_SOLO_MEMBER,
} from '../utils/exposureCalculator';
import {
  applyThemeToDocument,
  getNextTheme,
  persistTheme,
  resolveInitialTheme,
  type ThemeMode,
} from '../utils/theme';
import {
  fetchLiveAqiTelemetry,
  requestSmogActionPlan,
} from '../services/vayuApiService';

const DEFAULT_CITY = 'Kanpur, Uttar Pradesh';
const COOLDOWN_MS = 3000;

const DEFAULT_PROFILE: FamilyProfile = {
  members: [INDIVIDUAL_SOLO_MEMBER],
  commute: 'Two-Wheeler (Bike/Scooter)',
  homeSetup: 'No Air Purifier (Budget/Natural hacks needed)',
  language: 'English',
  cigarettesSmokedToday: 0,
};

/** Public state and actions exposed by {@link useVayuMitraController}. */
export interface VayuMitraControllerState {
  cityInput: string;
  setCityInput: (next: string) => void;
  aqiData: LiveAqiData | null;
  isLoadingAqi: boolean;
  aqiError: string | null;
  profile: FamilyProfile;
  setProfile: (next: FamilyProfile) => void;
  plan: SmogActionPlan | null;
  isGeneratingPlan: boolean;
  isCooldownActive: boolean;
  generationStatus: string | null;
  planError: string | null;
  checkedSwapIds: Record<string, boolean>;
  mapsQuotaExceeded: boolean;
  theme: ThemeMode;
  isLiveVoiceOpen: boolean;
  setIsLiveVoiceOpen: (open: boolean) => void;
  hasUnsavedChanges: boolean;
  handleToggleTheme: () => void;
  handleFetchCity: (query: string, exactLocation?: LocationSelection) => Promise<void>;
  handleGeneratePlan: () => void;
  handleToggleSwap: (id: string) => void;
}

/**
 * Central application controller hook managing live Open-Meteo AQI telemetry
 * (with AbortController request cancellation), household profile state,
 * cached Gemini smog action plan generation, cooldown gating, and theme persistence.
 */
export function useVayuMitraController(): VayuMitraControllerState {
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
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme());
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState<boolean>(false);

  const inFlightPlanRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<number | null>(null);
  const aqiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = getNextTheme(prev);
      persistTheme(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
      aqiAbortRef.current?.abort();
    };
  }, []);

  const applyResolvedPlan = useCallback(
    (resolvedPlan: SmogActionPlan, cacheKey: string) => {
      setPlan(resolvedPlan);
      setLastPlanFingerprint(cacheKey);

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
      if (inFlightPlanRef.current) return;

      inFlightPlanRef.current = true;
      setPlanError(null);

      let startedNetworkRequest = false;
      try {
        const result = await requestSmogActionPlan(targetAqi, targetProfile, {
          onStatusChange: (statusText) => {
            if (!startedNetworkRequest) {
              startedNetworkRequest = true;
              setIsGeneratingPlan(true);
              setIsCooldownActive(true);
              if (cooldownTimerRef.current !== null) {
                window.clearTimeout(cooldownTimerRef.current);
              }
              cooldownTimerRef.current = window.setTimeout(() => {
                setIsCooldownActive(false);
                cooldownTimerRef.current = null;
              }, COOLDOWN_MS);
            }
            setGenerationStatus(statusText);
          },
        });

        applyResolvedPlan(result.plan, result.cacheKey);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to generate your personalized smog action plan.';
        setPlanError(message);
      } finally {
        inFlightPlanRef.current = false;
        setIsGeneratingPlan(false);
        setGenerationStatus(null);
      }
    },
    [applyResolvedPlan]
  );

  const handleFetchCity = useCallback(
    async (query: string, exactLocation?: LocationSelection) => {
      aqiAbortRef.current?.abort();
      const controller = new AbortController();
      aqiAbortRef.current = controller;

      setIsLoadingAqi(true);
      setAqiError(null);

      try {
        const telemetry = await fetchLiveAqiTelemetry(
          query,
          exactLocation,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setAqiData(telemetry);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setAqiError(
          err instanceof Error
            ? err.message
            : 'Unable to reach Open-Meteo Air Quality API.'
        );
      } finally {
        if (aqiAbortRef.current === controller) {
          setIsLoadingAqi(false);
        }
      }
    },
    []
  );

  // Fetch only free Open-Meteo AQI on page load (never auto-call Gemini)
  useEffect(() => {
    void handleFetchCity(DEFAULT_CITY);
  }, [handleFetchCity]);

  const handleGeneratePlan = useCallback(() => {
    if (!aqiData || isGeneratingPlan || isCooldownActive) return;
    const planSection = document.getElementById('action-plan');
    if (planSection && window.innerWidth < 1024) {
      planSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    void generateSmogPlan(aqiData, profile);
  }, [aqiData, generateSmogPlan, isCooldownActive, isGeneratingPlan, profile]);

  const handleToggleSwap = useCallback((id: string) => {
    setCheckedSwapIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const hasUnsavedChanges = useMemo(
    () => Boolean(plan) && buildSmogPlanCacheKey(aqiData, profile) !== lastPlanFingerprint,
    [aqiData, lastPlanFingerprint, plan, profile]
  );

  return {
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
  };
}
