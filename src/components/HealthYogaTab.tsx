import { ShieldAlert, Wind } from 'lucide-react';
import type { FamilyProfile, HealthYogaModule, YogaSession } from '../types/vayu';
import { YogaSessionCard } from './YogaSessionCard';

interface HealthYogaTabProps {
  module: HealthYogaModule;
  usAqi: number;
  pm25: number;
  profile: FamilyProfile;
  onStartTimer: (session: YogaSession) => void;
}

export function HealthYogaTab({
  module,
  usAqi,
  pm25,
  profile,
  onStartTimer,
}: HealthYogaTabProps) {
  const isSevereAqi = usAqi > 200;

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
      <div className="space-y-3 pb-4 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Indoor Lung-Care Yoga &amp; Pranayama
            </h3>
            <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">
              {module.summary}
            </p>
          </div>
          <p className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
            AQI {usAqi} · PM2.5 {pm25.toFixed(1)} µg/m³
          </p>
        </div>

        <p className="text-xs text-slate-500">
          Tailored for: <span className="font-medium text-slate-700">{profile.members.join(', ')}</span>
          <span aria-hidden="true" className="mx-1.5">·</span>
          <span>{profile.homeSetup}</span>
        </p>
      </div>

      {/* Mandatory AQI > 200 Safety Rule Warning Banner */}
      {isSevereAqi ? (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-200 p-4 sm:p-5 flex items-start gap-3.5"
        >
          <ShieldAlert className="w-5 h-5 text-red-700 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-bold bg-red-700 text-white rounded-md whitespace-nowrap">
                AQI {usAqi} · Poor / Severe Safety Rule
              </span>
              <span className="font-bold text-red-950">
                Gentle, slow-paced indoor breathwork only
              </span>
            </div>
            <p className="text-red-900 leading-relaxed">
              Keep windows closed and practice slow nasal breathing only. Asthma, respiratory-sensitive, and elderly household members should{' '}
              <strong className="font-semibold">
                avoid forceful rapid breathing techniques like Kapalabhati or Bhastrika
              </strong>{' '}
              in unfiltered air, as high-velocity inhalation drives fine PM2.5 deeper into the lower airways.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/80 p-4 flex items-start gap-3 text-sm text-emerald-950">
          <Wind className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
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
              <h4 className="text-sm font-bold text-slate-900">
                01. Pranayama (Gentle Breathwork)
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Airway balance, sinus/throat soothing, and calm diaphragmatic recovery.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
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
        <section aria-label="Chest-Opening Asanas" className="space-y-3.5 pt-2 border-t border-slate-200">
          <div className="flex items-baseline justify-between gap-2 pt-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                02. Chest-Opening Asanas (Restorative)
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Expand ribcage capacity and ease shallow breathing caused by smog exposure.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
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
