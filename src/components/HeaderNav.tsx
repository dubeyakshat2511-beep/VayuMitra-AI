import { AudioLines, Moon, Sparkles, Sun } from 'lucide-react';
import type { ThemeMode } from '../utils/theme';

/** Props accepted by {@link HeaderNav}. */
export interface HeaderNavProps {
  /** Triggers generation of the consolidated smog action plan. */
  onGeneratePlan: () => void;
  /** Opens the real-time Gemini Live voice conversation modal. */
  onOpenLiveVoice: () => void;
  /** Indicates whether plan generation or cooldown is currently active. */
  isGenerating: boolean;
  /** Enables the primary generate button once live AQI telemetry is ready. */
  canGenerate: boolean;
  /** Current active UI theme (`'light'` or `'dark'`). */
  theme: ThemeMode;
  /** Toggles between light and dark theme modes and persists to localStorage. */
  onToggleTheme: () => void;
}

/**
 * Sticky top navigation bar containing the brand wordmark, section anchors,
 * accessible Sun/Moon dark-mode toggle, Live Voice launcher, and primary CTA.
 */
export function HeaderNav({
  onGeneratePlan,
  onOpenLiveVoice,
  isGenerating,
  canGenerate,
  theme,
  onToggleTheme,
}: HeaderNavProps) {
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
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
          className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-300"
        >
          <a
            href="#live-telemetry"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1"
          >
            Live Telemetry
          </a>
          <a
            href="#dispersion-curve"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1"
          >
            24h Forecast
          </a>
          <a
            href="#family-profile"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1"
          >
            Profile
          </a>
          <a
            href="#action-plan"
            className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1"
          >
            Action Plan
          </a>
        </nav>

        {/* Zone 3: Theme Toggle + Live Voice + Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={isDark}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-slate-700/90 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white transition-colors duration-150 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-200 shrink-0" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenLiveVoice}
            aria-label="Start real-time voice conversation with VayuMitra AI"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-emerald-300 bg-slate-900 hover:bg-slate-800 hover:text-emerald-200 border border-emerald-500/40 rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <AudioLines className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Live Voice</span>
          </button>

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
