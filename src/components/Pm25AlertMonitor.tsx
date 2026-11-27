import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { LiveAqiData } from '../types/vayu';
import {
  dispatchBrowserPm25Notification,
  evaluatePm25Threshold,
  getBrowserNotificationPermission,
  loadPm25AlertPrefs,
  PM25_THRESHOLD_PRESETS,
  savePm25AlertPrefs,
  type NotificationPermissionState,
} from '../utils/pm25Notifications';

/** Props accepted by {@link Pm25AlertMonitor}. */
export interface Pm25AlertMonitorProps {
  /** Live air quality telemetry evaluated against the user's PM2.5 alert threshold. */
  aqiData: LiveAqiData | null;
}

/**
 * Interactive PM2.5 threshold monitor providing quick-select limits, Browser
 * Notification API opt-in, and dismissible high-particulate warning banners.
 */
export function Pm25AlertMonitor({ aqiData }: Pm25AlertMonitorProps) {
  const [prefs, setPrefs] = useState(() => loadPm25AlertPrefs());
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getBrowserNotificationPermission()
  );
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [lastDesktopStatus, setLastDesktopStatus] = useState<string | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState<boolean>(false);

  const lastNotifiedKeyRef = useRef<string | null>(null);

  const evaluation = useMemo(
    () => evaluatePm25Threshold(aqiData, prefs.threshold),
    [aqiData, prefs.threshold]
  );

  useEffect(() => {
    savePm25AlertPrefs(prefs);
  }, [prefs]);

  // Trigger browser Notification API automatically when PM2.5 exceeds threshold and permission is granted
  useEffect(() => {
    if (!aqiData || !prefs.enabled || !evaluation.isExceeded) {
      return;
    }

    const currentPerm = getBrowserNotificationPermission();
    setPermission(currentPerm);

    if (currentPerm !== 'granted') {
      return;
    }

    if (lastNotifiedKeyRef.current === evaluation.dedupeKey) {
      return;
    }

    const result = dispatchBrowserPm25Notification(aqiData, prefs.threshold);
    lastNotifiedKeyRef.current = evaluation.dedupeKey;
    if (result.dispatched) {
      setLastDesktopStatus(
        `Desktop alert sent for ${aqiData.displayName} (${aqiData.current.pm25.toFixed(1)} µg/m³)`
      );
    } else if (result.error) {
      setLastDesktopStatus('In-app alert active (browser notification blocked by host context).');
    }
  }, [aqiData, evaluation.dedupeKey, evaluation.isExceeded, prefs.enabled, prefs.threshold]);

  const handleRequestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }

    setIsRequestingPermission(true);
    try {
      const nextPerm = await window.Notification.requestPermission();
      const normalized: NotificationPermissionState =
        nextPerm === 'granted' || nextPerm === 'denied' || nextPerm === 'default'
          ? nextPerm
          : 'unsupported';
      setPermission(normalized);

      if (normalized === 'granted') {
        setPrefs((prev) => ({ ...prev, enabled: true }));
        // If current local PM2.5 already exceeds the threshold, dispatch immediately
        if (aqiData && evaluation.isExceeded) {
          const result = dispatchBrowserPm25Notification(aqiData, prefs.threshold);
          lastNotifiedKeyRef.current = evaluation.dedupeKey;
          if (result.dispatched) {
            setLastDesktopStatus(
              `Desktop alert sent for ${aqiData.displayName} (${aqiData.current.pm25.toFixed(1)} µg/m³)`
            );
          }
        } else {
          setLastDesktopStatus('Browser notifications enabled. You will be alerted above your threshold.');
        }
      }
    } catch {
      setLastDesktopStatus('Browser notification prompt was blocked in this window.');
    } finally {
      setIsRequestingPermission(false);
    }
  }, [aqiData, evaluation.dedupeKey, evaluation.isExceeded, prefs.threshold]);

  const handleToggleEnabled = () => {
    setPrefs((prev) => {
      const nextEnabled = !prev.enabled;
      if (!nextEnabled) {
        setLastDesktopStatus(null);
      }
      return { ...prev, enabled: nextEnabled };
    });
  };

  const handleThresholdSelect = (threshold: number) => {
    setDismissedKey(null);
    setPrefs((prev) => ({ ...prev, threshold }));
  };

  const handleTestNotification = () => {
    if (!aqiData) return;
    const result = dispatchBrowserPm25Notification(aqiData, prefs.threshold);
    if (result.dispatched) {
      setLastDesktopStatus(`Test browser notification sent for ${aqiData.displayName}.`);
    } else if (result.reason === 'permission-not-granted') {
      setLastDesktopStatus('Grant browser notification permission first to send desktop alerts.');
    } else {
      setLastDesktopStatus('Browser Notification API is unavailable in this preview frame; in-app alerts remain active.');
    }
  };

  const showTriggeredBanner =
    Boolean(aqiData) &&
    prefs.enabled &&
    evaluation.isExceeded &&
    dismissedKey !== evaluation.dedupeKey;

  const isCritical = evaluation.severity === 'critical';

  return (
    <section
      aria-label="PM2.5 threshold notification monitor"
      className="mb-6 space-y-3"
    >
      {/* Compact Threshold & Browser Notification Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors duration-150">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              evaluation.isExceeded && prefs.enabled
                ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/80'
                : prefs.enabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {evaluation.isExceeded && prefs.enabled ? (
              <BellRing className="w-4 h-4" aria-hidden="true" />
            ) : prefs.enabled ? (
              <Bell className="w-4 h-4" aria-hidden="true" />
            ) : (
              <BellOff className="w-4 h-4" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                PM2.5 Threshold Alerts
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                Trigger &gt; {prefs.threshold} µg/m³
              </span>
              {aqiData && (
                <span
                  className={`text-xs font-mono tabular-nums font-medium ${
                    evaluation.isExceeded
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  · Live: {aqiData.current.pm25.toFixed(1)} µg/m³
                </span>
              )}
            </div>
            {lastDesktopStatus && (
              <p role="status" aria-live="polite" className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                {lastDesktopStatus}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Threshold Preset Selector */}
          <div
            role="group"
            aria-label="PM2.5 alert threshold"
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          >
            {PM25_THRESHOLD_PRESETS.map((preset) => {
              const active = prefs.threshold === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Set PM2.5 alert threshold to ${preset} micrograms per cubic meter`}
                  onClick={() => handleThresholdSelect(preset)}
                  className={`px-2 py-1 text-[11px] font-mono font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  &gt;{preset}
                </button>
              );
            })}
          </div>

          {/* Browser Notification Permission Action / Status */}
          {permission === 'default' && (
            <button
              type="button"
              onClick={handleRequestPermission}
              disabled={isRequestingPermission}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{isRequestingPermission ? 'Requesting...' : 'Enable Browser Alerts'}</span>
            </button>
          )}

          {permission === 'granted' && (
            <>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Browser Alerts Ready</span>
              </span>
              {aqiData && (
                <button
                  type="button"
                  onClick={handleTestNotification}
                  className="h-8 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Test Alert
                </button>
              )}
            </>
          )}

          {permission === 'denied' && (
            <span className="text-xs font-medium text-amber-800 dark:text-amber-300 whitespace-nowrap">
              Desktop notifications blocked · In-app active
            </span>
          )}

          {permission === 'unsupported' && (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
              In-app alerts active
            </span>
          )}

          {/* Master Alert Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={prefs.enabled}
            aria-label="Toggle PM2.5 threshold alerts"
            onClick={handleToggleEnabled}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md px-1 py-0.5"
          >
            <span>{prefs.enabled ? 'On' : 'Paused'}</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150 ${
                prefs.enabled
                  ? 'bg-emerald-600'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                  prefs.enabled ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Triggered High-PM2.5 Alert Banner */}
      {showTriggeredBanner && aqiData && (
        <div
          role="alert"
          aria-live="assertive"
          className={`rounded-xl border px-4 py-3.5 sm:px-5 sm:py-4 transition-colors duration-150 ${
            isCritical
              ? 'bg-red-50 dark:bg-red-950/70 border-red-300 dark:border-red-800 text-red-950 dark:text-red-100'
              : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {isCritical ? (
                <ShieldAlert
                  className="w-5 h-5 text-red-700 dark:text-red-300 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="w-5 h-5 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              )}

              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h2 className="text-sm font-bold tracking-tight">
                    {isCritical ? 'Severe PM2.5 Spike Detected' : 'High PM2.5 Threshold Exceeded'} —{' '}
                    {aqiData.displayName}
                  </h2>
                  <span className="text-xs font-mono font-semibold tabular-nums">
                    {evaluation.pm25.toFixed(1)} µg/m³ (+{evaluation.excessAmount.toFixed(1)} over{' '}
                    {evaluation.threshold} µg/m³ limit)
                  </span>
                </div>

                <p className="text-xs sm:text-sm leading-relaxed opacity-95">
                  Live US AQI is <strong className="font-mono">{aqiData.current.usAqi}</strong>.
                  Keep exterior windows and door gaps sealed, run indoor air filtration or wet-mop
                  dust, wear a fitted N95 mask if stepping out, and defer non-essential errands until{' '}
                  <strong className="font-mono">{aqiData.safeWindow.windowLabel}</strong>.
                </p>

                {permission === 'default' && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleRequestPermission}
                      className="text-xs font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer"
                    >
                      Allow desktop browser notifications for future PM2.5 spikes
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDismissedKey(evaluation.dedupeKey)}
              aria-label="Dismiss current PM2.5 alert"
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
