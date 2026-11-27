import { AlertTriangle, ShieldAlert, ShieldCheck, Wind } from 'lucide-react';
import type { RoutineBlock, RoutineRiskLevel } from '../types/vayu';

interface RoutineTabProps {
  routine: RoutineBlock[];
  safeWindowLabel: string;
}

function getRiskPresentation(level: RoutineRiskLevel) {
  switch (level) {
    case 'Low':
      return {
        textClass: 'text-emerald-700 dark:text-emerald-400',
        icon: <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />,
      };
    case 'Moderate':
      return {
        textClass: 'text-amber-700 dark:text-amber-300',
        icon: <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />,
      };
    case 'High':
      return {
        textClass: 'text-orange-700 dark:text-orange-300',
        icon: <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />,
      };
    case 'Severe':
    default:
      return {
        textClass: 'text-red-700 dark:text-red-400',
        icon: <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />,
      };
  }
}

export function RoutineTab({ routine, safeWindowLabel }: RoutineTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Time-Blocked Inversion &amp; Ventilation Schedule
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Timed around winter temperature inversion cycles so you ventilate only during peak mixing.
          </p>
        </div>
        <p className="text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium whitespace-nowrap">
          Optimal window: {safeWindowLabel}
        </p>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {routine.map((block, index) => {
          const risk = getRiskPresentation(block.riskLevel);
          return (
            <article
              key={`${block.period}-${index}`}
              className="py-5 first:pt-1 last:pb-1 grid grid-cols-1 md:grid-cols-12 gap-5"
            >
              {/* Left Column: Time Block & Risk Classification */}
              <div className="md:col-span-4 space-y-2">
                <div className="flex items-baseline justify-between md:block">
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    0{index + 1}. {block.period}
                  </h4>
                  <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 md:mt-0.5">
                    {block.timeRange}
                  </p>
                </div>

                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${risk.textClass}`}>
                  {risk.icon}
                  <span>{block.riskLevel} Smog Risk</span>
                </div>

                <div className="pt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-start gap-2">
                    <Wind className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Ventilation: </span>
                      <span>{block.ventilationAction}</span>
                    </div>
                  </div>
                  <p className="pl-5.5 text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Mask: </span>
                    {block.maskGuidance}
                  </p>
                </div>
              </div>

              {/* Right Column: Inversion Science + Household Actions */}
              <div className="md:col-span-8 space-y-3">
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  <span className="font-semibold text-slate-900 dark:text-white">Atmospheric Inversion: </span>
                  {block.inversionExplanation}
                </div>

                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {block.familyActions.map((action, aIdx) => (
                    <li key={aIdx} className="flex items-start gap-2.5 leading-relaxed">
                      <span
                        aria-hidden="true"
                        className="font-mono text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-1 select-none"
                      >
                        —
                      </span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
