import { useState } from 'react';
import { ChevronDown, ChevronUp, Cigarette, Clock, ShieldAlert, Wind } from 'lucide-react';
import type { SmokerRecoveryModule, YogaSession } from '../types/vayu';
import { YogaSessionCard } from './YogaSessionCard';

interface SmokerRecoveryCardProps {
  recovery: SmokerRecoveryModule;
  usAqi: number;
  onStartTimer: (session: YogaSession) => void;
}

export function SmokerRecoveryCard({
  recovery,
  usAqi,
  onStartTimer,
}: SmokerRecoveryCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!recovery || recovery.cigarettesCount <= 0) {
    return null;
  }

  const isSevereCombined = recovery.combinedPm25Burden >= 150 || usAqi > 200;

  return (
    <div
      id="smoker-recovery-module"
      className="border-b border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/20 px-5 sm:px-6 py-5"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-300">
              <Cigarette className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span>Smoker Exposure Protocol</span>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
              {recovery.cigarettesCount} {recovery.cigarettesCount === 1 ? 'cigarette' : 'cigarettes'} today
              {' · '}+{recovery.smokingEquivalentPm25} µg/m³ smoking load
              {' · '}
              <strong className="font-semibold text-amber-950 dark:text-amber-200">
                {recovery.combinedPm25Burden.toFixed(1)} µg/m³ combined PM2.5
              </strong>
            </span>
          </div>

          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Smoker Lung-Recovery Initials &amp; Exercises
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-3xl">
            {recovery.burdenSummary}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <span>{isExpanded ? 'Hide Protocol' : 'Show Protocol'}</span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-5 space-y-6">
          {/* Cardio & Outdoor Exertion Warning */}
          <div
            role="alert"
            className={`rounded-xl p-4 border flex items-start gap-3 text-sm leading-relaxed ${
              isSevereCombined
                ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800/80 text-red-950 dark:text-red-100'
                : 'bg-amber-50 dark:bg-amber-950/45 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
            }`}
          >
            <ShieldAlert
              className={`w-5 h-5 mt-0.5 shrink-0 ${
                isSevereCombined
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
              aria-hidden="true"
            />
            <div>
              <span className="font-semibold">
                {isSevereCombined
                  ? 'High Combined Particulate Load Warning: '
                  : 'Airway & Cardio Caution: '}
              </span>
              {recovery.cardioWarning}
            </div>
          </div>

          {/* 01. Immediate Initials (First 60 Minutes) */}
          {recovery.immediateInitials && recovery.immediateInitials.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    01. Immediate Initials (First 60 Minutes)
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Actionable first steps to soothe irritated airways, clear mucus, and curb acute oxidative stress.
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  {recovery.immediateInitials.length} steps
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recovery.immediateInitials.map((step, idx) => (
                  <article
                    key={`${step.id}-${idx}`}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        <span className="font-mono text-emerald-700 dark:text-emerald-400 mr-1.5">0{idx + 1}.</span>
                        {step.title}
                      </h5>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                        <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                        {step.timingWindow}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{step.action}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Why it helps: </span>
                      {step.physiologicalReason}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* 02. Targeted Lung-Clearing Exercises */}
          {recovery.lungClearingExercises && recovery.lungClearingExercises.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-amber-200/70 dark:border-amber-900/50">
              <div className="flex items-baseline justify-between gap-2 pt-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                    <Wind className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                    <span>02. Targeted Lung-Clearing Exercises</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Calibrated to {recovery.cigarettesCount}{' '}
                    {recovery.cigarettesCount === 1 ? 'cigarette' : 'cigarettes'} today and live US AQI {usAqi}. Practice strictly indoors in clean air.
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  {recovery.lungClearingExercises.length} drills
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recovery.lungClearingExercises.map((session, idx) => (
                  <YogaSessionCard
                    key={`${session.id}-${idx}`}
                    session={session}
                    onStartTimer={onStartTimer}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
