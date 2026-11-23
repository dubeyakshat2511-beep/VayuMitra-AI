import { Sparkles } from 'lucide-react';

interface HeaderProps {
  onGeneratePlan: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
}

export function Header({ onGeneratePlan, isGenerating, canGenerate }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#live-telemetry"
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
        >
          VayuMitra AI
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300"
        >
          <a
            href="#live-telemetry"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
          >
            Live Telemetry
          </a>
          <a
            href="#dispersion-curve"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
          >
            24h Forecast
          </a>
          <a
            href="#family-profile"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
          >
            Family Profile
          </a>
          <a
            href="#action-plan"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
          >
            Action Plan
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onGeneratePlan}
            disabled={!canGenerate || isGenerating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 rounded-lg transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{isGenerating ? 'Generating...' : 'Generate Plan'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
