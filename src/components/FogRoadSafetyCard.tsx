import { AlertTriangle, CloudFog, Gauge, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { FamilyProfile, LiveAqiData, RoadSafetyAdvice } from '../types/vayu';
import {
  buildFallbackWeatherSnapshot,
  calculateFogHazard,
  type FogSeverityTier,
} from '../utils/fogHazardCalculator';

/** Props accepted by {@link FogRoadSafetyCard}. */
export interface FogRoadSafetyCardProps {
  /** Live Open-Meteo air quality and meteorological telemetry payload. */
  aqiData: LiveAqiData | null;
  /** Current household & commute profile used to calibrate safe speed caps. */
  profile: FamilyProfile;
  /** Optional Gemini-generated road safety advice from the active smog action plan. */
  roadSafetyAdvice?: RoadSafetyAdvice | null;
}

function getSeverityStyles(severity: FogSeverityTier): {
  badge: string;
  accent: string;
  isSevere: boolean;
} {
  if (severity === 'Zero-Visibility Smog-Fog' || severity === 'Dense Fog') {
    return {
      badge:
        'bg-red-50 dark:bg-red-950/70 text-red-900 dark:text-red-200 border-red-200 dark:border-red-800/80',
      accent: 'text-red-700 dark:text-red-300',
      isSevere: true,
    };
  }
  if (severity === 'Moderate Fog' || severity === 'Haze / Mist') {
    return {
      badge:
        'bg-amber-50 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-800/80',
      accent: 'text-amber-700 dark:text-amber-300',
      isSevere: false,
    };
  }
  return {
    badge:
      'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/80',
    accent: 'text-emerald-700 dark:text-emerald-300',
    isSevere: false,
  };
}

/**
 * Winter Fog & Pothole Commute Shield card computing live optical visibility,
 * fog severity tier, safe speed cap, stopping distance, and pothole-braking
 * risk from Open-Meteo weather + PM2.5 telemetry and user commute mode.
 */
export function FogRoadSafetyCard({
  aqiData,
  profile,
  roadSafetyAdvice = null,
}: FogRoadSafetyCardProps) {
  if (!aqiData) return null;

  const weather = aqiData.weather ?? buildFallbackWeatherSnapshot(aqiData.current.pm25);
  const assessment = calculateFogHazard({
    temperatureC: weather.temperatureC,
    dewPointC: weather.dewPointC,
    relativeHumidityPct: weather.relativeHumidityPct,
    windSpeedKmh: weather.windSpeedKmh,
    pm25: aqiData.current.pm25,
    commute: profile.commute,
    reportedVisibilityMeters: weather.reportedVisibilityMeters,
  });

  const styles = getSeverityStyles(assessment.fogSeverity);
  const checklist =
    roadSafetyAdvice?.hazardChecklist && roadSafetyAdvice.hazardChecklist.length > 0
      ? roadSafetyAdvice.hazardChecklist
      : assessment.commuterTips;
  const directive = roadSafetyAdvice?.commuteDirective || assessment.summary;

  return (
    <section
      aria-label="Winter fog and pothole commute shield"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors duration-150 mb-6"
    >
      {/* Header Row */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
            <CloudFog className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Winter Fog &amp; Pothole Commute Shield
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Calibrated for {profile.commute} · {weather.temperatureC.toFixed(1)}°C,{' '}
              {weather.relativeHumidityPct}% RH, wind {weather.windSpeedKmh.toFixed(1)} km/h
            </p>
          </div>
        </div>

        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border ${styles.badge}`}
        >
          {styles.isSevere ? (
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : assessment.fogSeverity === 'Clear' ? (
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{assessment.fogSeverity}</span>
        </span>
      </div>

      {/* 4-Metric Telemetry Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
        <div className="p-4 space-y-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Est. Visibility
          </span>
          <p className="text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {assessment.estimatedVisibilityMeters >= 1000
              ? `${(assessment.estimatedVisibilityMeters / 1000).toFixed(1)} km`
              : `${assessment.estimatedVisibilityMeters} m`}
          </p>
        </div>

        <div className="p-4 space-y-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
            <Gauge className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Safe Speed Cap</span>
          </span>
          <p className={`text-xl font-mono font-bold tabular-nums ${styles.accent}`}>
            {assessment.safeSpeedCapKmh} km/h
          </p>
        </div>

        <div className="p-4 space-y-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Pothole-Braking Risk
          </span>
          <p className={`text-xl font-mono font-bold ${styles.accent}`}>
            {assessment.potholeBrakingRisk}
          </p>
        </div>

        <div className="p-4 space-y-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Stopping / Dew Spread
          </span>
          <p className="text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {assessment.stoppingDistanceMeters} m{' '}
            <span className="text-xs font-normal text-slate-600 dark:text-slate-300">
              · Δ{assessment.dewPointSpreadC}°C
            </span>
          </p>
        </div>
      </div>

      {/* Commute Directive & Defensive Checklist */}
      <div className="p-5 space-y-3" aria-live="polite">
        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
          {directive}
        </p>

        <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
          {checklist.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-2 leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 shrink-0"
              />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
