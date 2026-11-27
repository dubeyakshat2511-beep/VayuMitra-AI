/** Theme mode supported across VayuMitra AI. */
export type ThemeMode = 'light' | 'dark';

/** localStorage key used to persist the user's explicit theme preference. */
export const THEME_STORAGE_KEY = 'vayumitra_theme';

/** Minimal storage interface for testable, SSR-safe persistence. */
export interface ThemeStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** Minimal root element interface for applying the Tailwind `dark` class. */
export interface ThemeRootElementLike {
  classList: {
    toggle: (token: string, force?: boolean) => boolean;
  };
  style?: {
    colorScheme?: string;
  };
}

/**
 * Resolves the initial theme preference:
 * 1. Explicit persisted value (`'dark'` | `'light'`) in `localStorage` (`vayumitra_theme`).
 * 2. System preference (`prefers-color-scheme: dark`) on first visit.
 * 3. `'light'` fallback when neither is available.
 */
export function resolveInitialTheme(
  storage?: Pick<ThemeStorageLike, 'getItem'> | null,
  prefersDark?: boolean
): ThemeMode {
  const resolvedStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;

  if (resolvedStorage) {
    try {
      const saved = resolvedStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    } catch {
      // Ignore storage access errors in restricted/private contexts
    }
  }

  if (typeof prefersDark === 'boolean') {
    return prefersDark ? 'dark' : 'light';
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  return 'light';
}

/** Returns the opposite theme mode for the Sun/Moon toggle action. */
export function getNextTheme(current: ThemeMode): ThemeMode {
  return current === 'dark' ? 'light' : 'dark';
}

/** Persists the user's chosen theme into `localStorage` (`vayumitra_theme`). */
export function persistTheme(
  theme: ThemeMode,
  storage?: Pick<ThemeStorageLike, 'setItem'> | null
): void {
  const resolvedStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;

  if (!resolvedStorage) return;

  try {
    resolvedStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota or restricted-mode errors
  }
}

/** Toggles the `dark` class cleanly on `document.documentElement`. */
export function applyThemeToDocument(
  theme: ThemeMode,
  rootEl?: ThemeRootElementLike | null
): void {
  const target =
    rootEl !== undefined
      ? rootEl
      : typeof document !== 'undefined'
        ? document.documentElement
        : null;

  if (!target) return;

  target.classList.toggle('dark', theme === 'dark');
  if (target.style) {
    target.style.colorScheme = theme;
  }
}
