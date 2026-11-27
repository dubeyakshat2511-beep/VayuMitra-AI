import { Clock, Play, Sparkles } from 'lucide-react';
import type { YogaSession, YogaSessionType } from '../types/vayu';

/** Props accepted by {@link YogaSessionCard}. */
export interface YogaSessionCardProps {
  /** Individual yoga, pranayama, or lung-clearing exercise definition. */
  session: YogaSession;
  /** Launches the visual Breathing Pacer modal pre-loaded with this session. */
  onStartTimer: (session: YogaSession) => void;
}

function getTypeBadgeStyle(type: YogaSessionType): string {
  switch (type) {
    case 'Pranayama':
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    case 'Dynamic Flow':
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'Restorative':
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700';
  }
}

/**
 * Editorial card presenting a single indoor yoga or breathwork session with
 * step-by-step instructions, tailored respiratory impact, and a pacer launcher.
 */
export function YogaSessionCard({ session, onStartTimer }: YogaSessionCardProps) {
  const { inhaleSec, holdSec, exhaleSec } = session.pacerConfig ?? {
    inhaleSec: 4,
    holdSec: 4,
    exhaleSec: 6,
  };

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
      <div className="space-y-3.5">
        {/* Card Header: Pose/Technique Name + Type Badge + Duration */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {session.name}
            </h4>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border whitespace-nowrap shrink-0 ${getTypeBadgeStyle(
                session.sessionType
              )}`}
            >
              {session.sessionType}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-medium">
              <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              {session.durationLabel || `${session.durationMinutes} min`}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
            <span>
              Pacer: {inhaleSec}s In{holdSec > 0 ? ` → ${holdSec}s Hold` : ''} → {exhaleSec}s Out
            </span>
          </div>
        </div>

        {/* Step-by-Step How-To */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Step-by-Step How-To</p>
          <ol className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {session.howToSteps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                <span
                  aria-hidden="true"
                  className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0"
                >
                  0{idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Impact + Tailored Note + Guided Timer CTA */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3 space-y-1.5 text-xs leading-relaxed">
          <p className="text-slate-700 dark:text-slate-200">
            <span className="font-semibold text-slate-900 dark:text-white">Direct Lung / Performance Impact: </span>
            {session.lungOrPerformanceImpact}
          </p>
          {session.tailoredNote && (
            <p className="text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{session.tailoredNote}</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onStartTimer(session)}
          className="w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Start Guided Timer</span>
        </button>
      </div>
    </article>
  );
}
