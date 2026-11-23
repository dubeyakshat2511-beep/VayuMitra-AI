import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, ShieldAlert, Wind, X } from 'lucide-react';
import type { BreathingPacerConfig, YogaSession } from '../types/vayu';

type Phase = 'inhale' | 'hold' | 'exhale';

interface BreathingPacerModalProps {
  session: YogaSession;
  usAqi: number;
  onClose: () => void;
}

function formatTime(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function BreathingPacerModal({
  session,
  usAqi,
  onClose,
}: BreathingPacerModalProps) {
  const defaultConfig: BreathingPacerConfig = useMemo(() => {
    const inhaleSec = Math.max(2, Math.min(8, Math.round(session.pacerConfig?.inhaleSec || 4)));
    const holdSec = Math.max(0, Math.min(8, Math.round(session.pacerConfig?.holdSec ?? 4)));
    const exhaleSec = Math.max(3, Math.min(10, Math.round(session.pacerConfig?.exhaleSec || 6)));
    return { inhaleSec, holdSec, exhaleSec };
  }, [session.pacerConfig]);

  const totalSessionSeconds = Math.max(60, (session.durationMinutes || 5) * 60);

  const [cadence, setCadence] = useState<BreathingPacerConfig>(defaultConfig);
  const [activePreset, setActivePreset] = useState<string>('default');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [phase, setPhase] = useState<Phase>('inhale');
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState<number>(defaultConfig.inhaleSec);
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState<number>(totalSessionSeconds);
  const [completedCycles, setCompletedCycles] = useState<number>(0);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // 1-second interval timer driving both breathing phase and session countdown
  useEffect(() => {
    if (!isRunning || sessionSecondsLeft <= 0) return;

    const timer = window.setInterval(() => {
      setSessionSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });

      setPhaseSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        // Transition to next phase
        if (phase === 'inhale') {
          if (cadence.holdSec > 0) {
            setPhase('hold');
            return cadence.holdSec;
          }
          setPhase('exhale');
          return cadence.exhaleSec;
        }
        if (phase === 'hold') {
          setPhase('exhale');
          return cadence.exhaleSec;
        }
        // Completed exhale -> new cycle
        setCompletedCycles((c) => c + 1);
        setPhase('inhale');
        return cadence.inhaleSec;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning, phase, cadence, sessionSecondsLeft]);

  const applyPreset = (id: string, nextConfig: BreathingPacerConfig) => {
    setActivePreset(id);
    setCadence(nextConfig);
    setPhase('inhale');
    setPhaseSecondsLeft(nextConfig.inhaleSec);
  };

  const handleReset = () => {
    setIsRunning(false);
    setPhase('inhale');
    setPhaseSecondsLeft(cadence.inhaleSec);
    setSessionSecondsLeft(totalSessionSeconds);
    setCompletedCycles(0);
  };

  const currentPhaseDuration =
    phase === 'inhale'
      ? cadence.inhaleSec
      : phase === 'hold'
        ? Math.max(1, cadence.holdSec)
        : cadence.exhaleSec;

  const phaseProgress =
    (currentPhaseDuration - phaseSecondsLeft + 1) / Math.max(1, currentPhaseDuration);

  const ringRadius = 74;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = ringCircumference * (1 - Math.min(1, Math.max(0, phaseProgress)));

  const orbScale =
    !isRunning
      ? 'scale-95'
      : phase === 'inhale'
        ? 'scale-110'
        : phase === 'hold'
          ? 'scale-110'
          : 'scale-80';

  const phaseLabel =
    sessionSecondsLeft === 0
      ? 'Complete'
      : phase === 'inhale'
        ? 'Inhale Slowly'
        : phase === 'hold'
          ? 'Hold Gently'
          : 'Exhale Smoothly';

  const phaseColor =
    phase === 'inhale'
      ? '#10b981'
      : phase === 'hold'
        ? '#f59e0b'
        : '#38bdf8';

  const presets: { id: string; label: string; config: BreathingPacerConfig }[] = [
    {
      id: 'default',
      label: `Session (${defaultConfig.inhaleSec}-${defaultConfig.holdSec}-${defaultConfig.exhaleSec})`,
      config: defaultConfig,
    },
    { id: 'calming', label: 'Calming (4-4-6)', config: { inhaleSec: 4, holdSec: 4, exhaleSec: 6 } },
    { id: 'gentle', label: 'Gentle (4-2-6)', config: { inhaleSec: 4, holdSec: 2, exhaleSec: 6 } },
    { id: 'box', label: 'Box (4-4-4)', config: { inhaleSec: 4, holdSec: 4, exhaleSec: 4 } },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pacer-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/90 text-slate-100 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <Wind className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Guided Breathing Pacer · {session.sessionType}</span>
            </div>
            <h3 id="pacer-modal-title" className="mt-0.5 text-base font-bold text-white truncate">
              {session.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close breathing pacer"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* High-AQI Reminder inside pacer when AQI > 200 */}
        {usAqi > 200 && (
          <div className="px-5 py-2.5 bg-amber-950/50 border-b border-amber-800/60 flex items-center gap-2 text-xs text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span>
              AQI {usAqi}: Breathe gently through your nose indoors; pause immediately if you feel dizzy or tight-chested.
            </span>
          </div>
        )}

        {/* Calming Visual Breathing Orb & Countdown Ring */}
        <div className="px-5 py-7 flex flex-col items-center gap-5">
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Soft Expanding / Contracting Breath Aura */}
            <div
              className={`absolute w-32 h-32 rounded-full transition-transform duration-1000 ease-in-out ${orbScale}`}
              style={{
                background:
                  phase === 'inhale'
                    ? 'radial-gradient(circle, rgba(16,185,129,0.34) 0%, rgba(16,185,129,0.04) 72%)'
                    : phase === 'hold'
                      ? 'radial-gradient(circle, rgba(245,158,11,0.28) 0%, rgba(245,158,11,0.04) 72%)'
                      : 'radial-gradient(circle, rgba(56,189,248,0.28) 0%, rgba(56,189,248,0.04) 72%)',
              }}
              aria-hidden="true"
            />

            {/* Progress Ring */}
            <svg viewBox="0 0 180 180" className="w-48 h-48 -rotate-90" aria-hidden="true">
              <circle
                cx="90"
                cy="90"
                r={ringRadius}
                fill="none"
                stroke="rgba(148, 163, 184, 0.16)"
                strokeWidth="5"
              />
              <circle
                cx="90"
                cy="90"
                r={ringRadius}
                fill="none"
                stroke={phaseColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-[stroke-dashoffset,stroke] duration-500 ease-out"
              />
            </svg>

            {/* Center Numeric Readout */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {phaseLabel}
              </span>
              <span className="mt-1 text-4xl font-mono font-semibold text-white tabular-nums leading-none">
                {sessionSecondsLeft === 0 ? 'Done' : `${phaseSecondsLeft}s`}
              </span>
              <span className="mt-2 text-[11px] font-mono tabular-nums text-slate-400">
                {cadence.inhaleSec}s In · {cadence.holdSec}s Hold · {cadence.exhaleSec}s Out
              </span>
            </div>
          </div>

          {/* Session Stats Strip */}
          <div className="w-full grid grid-cols-3 divide-x divide-slate-800 border border-slate-800 rounded-lg bg-slate-950/60 py-2.5 text-center">
            <div>
              <p className="text-[11px] text-slate-400">Remaining</p>
              <p className="text-sm font-mono font-semibold text-white tabular-nums mt-0.5">
                {formatTime(sessionSecondsLeft)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Cycles Done</p>
              <p className="text-sm font-mono font-semibold text-emerald-300 tabular-nums mt-0.5">
                {completedCycles}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Target</p>
              <p className="text-sm font-mono font-semibold text-slate-200 tabular-nums mt-0.5">
                {session.durationMinutes} min
              </p>
            </div>
          </div>

          {/* Cadence Presets */}
          <div className="w-full space-y-1.5">
            <span className="block text-[11px] font-medium text-slate-400 text-center">
              Breathing Rhythm (Inhale-Hold-Exhale seconds)
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id, p.config)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    activePreset === p.id
                      ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/50'
                      : 'bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (sessionSecondsLeft === 0) {
                  setSessionSecondsLeft(totalSessionSeconds);
                  setPhase('inhale');
                  setPhaseSecondsLeft(cadence.inhaleSec);
                  setCompletedCycles(0);
                  setIsRunning(true);
                } else {
                  setIsRunning((r) => !r);
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{sessionSecondsLeft === 0 ? 'Restart Session' : 'Resume'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Compact Technique Reference Footer */}
        <div className="px-5 py-4 bg-slate-950/70 border-t border-slate-800 space-y-2">
          <p className="text-xs font-semibold text-slate-300">Quick Form Cues</p>
          <ol className="space-y-1 text-xs text-slate-400 leading-relaxed">
            {session.howToSteps.slice(0, 3).map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 shrink-0">0{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
