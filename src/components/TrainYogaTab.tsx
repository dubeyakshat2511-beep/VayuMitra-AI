import { Activity, Cigarette, ShieldAlert } from 'lucide-react';
import type {
  FamilyProfile,
  SmokerRecoveryModule,
  TrainYogaModule,
  YogaSession,
} from '../types/vayu';
import { YogaSessionCard } from './YogaSessionCard';

interface TrainYogaTabProps {
  module: TrainYogaModule;
  usAqi: number;
  pm25: number;
  profile: FamilyProfile;
  smokerRecovery?: SmokerRecoveryModule | null;
  onStartTimer: (session: YogaSession) => void;
}

export function TrainYogaTab({
  module,
  usAqi,
  pm25,
  profile,
  smokerRecovery = null,
  onStartTimer,
}: TrainYogaTabProps) {
  const isHighAqi = usAqi > 200;
  const hasSmokingExposure = Boolean(smokerRecovery && smokerRecovery.cigarettesCount > 0);

  const dynamicFlowSessions = module.sessions.filter(
    (s) =>
      s.sessionType === 'Dynamic Flow' ||
      s.categoryGroup.toLowerCase().includes('dynamic')
  );
  const breathDrillSessions = module.sessions.filter(
    (s) =>
      !dynamicFlowSessions.includes(s) &&
      (s.sessionType === 'Pranayama' ||
        s.categoryGroup.toLowerCase().includes('breath') ||
        s.categoryGroup.toLowerCase().includes('capacity'))
  );
  const mobilitySessions = module.sessions.filter(
    (s) => !dynamicFlowSessions.includes(s) && !breathDrillSessions.includes(s)
  );

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              High-AQI Indoor Athletic Yoga &amp; Breath Conditioning
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              {module.summary}
            </p>
          </div>
          <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            AQI {usAqi} · PM2.5 {pm25.toFixed(1)} µg/m³
            {hasSmokingExposure && smokerRecovery
              ? ` · Combined ${smokerRecovery.combinedPm25Burden.toFixed(1)} µg/m³`
              : ''}
          </p>
        </div>

        <div
          className={`rounded-lg p-3.5 flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed ${
            isHighAqi
              ? 'bg-amber-50 dark:bg-amber-950/45 border border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
              : 'bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
          }`}
        >
          {isHighAqi ? (
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <p>
            <span className="font-semibold">
              {isHighAqi ? 'Smog-Day Indoor Training Rule: ' : 'Indoor Conditioning Note: '}
            </span>
            {module.smogConditioningNote}{' '}
            <span className="text-slate-500 dark:text-slate-400">({profile.homeSetup})</span>
          </p>
        </div>

        {hasSmokingExposure && smokerRecovery && (
          <div
            role="alert"
            className="rounded-lg p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 text-red-950 dark:text-red-100 flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed"
          >
            <Cigarette className="w-4 h-4 text-red-700 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">
                Smoking + Smog Exertion Guard ({smokerRecovery.cigarettesCount}{' '}
                {smokerRecovery.cigarettesCount === 1 ? 'cig' : 'cigs'} today ·{' '}
                {smokerRecovery.combinedPm25Burden.toFixed(1)} µg/m³ combined PM2.5):{' '}
              </span>
              {smokerRecovery.cardioWarning}
            </p>
          </div>
        )}
      </div>

      {/* Category 1: Dynamic Flow */}
      {dynamicFlowSessions.length > 0 && (
        <section aria-label="Dynamic Flow" className="space-y-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                01. Dynamic Flow (Indoor Cardio &amp; Mobility)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Maintain aerobic conditioning indoors without outdoor PM2.5 inhalation.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-400">
              {dynamicFlowSessions.length} session
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {dynamicFlowSessions.map((session, idx) => (
              <YogaSessionCard
                key={`${session.id}-${idx}`}
                session={session}
                onStartTimer={onStartTimer}
              />
            ))}
          </div>
        </section>
      )}

      {/* Category 2: Breath-Hold & Lung Capacity Drills */}
      {breathDrillSessions.length > 0 && (
        <section aria-label="Breath-Hold and Lung Capacity Drills" className="space-y-3.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-2 pt-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                02. Breath-Hold &amp; Lung Capacity Drills
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Strengthen diaphragm, intercostal muscles, and rhythmic aerobic endurance.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-400">
              {breathDrillSessions.length} sessions
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {breathDrillSessions.map((session, idx) => (
              <YogaSessionCard
                key={`${session.id}-${idx}`}
                session={session}
                onStartTimer={onStartTimer}
              />
            ))}
          </div>
        </section>
      )}

      {/* Category 3: Post-Workout Chest & Thoracic Mobility */}
      {mobilitySessions.length > 0 && (
        <section aria-label="Post-Workout Chest and Thoracic Mobility" className="space-y-3.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-2 pt-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                03. Post-Workout Chest &amp; Thoracic Mobility
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Counter tight running posture and maximize thoracic oxygen uptake.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-400">
              {mobilitySessions.length} sessions
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {mobilitySessions.map((session, idx) => (
              <YogaSessionCard
                key={`${session.id}-${idx}`}
                session={session}
                onStartTimer={onStartTimer}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
