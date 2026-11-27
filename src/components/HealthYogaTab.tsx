import { Cigarette, ShieldAlert, Wind } from 'lucide-react';
import type {
  FamilyProfile,
  HealthYogaModule,
  SmokerRecoveryModule,
  YogaSession,
} from '../types/vayu';
import { YogaSessionCard } from './YogaSessionCard';

interface HealthYogaTabProps {
  module: HealthYogaModule;
  usAqi: number;
  pm25: number;
  profile: FamilyProfile;
  smokerRecovery?: SmokerRecoveryModule | null;
  onStartTimer: (session: YogaSession) => void;
}

export function HealthYogaTab({
  module,
  usAqi,
  pm25,
  profile,
  smokerRecovery = null,
  onStartTimer,
}: HealthYogaTabProps) {
  const isSevereAqi = usAqi > 200;
  const hasSmokingExposure = Boolean(smokerRecovery && smokerRecovery.cigarettesCount > 0);

  const pranayamaSessions = module.sessions.filter(
    (s) =>
      s.categoryGroup.toLowerCase().includes('pranayama') || s.sessionType === 'Pranayama'
  );
  const chestOpeningSessions = module.sessions.filter(
    (s) => !pranayamaSessions.some((p) => p.id === s.id && p.name === s.name)
  );

  return (
    <div className="space-y-7">
      {/* Sub-section Header */}
      <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Indoor Lung-Care Yoga &amp; Pranayama
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

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tailored for: <span className="font-medium text-slate-700 dark:text-slate-200">{profile.members.join(', ')}</span>
          <span aria-hidden="true" className="mx-1.5">·</span>
          <span>{profile.homeSetup}</span>
          {hasSmokingExposure && smokerRecovery && (
            <>
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span className="font-medium text-amber-800 dark:text-amber-300">
                {smokerRecovery.cigarettesCount}{' '}
                {smokerRecovery.cigarettesCount === 1 ? 'cigarette' : 'cigarettes'} today (+
                {smokerRecovery.smokingEquivalentPm25} µg/m³)
              </span>
            </>
          )}
        </p>
      </div>

      {/* Smoker-Calibrated Airway Recovery Note (only when cigarettes > 0) */}
      {hasSmokingExposure && smokerRecovery && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/45 border border-amber-200 dark:border-amber-800/80 p-4 flex items-start gap-3 text-sm text-amber-950 dark:text-amber-100">
          <Cigarette className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1 leading-relaxed">
            <p>
              <span className="font-semibold">Smoker Airway Calibration: </span>
              Complete your 60-minute hydration/steam initials and Pursed-Lip + Huff-Cough clearance from the Smoker Recovery protocol above before starting chest-opening asanas. Keep all inhalations slow and nasal.
            </p>
          </div>
        </div>
      )}

      {/* Mandatory AQI > 200 Safety Rule Warning Banner */}
      {isSevereAqi ? (
        <div
          role="alert"
          className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 p-4 sm:p-5 flex items-start gap-3.5"
        >
          <ShieldAlert className="w-5 h-5 text-red-700 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-bold bg-red-700 dark:bg-red-600 text-white rounded-md whitespace-nowrap">
                AQI {usAqi} · Poor / Severe Safety Rule
              </span>
              <span className="font-bold text-red-950 dark:text-red-100">
                Gentle, slow-paced indoor breathwork only
              </span>
            </div>
            <p className="text-red-900 dark:text-red-200 leading-relaxed">
              Keep windows closed and practice slow nasal breathing only. Asthma, respiratory-sensitive, and elderly household members should{' '}
              <strong className="font-semibold text-red-950 dark:text-white">
                avoid forceful rapid breathing techniques like Kapalabhati or Bhastrika
              </strong>{' '}
              in unfiltered air, as high-velocity inhalation drives fine PM2.5 deeper into the lower airways.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/45 border border-emerald-200/80 dark:border-emerald-800/70 p-4 flex items-start gap-3 text-sm text-emerald-950 dark:text-emerald-100">
          <Wind className="w-4 h-4 text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="leading-relaxed">
            <span className="font-semibold">Respiratory Safety Guidance: </span>
            {module.aqiSafetyGuidance}
          </p>
        </div>
      )}

      {/* Category 1: Pranayama (Breathwork) */}
      {pranayamaSessions.length > 0 && (
        <section aria-label="Pranayama Breathwork" className="space-y-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                01. Pranayama (Gentle Breathwork)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Airway balance, sinus/throat soothing, and calm diaphragmatic recovery.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-400">
              {pranayamaSessions.length} sessions
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {pranayamaSessions.map((session, idx) => (
              <YogaSessionCard
                key={`${session.id}-${idx}`}
                session={session}
                onStartTimer={onStartTimer}
              />
            ))}
          </div>
        </section>
      )}

      {/* Category 2: Chest-Opening Asanas */}
      {chestOpeningSessions.length > 0 && (
        <section aria-label="Chest-Opening Asanas" className="space-y-3.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-2 pt-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                02. Chest-Opening Asanas (Restorative)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Expand ribcage capacity and ease shallow breathing caused by smog exposure.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-400">
              {chestOpeningSessions.length} sessions
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {chestOpeningSessions.map((session, idx) => (
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
