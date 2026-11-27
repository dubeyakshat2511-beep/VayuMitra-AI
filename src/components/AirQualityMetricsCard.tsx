import { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Wind,
} from 'lucide-react';
import type { LiveAqiData } from '../types/vayu';
import { getAqiCategory, getWhoPm25Multiple, type AqiCategoryMeta } from '../utils/aqi';
import { DispersionChart } from './DispersionChart';

/** Props accepted by {@link AirQualityMetricsCard}. */
export interface AirQualityMetricsCardProps {
  /** Live atmospheric and air quality telemetry payload from Open-Meteo. */
  aqiData: LiveAqiData;
}

function renderSeverityIcon(level: AqiCategoryMeta['level']) {
  if (level === 'good') return <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />;
  if (level === 'moderate' || level === 'sensitive') {
    return <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
  return <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />;
}

/**
 * Displays the 4-column real-time air quality telemetry strip (US AQI, PM2.5,
 * PM10/gases, and computed Safe Outdoor Window) paired with the collapsible
 * 24-hour winter inversion dispersion curve.
 */
export function AirQualityMetricsCard({ aqiData }: AirQualityMetricsCardProps) {
  const [showChart, setShowChart] = useState(true);
  const category = getAqiCategory(aqiData.current.usAqi);
  const aqiPercent = Math.min((aqiData.current.usAqi / 400) * 100, 100);

  return (
    <div className="border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        {/* Metric 1: Live US AQI */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Live US AQI</span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${category.darkTextClass}`}
            >
              {renderSeverityIcon(category.level)}
              <span>{category.shortLabel}</span>
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-mono font-semibold text-white tabular-nums leading-none">
                {aqiData.current.usAqi}
              </span>
              <span className="text-xs font-mono text-slate-400">US EPA</span>
            </div>
            {/* Calibrated AQI Scale Bar */}
            <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${category.barColor}`}
                style={{ width: `${Math.max(aqiPercent, 4)}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {category.label} · {category.healthNote}
          </p>
        </div>

        {/* Metric 2: PM2.5 */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Fine Particulate (PM2.5)</span>
            <Wind className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          </div>

          <div className="flex items-baseline">
            <span className="text-4xl font-mono font-semibold text-white tabular-nums leading-none">
              {aqiData.current.pm25.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-slate-400 ml-1.5">µg/m³</span>
          </div>

          <p className="text-xs text-amber-300/90 font-mono tabular-nums">
            {getWhoPm25Multiple(aqiData.current.pm25)}
          </p>
        </div>

        {/* Metric 3: PM10 */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <span className="text-xs font-medium text-slate-400">Coarse Dust &amp; Smoke (PM10)</span>

          <div className="flex items-baseline">
            <span className="text-4xl font-mono font-semibold text-white tabular-nums leading-none">
              {aqiData.current.pm10.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-slate-400 ml-1.5">µg/m³</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>
              NO₂ {aqiData.current.no2 !== null ? `${aqiData.current.no2} µg/m³` : '—'}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>
              O₃ {aqiData.current.ozone !== null ? `${aqiData.current.ozone} µg/m³` : '—'}
            </span>
          </div>
        </div>

        {/* Metric 4: Safe Outdoor Window */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Safe Outdoor Window</span>
            <Clock className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          </div>

          <div>
            <p className="text-xl font-mono font-semibold text-emerald-300 tabular-nums leading-tight">
              {aqiData.safeWindow.windowLabel}
            </p>
            <p className="mt-1 text-xs font-mono tabular-nums text-slate-300">
              Est. AQI {aqiData.safeWindow.avgAqi} · PM2.5 {aqiData.safeWindow.avgPm25} µg/m³
            </p>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {aqiData.safeWindow.advisory}
          </p>
        </div>
      </div>

      {/* Expandable 24-Hour Dispersion Curve */}
      <div className="px-5 pb-5 bg-slate-950/30">
        {showChart ? (
          <DispersionChart
            hourly={aqiData.hourly}
            safeWindow={aqiData.safeWindow}
            cityName={aqiData.displayName}
          />
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowChart((prev) => !prev)}
            className="text-xs font-medium text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer"
          >
            {showChart ? 'Hide 24-hour dispersion curve' : 'Show 24-hour dispersion curve'}
          </button>
        </div>
      </div>
    </div>
  );
}
