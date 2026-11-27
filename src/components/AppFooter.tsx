/**
 * Accessible site footer displaying data attribution and clinical guidance notice.
 */
export function AppFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-auto transition-colors duration-150">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
        <p>
          VayuMitra AI — Urban Air Quality &amp; Smog Assistant. Live readings sourced from Open-Meteo Atmospheric &amp; Air Quality APIs.
        </p>
        <p className="text-slate-500 dark:text-slate-400">
          Health guidance is informational; consult a physician for acute respiratory symptoms.
        </p>
      </div>
    </footer>
  );
}
