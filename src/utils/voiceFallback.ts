import type { FamilyProfile, LiveAqiData } from '../types/vayu';
import {
  calculateCombinedParticulateLoad,
  isIndividualSoloProfile,
} from './exposureCalculator.ts';
import {
  buildFallbackWeatherSnapshot,
  calculateFogHazard,
} from './fogHazardCalculator.ts';

/** Active voice conversation transport mode. */
export type VoiceTransportMode = 'gemini-live' | 'browser-speech-fallback';

/** Events that drive transitions between Gemini Live and Browser Speech Fallback. */
export type VoiceTransportEvent =
  | 'live-ready'
  | 'live-error'
  | 'live-closed-unexpectedly'
  | 'live-timeout'
  | 'mic-denied'
  | 'reset';

/** Result of evaluating a voice transport transition. */
export interface VoiceTransportTransition {
  mode: VoiceTransportMode;
  shouldActivateBrowserFallback: boolean;
  notice: string | null;
}

/** Minimal typed browser SpeechRecognition constructor interface (zero `any`). */
export interface BrowserSpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: {
      readonly isFinal: boolean;
      readonly length: number;
      [altIndex: number]: { readonly transcript: string };
    };
  };
}

/** Minimal typed browser SpeechRecognition instance interface. */
export interface BrowserSpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/** Minimal typed browser SpeechRecognition constructor signature. */
export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance;

/** Window-like shape probed for Web Speech API support. */
export interface BrowserSpeechWindowLike {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  speechSynthesis?: Pick<SpeechSynthesis, 'speak' | 'cancel'>;
}

/** Detected browser speech capabilities for zero-failure voice fallback. */
export interface BrowserSpeechSupport {
  recognitionCtor: BrowserSpeechRecognitionConstructor | null;
  hasRecognition: boolean;
  hasSynthesis: boolean;
}

/**
 * Probes the current browser environment for Web Speech Recognition and
 * Speech Synthesis support without using `any` casts.
 */
export function detectBrowserSpeechSupport(
  win?: BrowserSpeechWindowLike | null
): BrowserSpeechSupport {
  const target: BrowserSpeechWindowLike | null =
    win !== undefined
      ? win
      : typeof window !== 'undefined'
        ? (window as unknown as BrowserSpeechWindowLike)
        : null;

  if (!target) {
    return { recognitionCtor: null, hasRecognition: false, hasSynthesis: false };
  }

  const recognitionCtor = target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
  const hasSynthesis = Boolean(target.speechSynthesis);

  return {
    recognitionCtor,
    hasRecognition: recognitionCtor !== null,
    hasSynthesis,
  };
}

/**
 * Deterministic state transition resolver guaranteeing zero-failure voice UX:
 * any Gemini Live WebSocket handshake error, timeout, or unexpected close
 * seamlessly switches to Browser Speech Fallback instead of showing a fatal error.
 */
export function resolveVoiceTransportTransition(
  currentMode: VoiceTransportMode,
  event: VoiceTransportEvent
): VoiceTransportTransition {
  switch (event) {
    case 'reset':
      return {
        mode: 'gemini-live',
        shouldActivateBrowserFallback: false,
        notice: null,
      };
    case 'live-ready':
      return {
        mode: 'gemini-live',
        shouldActivateBrowserFallback: false,
        notice: null,
      };
    case 'live-error':
    case 'live-timeout':
    case 'live-closed-unexpectedly':
      return {
        mode: 'browser-speech-fallback',
        shouldActivateBrowserFallback: true,
        notice:
          'Switched automatically to Browser Voice Mode (Speech Recognition + Gemini + Speech Synthesis) for uninterrupted hands-free assistance.',
      };
    case 'mic-denied':
      return {
        mode: currentMode === 'gemini-live' ? 'browser-speech-fallback' : currentMode,
        shouldActivateBrowserFallback: false,
        notice:
          'Microphone permission is blocked in this browser or frame. You can still type questions below and hear spoken answers.',
      };
  }
}

/**
 * Generates an instant, grounded local spoken reply when both Gemini Live and
 * the server text voice-chat route are unreachable (e.g., fully offline).
 */
export function buildLocalVoiceChatReply(
  userQuery: string,
  aqiData: LiveAqiData | null,
  profile: FamilyProfile
): string {
  const queryLower = userQuery.toLowerCase();
  const city = aqiData?.displayName || 'your area';
  const aqi = aqiData?.current.usAqi ?? 150;
  const pm25 = aqiData?.current.pm25 ?? 60;
  const safeWindow = aqiData?.safeWindow.windowLabel ?? '1:00 PM to 4:00 PM';

  if (queryLower.includes('fog') || queryLower.includes('drive') || queryLower.includes('pothole') || queryLower.includes('commute')) {
    const weather = aqiData?.weather ?? buildFallbackWeatherSnapshot(pm25);
    const fog = calculateFogHazard({
      temperatureC: weather.temperatureC,
      dewPointC: weather.dewPointC,
      relativeHumidityPct: weather.relativeHumidityPct,
      windSpeedKmh: weather.windSpeedKmh,
      pm25,
      commute: profile.commute,
      reportedVisibilityMeters: weather.reportedVisibilityMeters,
    });
    return `In ${city}, current road conditions show ${fog.fogSeverity} with roughly ${fog.estimatedVisibilityMeters} meters of visibility. For your ${profile.commute} commute, keep speed under ${fog.safeSpeedCapKmh} kilometers per hour, use low-beam headlights, and allow ${fog.stoppingDistanceMeters} meters of braking room for potholes.`;
  }

  if (queryLower.includes('breath') || queryLower.includes('yoga') || queryLower.includes('lung') || queryLower.includes('smoke') || queryLower.includes('cigar')) {
    const exposure = calculateCombinedParticulateLoad(pm25, profile.cigarettesSmokedToday);
    if (exposure.hasSmokingExposure) {
      return `With ${exposure.cigarettesCount} cigarettes logged today plus live PM 2.5 at ${pm25.toFixed(1)} micrograms per cubic meter, start with warm water hydration and plain steam inhalation, avoid outdoor cardio for two hours, and practice gentle four-second inhale, six-second pursed-lip breathing indoors.`;
    }
    return `Try three minutes of gentle indoor Nadi Shodhana or pursed-lip breathing: inhale slowly through your nose for four seconds and exhale softly for six seconds, avoiding rapid forceful breaths while AQI is ${aqi}.`;
  }

  if (queryLower.includes('indoor') || queryLower.includes('home') || queryLower.includes('purifier') || queryLower.includes('window')) {
    return `For your ${profile.homeSetup} setup in ${city}, keep exterior windows sealed during morning and evening inversions, wet-mop floors instead of dry sweeping, and cross-ventilate briefly only during ${safeWindow}.`;
  }

  const isSolo = isIndividualSoloProfile(profile.members);
  if (isSolo) {
    return `In ${city}, the live US AQI is ${aqi} with PM 2.5 at ${pm25.toFixed(1)} micrograms per cubic meter. The safest outdoor window for your solo errands or workout today is ${safeWindow}. Wear a snug N95 mask on your ${profile.commute} commute and keep your room air sealed during peak smog hours.`;
  }

  return `In ${city}, the live US AQI is ${aqi} with PM 2.5 at ${pm25.toFixed(1)} micrograms per cubic meter. The safest outdoor window today is ${safeWindow}. For ${profile.members.join(', ')}, wear a snug N95 mask outdoors and keep indoor air sealed during peak smog hours.`;
}
