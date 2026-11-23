import type { IndoorHack } from '../types/vayu';

interface IndoorHacksTabProps {
  hacks: IndoorHack[];
  homeSetup: string;
}

export function IndoorHacksTab({ hacks, homeSetup }: IndoorHacksTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Targeted Indoor Air Quality Hacks
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Four practical particle-reduction measures calibrated for your current setup.
          </p>
        </div>
        <p className="text-xs text-slate-500 font-medium">{homeSetup}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {hacks.map((hack, idx) => {
          const pct = Math.max(5, Math.min(95, Math.round(hack.estimatedPm25ReductionPct)));
          return (
            <article
              key={`${hack.title}-${idx}`}
              className="pt-4 border-t border-slate-200 first:border-t-0 md:[&:nth-child(2)]:border-t-0 md:first:pt-0 md:[&:nth-child(2)]:pt-0 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                {/* Editorial Title & Clean Unboxed Metadata */}
                <div>
                  <h4 className="text-base font-bold text-slate-900 leading-snug">
                    0{idx + 1}. {hack.title}
                  </h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>Est. cost: {hack.costEstimate}</span>
                    <span aria-hidden="true">·</span>
                    <span>Effort: {hack.timeRequired}</span>
                  </div>
                </div>

                {/* Estimated PM2.5 Reduction Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-slate-700">Estimated indoor PM2.5 reduction</span>
                    <span className="font-mono font-semibold text-emerald-700 tabular-nums text-sm">
                      -{pct}%
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${hack.title} estimated PM2.5 reduction`}
                    className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
                  >
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Step-by-Step Instructions */}
                <p className="text-sm text-slate-700 leading-relaxed">{hack.howToExecute}</p>
              </div>

              {/* Scientific Mechanism */}
              <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 leading-relaxed">
                <span className="font-semibold text-slate-800">Why it works: </span>
                {hack.whyItWorks}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
