import { FormEvent, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wind,
} from 'lucide-react';
import type { LiveAqiData, LocationSelection } from '../types/vayu';
import { formatObservedTime, getAqiCategory, getWhoPm25Multiple } from '../utils/aqi';
import { DispersionChart } from './DispersionChart';
import { LocationSearchInput } from './LocationSearchInput';
import { LocationMiniMap } from './LocationMiniMap';

const QUICK_CITIES = [
  { label: 'Kanpur', query: 'Kanpur, Uttar Pradesh' },
  { label: 'Delhi NCR', query: 'Delhi NCR' },
  { label: 'Lucknow', query: 'Lucknow, Uttar Pradesh' },
  { label: 'Gurugram', query: 'Gurugram, Haryana' },
  { label: 'Patna', query: 'Patna, Bihar' },
];

interface LiveTelemetryBarProps {
  cityInput: string;
  onCityInputChange: (val: string) => void;
  onFetchCity: (cityQuery: string, exactLocation?: LocationSelection) => void;
  aqiData: LiveAqiData | null;
  isLoading: boolean;
  error: string | null;
}

export function LiveTelemetryBar({
  cityInput,
  onCityInputChange,
  onFetchCity,
  aqiData,
  isLoading,
  error,
}: LiveTelemetryBarProps) {
  const [showChart, setShowChart] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<LocationSelection | null>(null);
  const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = cityInput.trim();
    if (!trimmed) return;

    setIsMiniMapOpen(true);
    if (
      selectedLocation &&
      selectedLocation.displayName.toLowerCase() === trimmed.toLowerCase()
    ) {
      onFetchCity(trimmed, selectedLocation);
    } else {
      onFetchCity(trimmed);
    }
  };

  const handleInputChange = (nextVal: string) => {
    onCityInputChange(nextVal);
    if (
      selectedLocation &&
      selectedLocation.displayName.toLowerCase() !== nextVal.trim().toLowerCase()
    ) {
      setSelectedLocation(null);
    }
  };

  const handleSelectSuggestion = (loc: LocationSelection) => {
    setSelectedLocation(loc);
    setIsMiniMapOpen(true);
    onFetchCity(loc.displayName, loc);
  };

  const handleMiniMapPinAdjust = (lat: number, lng: number) => {
    const baseName = selectedLocation?.name ?? aqiData?.displayName ?? cityInput.trim();
    const adjusted: LocationSelection = {
      name: baseName,
      displayName: `${baseName} (Pinned)`,
      admin1: selectedLocation?.admin1 ?? aqiData?.admin1,
      country: selectedLocation?.country ?? aqiData?.country,
      latitude: lat,
      longitude: lng,
      isLandmark: true,
    };
    setSelectedLocation(adjusted);
    onCityInputChange(adjusted.displayName);
    onFetchCity(adjusted.displayName, adjusted);
  };

  const previewLocation: LocationSelection | null =
    selectedLocation ??
    (aqiData
      ? {
          name: aqiData.displayName,
          displayName: aqiData.displayName,
          admin1: aqiData.admin1,
          country: aqiData.country,
          latitude: aqiData.latitude,
          longitude: aqiData.longitude,
        }
      : null);

  const category = aqiData ? getAqiCategory(aqiData.current.usAqi) : null;
  const aqiPercent = aqiData ? Math.min((aqiData.current.usAqi / 400) * 100, 100) : 0;

  const renderSeverityIcon = (level: string) => {
    if (level === 'good') return <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />;
    if (level === 'moderate' || level === 'sensitive') {
      return <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />;
    }
    return <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />;
  };

  return (
    <section
      id="live-telemetry"
      aria-label="Live location and air quality telemetry"
      className="bg-slate-900 text-slate-100 border-b border-slate-800"
    >
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Row: Context Headline + Location Search Form */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-emerald-400 tracking-wide">
              Urban Air Quality &amp; Winter Smog Telemetry
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Navigate winter smog with live locality telemetry
            </h1>
            <p className="mt-1.5 text-sm text-slate-300 leading-relaxed tracking-[0.01em]">
              Live PM2.5, PM10, and US AQI monitoring powered by Open-Meteo atmospheric models, paired with tailored family protection routines.
            </p>
          </div>

          <div className="w-full lg:w-auto lg:min-w-[460px]">
            <form
              onSubmit={handleSubmit}
              className="w-full flex flex-col sm:flex-row gap-2.5"
            >
              <label htmlFor="city-search-input" className="sr-only">
                City or Locality
              </label>
              <LocationSearchInput
                value={cityInput}
                onChange={handleInputChange}
                onSelectLocation={handleSelectSuggestion}
              />
              <button
                type="submit"
                disabled={isLoading || !cityInput.trim()}
                className="h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 rounded-lg transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <RefreshCw
                  className={`w-4 h-4 shrink-0 ${isLoading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{isLoading ? 'Fetching...' : 'Fetch Live AQI'}</span>
              </button>
            </form>

            {isMiniMapOpen && previewLocation && (
              <LocationMiniMap
                location={previewLocation}
                onPinCoordinateClick={handleMiniMapPinAdjust}
                onClose={() => setIsMiniMapOpen(false)}
              />
            )}
          </div>
        </div>

        {/* Quick-Select Cities Interactive Filter Bar + Forecast Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick-select cities">
            <span className="text-xs text-slate-400 mr-1">Quick select:</span>
            {QUICK_CITIES.map((city) => {
              const isSelected =
                aqiData?.query.toLowerCase() === city.query.toLowerCase() ||
                cityInput.trim().toLowerCase() === city.query.toLowerCase() ||
                cityInput.trim().toLowerCase() === city.label.toLowerCase();
              return (
                <button
                  key={city.label}
                  type="button"
                  onClick={() => {
                    setSelectedLocation(null);
                    setIsMiniMapOpen(true);
                    onCityInputChange(city.query);
                    onFetchCity(city.query);
                  }}
                  disabled={isLoading}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    isSelected
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/50'
                      : 'bg-slate-800/80 text-slate-300 border border-slate-700/80 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {city.label}
                </button>
              );
            })}
          </div>

          {aqiData && (
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setIsMiniMapOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 font-mono tabular-nums hover:text-emerald-300 transition-colors cursor-pointer"
                title={isMiniMapOpen ? 'Hide coordinate mini-map' : 'Show coordinate mini-map'}
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  {aqiData.displayName} ({aqiData.latitude.toFixed(2)}°N, {aqiData.longitude.toFixed(2)}°E)
                </span>
              </button>
              <span aria-hidden="true" className="text-slate-700 hidden sm:inline">·</span>
              <span className="hidden sm:inline font-mono tabular-nums">
                {formatObservedTime(aqiData.observedAt)}
              </span>
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-sm"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => onFetchCity(cityInput.trim() || 'Kanpur, Uttar Pradesh')}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-600 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              Retry Fetch
            </button>
          </div>
        )}

        {/* Loading Skeleton Strip */}
        {isLoading && !aqiData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-800 rounded-xl overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-slate-800 bg-slate-950/50">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="p-5 space-y-3 animate-pulse">
                <div className="h-3 w-24 bg-slate-800 rounded" />
                <div className="h-9 w-28 bg-slate-800 rounded" />
                <div className="h-3 w-40 bg-slate-800/80 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* 4-Column Live Telemetry Strip */}
        {aqiData && category && (
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
        )}
      </div>
    </section>
  );
}
