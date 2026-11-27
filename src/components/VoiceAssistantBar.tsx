import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { LiveAqiData, SmogActionPlan } from '../types/vayu';
import { buildLocalVoiceBriefing } from '../utils/localFallbackPlan';
import {
  buildVoiceBriefingCacheKey,
  readCachedVoiceScript,
  requestVoiceBriefingScript,
  writeCachedVoiceScript,
} from '../services/vayuApiService';

/** Supported spoken languages for the read-aloud voice assistant bar. */
export type VoiceAssistantLanguage =
  | 'English (India)'
  | 'Hindi (हिन्दी)'
  | 'Hinglish'
  | 'Spanish'
  | 'French'
  | 'German';

const VOICE_LANGUAGE_OPTIONS: {
  value: VoiceAssistantLanguage;
  label: string;
  preferredLangs: string[];
  defaultLangTag: string;
}[] = [
  {
    value: 'English (India)',
    label: 'English (India)',
    preferredLangs: ['en-IN', 'en-GB', 'en-US', 'en'],
    defaultLangTag: 'en-IN',
  },
  {
    value: 'Hindi (हिन्दी)',
    label: 'Hindi (हिन्दी)',
    preferredLangs: ['hi-IN', 'hi', 'en-IN'],
    defaultLangTag: 'hi-IN',
  },
  {
    value: 'Hinglish',
    label: 'Hinglish',
    preferredLangs: ['en-IN', 'hi-IN', 'en-GB', 'en'],
    defaultLangTag: 'en-IN',
  },
  {
    value: 'Spanish',
    label: 'Spanish',
    preferredLangs: ['es-ES', 'es-MX', 'es-US', 'es'],
    defaultLangTag: 'es-ES',
  },
  {
    value: 'French',
    label: 'French',
    preferredLangs: ['fr-FR', 'fr-CA', 'fr'],
    defaultLangTag: 'fr-FR',
  },
  {
    value: 'German',
    label: 'German',
    preferredLangs: ['de-DE', 'de-AT', 'de'],
    defaultLangTag: 'de-DE',
  },
];

type PlaybackState = 'idle' | 'loading' | 'speaking' | 'paused';

function selectMatchingVoice(
  voices: SpeechSynthesisVoice[],
  preferredLangs: string[]
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  for (const tag of preferredLangs) {
    const lowerTag = tag.toLowerCase();
    const exact = voices.find((v) => v.lang.toLowerCase().replace('_', '-') === lowerTag);
    if (exact) return exact;
    const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(`${lowerTag}-`));
    if (prefix) return prefix;
  }

  return voices.find((v) => v.default) ?? voices[0] ?? null;
}

/** Props accepted by {@link VoiceAssistantBar}. */
export interface VoiceAssistantBarProps {
  /** Live air quality telemetry used in the spoken briefing. */
  aqiData: LiveAqiData | null;
  /** Generated personalized smog action plan to summarize aloud. */
  plan: SmogActionPlan | null;
  /** Active tab key; stops playback immediately when tabs change. */
  activeTab: string;
  /** True while a new smog action plan is being generated. */
  isGeneratingPlan: boolean;
  /** Optional handler to launch the real-time Gemini Live voice conversation modal. */
  onOpenLiveVoice?: () => void;
}

/**
 * Multilingual read-aloud bar powered by `/api/voice-briefing` and the Web Speech
 * Synthesis API, paired with a quick launcher for real-time Live Voice conversations.
 */
export function VoiceAssistantBar({
  aqiData,
  plan,
  activeTab,
  isGeneratingPlan,
  onOpenLiveVoice,
}: VoiceAssistantBarProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [language, setLanguage] = useState<VoiceAssistantLanguage>('English (India)');
  const [rate, setRate] = useState<1 | 1.25>(1);
  const [autoReadOnNewPlan, setAutoReadOnNewPlan] = useState<boolean>(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeScript, setActiveScript] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const scriptCacheRef = useRef<Record<string, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPlanIdRef = useRef<string | null>(plan?.generatedAt ?? null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSpeechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!isSpeechSupported) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) {
        setVoices(available);
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [isSpeechSupported]);

  const stopSpeech = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    utteranceRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlaybackState('idle');
  }, []);

  const speakText = useCallback(
    (text: string, targetLang: VoiceAssistantLanguage, targetRate: 1 | 1.25) => {
      if (!isSpeechSupported) {
        setError('Your browser does not support Web Speech synthesis.');
        setPlaybackState('idle');
        return;
      }

      window.speechSynthesis.cancel();
      const langMeta =
        VOICE_LANGUAGE_OPTIONS.find((opt) => opt.value === targetLang) ??
        VOICE_LANGUAGE_OPTIONS[0];

      const currentVoices =
        voices.length > 0 ? voices : window.speechSynthesis.getVoices();
      const matchedVoice = selectMatchingVoice(currentVoices, langMeta.preferredLangs);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = matchedVoice?.lang || langMeta.defaultLangTag;
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
      utterance.rate = targetRate;
      utterance.pitch = 1;

      utterance.onstart = () => {
        setPlaybackState('speaking');
        setError(null);
      };
      utterance.onpause = () => {
        setPlaybackState('paused');
      };
      utterance.onresume = () => {
        setPlaybackState('speaking');
      };
      utterance.onend = () => {
        utteranceRef.current = null;
        setPlaybackState('idle');
      };
      utterance.onerror = (evt) => {
        utteranceRef.current = null;
        if (evt.error === 'canceled' || evt.error === 'interrupted') {
          setPlaybackState('idle');
          return;
        }
        setError('Speech playback could not start on this device.');
        setPlaybackState('idle');
      };

      utteranceRef.current = utterance;
      setPlaybackState('speaking');
      window.speechSynthesis.speak(utterance);
    },
    [isSpeechSupported, voices]
  );

  const fetchAndSpeak = useCallback(
    async (
      targetAqi: LiveAqiData,
      targetPlan: SmogActionPlan,
      targetLang: VoiceAssistantLanguage,
      targetRate: 1 | 1.25
    ) => {
      if (!isSpeechSupported) {
        setError('Voice read-aloud requires browser Web Speech API support.');
        return;
      }

      setError(null);
      const storageKey = buildVoiceBriefingCacheKey(targetPlan.generatedAt, targetLang);
      let cached = scriptCacheRef.current[storageKey];
      if (!cached) {
        const stored = readCachedVoiceScript(storageKey);
        if (stored) {
          cached = stored;
          scriptCacheRef.current[storageKey] = stored;
        }
      }
      if (cached) {
        setActiveScript(cached);
        speakText(cached, targetLang, targetRate);
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setPlaybackState('loading');

      try {
        const resolvedScript = await requestVoiceBriefingScript(
          targetAqi,
          targetPlan,
          targetLang,
          controller.signal
        );

        if (controller.signal.aborted) return;

        scriptCacheRef.current[storageKey] = resolvedScript;
        writeCachedVoiceScript(storageKey, resolvedScript);
        setActiveScript(resolvedScript);
        speakText(resolvedScript, targetLang, targetRate);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const fallbackScript = buildLocalVoiceBriefing(targetAqi, targetPlan, targetLang);
        scriptCacheRef.current[storageKey] = fallbackScript;
        setActiveScript(fallbackScript);
        speakText(fallbackScript, targetLang, targetRate);
      }
    },
    [isSpeechSupported, speakText]
  );

  useEffect(() => {
    if (!isEnabled) {
      stopSpeech();
      setError(null);
    }
  }, [isEnabled, stopSpeech]);

  useEffect(() => {
    stopSpeech();
  }, [activeTab, stopSpeech]);

  useEffect(() => {
    if (isGeneratingPlan) {
      stopSpeech();
    }
  }, [isGeneratingPlan, stopSpeech]);

  useEffect(() => {
    const nextPlanId = plan?.generatedAt ?? null;
    if (nextPlanId === lastPlanIdRef.current) return;

    const hadPreviousPlan = lastPlanIdRef.current !== null;
    lastPlanIdRef.current = nextPlanId;
    stopSpeech();
    setActiveScript(null);

    if (hadPreviousPlan && isEnabled && autoReadOnNewPlan && plan && aqiData) {
      fetchAndSpeak(aqiData, plan, language, rate);
    }
  }, [
    plan,
    aqiData,
    isEnabled,
    autoReadOnNewPlan,
    language,
    rate,
    stopSpeech,
    fetchAndSpeak,
  ]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleLanguageChange = (nextLang: VoiceAssistantLanguage) => {
    stopSpeech();
    setError(null);
    setLanguage(nextLang);
    if (plan) {
      const cached =
        scriptCacheRef.current[buildVoiceBriefingCacheKey(plan.generatedAt, nextLang)];
      setActiveScript(cached ?? null);
    }
  };

  const handleSpeedToggle = (nextRate: 1 | 1.25) => {
    setRate(nextRate);
    if (playbackState === 'speaking' && activeScript) {
      speakText(activeScript, language, nextRate);
    }
  };

  const handlePlayPause = () => {
    if (!plan || !aqiData) return;

    if (playbackState === 'speaking') {
      if (isSpeechSupported) {
        window.speechSynthesis.pause();
        setPlaybackState('paused');
      }
      return;
    }

    if (playbackState === 'paused') {
      if (isSpeechSupported && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setPlaybackState('speaking');
        return;
      }
    }

    fetchAndSpeak(aqiData, plan, language, rate);
  };

  const canPlay = Boolean(plan && aqiData && !isGeneratingPlan && isSpeechSupported);

  return (
    <div
      aria-label="Voice Assistant Read-Aloud controls"
      className="px-5 sm:px-6 py-3 bg-slate-900 dark:bg-slate-950/90 text-slate-100 border-b border-slate-800 space-y-2.5"
    >
      {/* Top Row: Compact Label + Live Conversation + Explicit ON/OFF Toggle Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {isEnabled ? (
            <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          )}
          <span className="text-xs font-semibold text-white whitespace-nowrap">
            Voice Assistant Read-Aloud
          </span>
          {isEnabled && playbackState === 'speaking' && (
            <span
              aria-label="Speaking audio"
              className="inline-flex items-end gap-0.5 h-3.5 ml-1"
            >
              <span
                className="w-0.5 h-3 bg-emerald-400 rounded-full vayu-wave-bar"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-0.5 h-3.5 bg-emerald-300 rounded-full vayu-wave-bar"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-0.5 h-2.5 bg-emerald-400 rounded-full vayu-wave-bar"
                style={{ animationDelay: '300ms' }}
              />
              <span
                className="w-0.5 h-3.5 bg-emerald-300 rounded-full vayu-wave-bar"
                style={{ animationDelay: '450ms' }}
              />
              <span
                className="w-0.5 h-2 bg-emerald-400 rounded-full vayu-wave-bar"
                style={{ animationDelay: '220ms' }}
              />
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onOpenLiveVoice && (
            <button
              type="button"
              onClick={() => {
                stopSpeech();
                onOpenLiveVoice();
              }}
              className="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/40 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <AudioLines className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Live Conversation</span>
            </button>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            onClick={() => setIsEnabled((prev) => !prev)}
            className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-200 hover:text-white cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-md px-1 py-0.5"
          >
            <span>
              Enable Voice Assistant:{' '}
              <strong className={isEnabled ? 'text-emerald-400' : 'text-slate-400'}>
                {isEnabled ? 'On' : 'Off'}
              </strong>
            </span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150 ${
                isEnabled ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                  isEnabled ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Expanded Controls when Voice Assistant is ON */}
      {isEnabled && (
        <div className="pt-2.5 border-t border-slate-800/90 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Language Selector Dropdown */}
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              <label htmlFor="voice-language-select" className="sr-only">
                Voice Assistant Language
              </label>
              <select
                id="voice-language-select"
                value={language}
                onChange={(e) =>
                  handleLanguageChange(e.target.value as VoiceAssistantLanguage)
                }
                className="h-8 pl-2.5 pr-7 bg-slate-950 border border-slate-700 rounded-md text-xs font-medium text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
              >
                {VOICE_LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Playback + Speed Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePlayPause}
                disabled={!canPlay || playbackState === 'loading'}
                className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 rounded-md transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {playbackState === 'loading' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                    <span>Preparing...</span>
                  </>
                ) : playbackState === 'speaking' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{playbackState === 'paused' ? 'Resume' : 'Play'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={stopSpeech}
                disabled={playbackState === 'idle'}
                aria-label="Stop reading aloud"
                className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:text-slate-500 rounded-md transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <Square className="w-3 h-3 fill-current shrink-0" aria-hidden="true" />
                <span>Stop</span>
              </button>

              {/* Speech Speed Toggle (1x / 1.25x) */}
              <div
                role="group"
                aria-label="Speech speed"
                className="inline-flex items-center p-0.5 bg-slate-950 border border-slate-700 rounded-md"
              >
                {([1, 1.25] as const).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    aria-pressed={rate === speed}
                    onClick={() => handleSpeedToggle(speed)}
                    className={`px-2 py-1 text-[11px] font-mono font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      rate === speed
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary Utility Row: Auto-read Option + Script Preview Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-200">
              <input
                type="checkbox"
                checked={autoReadOnNewPlan}
                onChange={(e) => setAutoReadOnNewPlan(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-950 accent-emerald-500 cursor-pointer"
              />
              <span>Auto-read after generating a new plan</span>
            </label>

            {activeScript && (
              <button
                type="button"
                onClick={() => setShowTranscript((prev) => !prev)}
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
              >
                <span>{showTranscript ? 'Hide spoken script' : 'View spoken script'}</span>
                {showTranscript ? (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}

          {showTranscript && activeScript && (
            <p className="p-2.5 rounded-md bg-slate-950/90 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              {activeScript}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
