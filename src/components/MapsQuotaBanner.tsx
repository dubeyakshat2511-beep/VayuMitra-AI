/** Props accepted by {@link MapsQuotaBanner}. */
export interface MapsQuotaBannerProps {
  /** Renders the banner only when Google Maps Platform quota is exceeded. */
  visible: boolean;
}

/**
 * Accessible status banner displayed when the optional Google Maps mini-map
 * reaches its platform quota, without interrupting core AQI functionality.
 */
export function MapsQuotaBanner({ visible }: MapsQuotaBannerProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 dark:bg-amber-950/90 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
    >
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 dark:text-amber-200 hover:text-amber-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  );
}
