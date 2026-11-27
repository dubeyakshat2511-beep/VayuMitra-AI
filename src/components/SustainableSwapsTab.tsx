import { Check, HeartPulse, Leaf } from 'lucide-react';
import type { SustainableSwap } from '../types/vayu';

interface SustainableSwapsTabProps {
  swaps: SustainableSwap[];
  checkedIds: Record<string, boolean>;
  onToggleSwap: (id: string) => void;
}

export function SustainableSwapsTab({
  swaps,
  checkedIds,
  onToggleSwap,
}: SustainableSwapsTabProps) {
  const activeSwaps = swaps.filter((s) => checkedIds[s.id]);

  const totalPossibleCo2 = swaps.reduce((acc, s) => acc + s.weeklyCo2SavedKg, 0);
  const totalPossiblePm = swaps.reduce((acc, s) => acc + s.weeklyPm25NoxPreventedGrams, 0);

  const earnedCo2 = activeSwaps.reduce((acc, s) => acc + s.weeklyCo2SavedKg, 0);
  const earnedPm = activeSwaps.reduce((acc, s) => acc + s.weeklyPm25NoxPreventedGrams, 0);

  const co2Pct = totalPossibleCo2 > 0 ? Math.min(100, (earnedCo2 / totalPossibleCo2) * 100) : 0;
  const pmPct = totalPossiblePm > 0 ? Math.min(100, (earnedPm / totalPossiblePm) * 100) : 0;
  const annualCo2 = earnedCo2 * 52;

  return (
    <div className="space-y-7">
      {/* Live Weekly Impact Meter */}
      <section
        aria-label="Weekly Impact Meter"
        className="rounded-xl bg-slate-900 dark:bg-slate-950 border border-transparent dark:border-slate-800 text-slate-100 p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white">Weekly Impact Meter</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Check the habit swaps below to calculate your household&apos;s live weekly emission reduction.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-emerald-300 font-medium">
            {activeSwaps.length} of {swaps.length} swaps committed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
          {/* CO2 Saved Meter */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">CO₂ Emissions Saved</span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                Max {totalPossibleCo2.toFixed(1)} kg/wk
              </span>
            </div>
            <div className="flex items-baseline">
              <span className="text-3xl font-mono font-semibold text-white tabular-nums">
                {earnedCo2.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-emerald-400 ml-1.5">kg CO₂ / week</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${co2Pct}%` }}
              />
            </div>
            <p className="text-xs font-mono tabular-nums text-slate-400">
              Annualized projection: {annualCo2.toFixed(0)} kg CO₂ / year
            </p>
          </div>

          {/* PM2.5 + NOx Prevented Meter */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">PM2.5 &amp; NOx Prevented</span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                Max {totalPossiblePm.toFixed(1)} g/wk
              </span>
            </div>
            <div className="flex items-baseline">
              <span className="text-3xl font-mono font-semibold text-white tabular-nums">
                {earnedPm.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-amber-300 ml-1.5">g PM2.5 &amp; NOx / week</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-200"
                style={{ width: `${pmPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Direct reduction in neighborhood street-level &amp; indoor particulate load
            </p>
          </div>
        </div>

        {/* Dynamic Lung-Health Benefit Readout */}
        <div className="pt-4 border-t border-slate-800 flex items-start gap-3">
          <HeartPulse className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            <span className="font-semibold text-white">Active Lung-Health Benefit: </span>
            {activeSwaps.length === 0 ? (
              <span className="text-slate-400">
                Select at least one habit swap below to see your combined household airway protection.
              </span>
            ) : (
              <span>
                {activeSwaps.map((s) => s.lungHealthBenefit).join(' ')}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 3 Interactive Swap Rows */}
      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {swaps.map((swap) => {
          const isChecked = Boolean(checkedIds[swap.id]);
          const checkboxId = `swap-${swap.id}`;
          return (
            <div
              key={swap.id}
              className={`py-5 first:pt-1 last:pb-1 transition-colors ${
                isChecked ? 'opacity-100' : 'opacity-95'
              }`}
            >
              <label
                htmlFor={checkboxId}
                className="flex items-start gap-4 cursor-pointer group"
              >
                {/* Accessible Custom Checkbox */}
                <span className="relative mt-0.5 shrink-0">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSwap(swap.id)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900 ${
                      isChecked
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-600 group-hover:border-emerald-500'
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                </span>

                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {swap.category} Swap
                      </span>
                      <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {swap.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        -{swap.weeklyCo2SavedKg.toFixed(1)} kg CO₂/wk
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        -{swap.weeklyPm25NoxPreventedGrams.toFixed(1)} g PM2.5/NOx
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">Instead of: </span>
                      {swap.currentHabit}
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      <span className="font-semibold text-emerald-800 dark:text-emerald-400">Switch to: </span>
                      {swap.sustainableAction}
                    </p>
                  </div>

                  <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 rounded-lg p-3 leading-relaxed">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
                    <p>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">Lung benefit: </span>
                      {swap.lungHealthBenefit}{' '}
                      <span className="text-slate-500 dark:text-slate-400">Tip: {swap.practicalTip}</span>
                    </p>
                  </div>
                </div>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
