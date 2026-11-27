import { CheckCircle2, Cigarette, Minus, Plus, ShieldAlert } from 'lucide-react';
import {
  calculateCombinedParticulateLoad,
  clampCigaretteCount,
  MAX_CIGARETTES_PER_DAY,
  PM25_PER_CIGARETTE,
} from '../utils/exposureCalculator';

const CIGARETTE_PRESETS: {
  label: string;
  setValue: number;
  matches: (count: number) => boolean;
}[] = [
  { label: '0 (Non-Smoker)', setValue: 0, matches: (c) => c === 0 },
  { label: '1–2', setValue: 2, matches: (c) => c >= 1 && c <= 2 },
  { label: '3–5', setValue: 4, matches: (c) => c >= 3 && c <= 5 },
  { label: '6–10', setValue: 8, matches: (c) => c >= 6 && c <= 10 },
  { label: '10+', setValue: 12, matches: (c) => c > 10 },
];

/** Props accepted by {@link SmokerExposurePanel}. */
export interface SmokerExposurePanelProps {
  /** Number of cigarettes smoked today (0–40). */
  cigarettesSmokedToday: number;
  /** Callback fired whenever the cigarette count changes. */
  onChangeCigarettes: (nextCount: number) => void;
  /** Live ambient PM2.5 reading (µg/m³) for combined particulate burden calculation. */
  ambientPm25?: number | null;
  /** Live ambient US AQI for contextual badge display. */
  ambientAqi?: number | null;
}

/**
 * Self-contained "Cigarettes Smoked Today" lifestyle tracker featuring quick-select
 * range buttons, an exact 0–40 numeric stepper, and a real-time Combined Particulate
 * Load badge estimating ambient PM2.5 plus ~22 µg/m³ equivalent burden per cigarette.
 */
export function SmokerExposurePanel({
  cigarettesSmokedToday,
  onChangeCigarettes,
  ambientPm25 = null,
  ambientAqi = null,
}: SmokerExposurePanelProps) {
  const exposure = calculateCombinedParticulateLoad(ambientPm25, cigarettesSmokedToday);
  const {
    cigarettesCount,
    ambientPm25: livePm25,
    smokingEquivalentPm25: smokingPm25,
    combinedPm25Burden: combinedPm25,
    severity: combinedSeverity,
    severityLabel,
  } = exposure;

  const handleUpdate = (nextRaw: number) => {
    onChangeCigarettes(clampCigaretteCount(nextRaw));
  };

  return (
    <div className="p-5 sm:p-6 space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="cigarettes-smoked-input"
          className="text-sm font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5"
        >
          <Cigarette className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
          <span>Cigarettes Smoked Today</span>
        </label>
        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {cigarettesCount === 0 ? 'Non-Smoker' : `${cigarettesCount} / ${MAX_CIGARETTES_PER_DAY}`}
        </span>
      </div>

      {/* Quick-Select Range Buttons */}
      <div
        role="group"
        aria-label="Quick select cigarettes smoked today"
        className="flex flex-wrap gap-1.5"
      >
        {CIGARETTE_PRESETS.map((preset) => {
          const active = preset.matches(cigarettesCount);
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => handleUpdate(preset.setValue)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                active
                  ? preset.setValue === 0
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-amber-600 border-amber-600 text-white'
                  : 'bg-white dark:bg-slate-950/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Exact Numeric Stepper (0 to 40) */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-600 dark:text-slate-300">Exact count today</span>
        <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
          <button
            type="button"
            onClick={() => handleUpdate(cigarettesCount - 1)}
            disabled={cigarettesCount <= 0}
            aria-label="Decrease cigarettes smoked today"
            className="w-10 h-10 inline-flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-slate-950 transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <input
            id="cigarettes-smoked-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_CIGARETTES_PER_DAY}
            value={cigarettesCount}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              handleUpdate(Number.isNaN(parsed) ? 0 : parsed);
            }}
            aria-label="Exact number of cigarettes smoked today"
            className="w-14 h-10 text-center text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border-x border-slate-200 dark:border-slate-800 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => handleUpdate(cigarettesCount + 1)}
            disabled={cigarettesCount >= MAX_CIGARETTES_PER_DAY}
            aria-label="Increase cigarettes smoked today"
            className="w-10 h-10 inline-flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-slate-950 transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Real-Time Combined Particulate Load Badge */}
      <div
        aria-live="polite"
        className={`rounded-lg border p-3.5 space-y-2 text-xs leading-relaxed ${
          combinedSeverity === 'severe'
            ? 'bg-red-50/90 dark:bg-red-950/50 border-red-200 dark:border-red-800/80 text-red-950 dark:text-red-100'
            : combinedSeverity === 'high'
              ? 'bg-amber-50 dark:bg-amber-950/45 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
              : combinedSeverity === 'elevated'
                ? 'bg-amber-50/60 dark:bg-amber-950/35 border-amber-200/80 dark:border-amber-800/70 text-amber-950 dark:text-amber-100'
                : 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold inline-flex items-center gap-1.5">
            {cigarettesCount === 0 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert
                className={`w-3.5 h-3.5 shrink-0 ${
                  combinedSeverity === 'severe'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
                aria-hidden="true"
              />
            )}
            <span>{severityLabel}</span>
          </span>
          <span className="font-mono font-bold tabular-nums whitespace-nowrap shrink-0">
            {livePm25 !== null ? `${combinedPm25.toFixed(1)} µg/m³` : `+${smokingPm25} µg/m³`}
          </span>
        </div>

        {cigarettesCount === 0 ? (
          <p className="text-slate-600 dark:text-slate-300">
            {livePm25 !== null ? (
              <>
                Ambient city load is{' '}
                <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {livePm25.toFixed(1)} µg/m³
                </span>{' '}
                PM2.5{ambientAqi !== null ? ` (AQI ${ambientAqi})` : ''}. Each cigarette adds ~{PM25_PER_CIGARETTE} µg/m³ equivalent PM2.5 lung burden.
              </>
            ) : (
              `Standard non-smoker baseline. Each cigarette adds ~${PM25_PER_CIGARETTE} µg/m³ equivalent PM2.5 lung burden on top of ambient air.`
            )}
          </p>
        ) : (
          <div className="space-y-1">
            <p className="font-mono tabular-nums text-[11px]">
              {livePm25 !== null ? `City PM2.5 ${livePm25.toFixed(1)}` : 'City PM2.5 —'} +{' '}
              {cigarettesCount} {cigarettesCount === 1 ? 'cig' : 'cigs'} (+{smokingPm25} µg/m³) ={' '}
              <strong className="font-bold">
                {livePm25 !== null ? `${combinedPm25.toFixed(1)} µg/m³` : `+${smokingPm25} µg/m³`}
              </strong>
            </p>
            <p
              className={
                combinedSeverity === 'severe'
                  ? 'text-red-900 dark:text-red-200'
                  : 'text-amber-900 dark:text-amber-200'
              }
            >
              1 cigarette adds ~{PM25_PER_CIGARETTE} µg/m³ equivalent PM2.5 (max {MAX_CIGARETTES_PER_DAY}/day). Your action plan will include 60-minute recovery initials and targeted lung-clearing exercises.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
