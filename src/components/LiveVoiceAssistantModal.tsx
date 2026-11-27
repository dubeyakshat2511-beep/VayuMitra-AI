import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Info,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import type { FamilyProfile, LiveAqiData, SmogActionPlan } from '../types/vayu';
import {
  computeAudioLevel,
  downsampleFloat32,
  float32ToPcm16Base64,
  LIVE_INPUT_SAMPLE_RATE,
  LIVE_OUTPUT_SAMPLE_RATE,
  pcm16Base64ToFloat32,
} from '../utils/liveAudio';
import {
  detectBrowserSpeechSupport,
  resolveVoiceTransportTransition,
  type BrowserSpeechRecognitionInstance,
  type VoiceTransportMode,
} from '../utils/voiceFallback';
import { sanitizeHazardReportText } from '../utils/requestValidation';
import { requestVoiceChatReply } from '../services/vayuApiService';

const VOICE_OPTIONS = [
  { name: 'Zephyr', tone: 'Warm & balanced' },
  { name: 'Kore', tone: 'Clear & calm' },
  { name: 'Puck', tone: 'Bright & upbeat' },
  { name: 'Charon', tone: 'Deep & steady' },
  { name: 'Fenrir', tone: 'Crisp & direct' },
] as const;

type LiveVoiceOption = (typeof VOICE_OPTIONS)[number]['name'];
type SessionStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const LIVE_HANDSHAKE_TIMEOUT_MS = 6000;

const STARTER_PROMPTS = [
  'Is it safe for my family to go outside right now?',
  'What is my safe fog speed cap and pothole risk today?',
  'Guide me through a 1-minute calming lung-clearing breath.',
];

/** Props accepted by {@link LiveVoiceAssistantModal}. */
export interface LiveVoiceAssistantModalProps {
  /** Controls modal visibility. */
  isOpen: boolean;
  /** Closes the modal and tears down active audio/WebSocket/speech sessions. */
  onClose: () => void;
  /** Live Open-Meteo AQI & weather telemetry payload. */
  aqiData: LiveAqiData | null;
  /** Current household & commute profile. */
  profile: FamilyProfile;
  /** Active generated smog action plan, if available. */
  plan: SmogActionPlan | null;
}

/**
 * Zero-failure real-time voice conversation modal powered by the Gemini Live API
 * (`gemini-3.8-live`, 16kHz PCM input / 24kHz PCM output) with automatic fallback
 * to Web Speech Recognition + Gemini text response + `window.speechSynthesis`.
 */
export function LiveVoiceAssistantModal({
  isOpen,
  onClose,
  aqiData,
  profile,
  plan,
}: LiveVoiceAssistantModalProps) {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [transportMode, setTransportMode] = useState<VoiceTransportMode>('gemini-live');
  const [selectedVoice, setSelectedVoice] = useState<LiveVoiceOption>('Zephyr');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState<string>('');

  // Refs prevent stale closures inside onaudioprocess, WebSocket, and SpeechRecognition callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const handshakeTimerRef = useRef<number | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const isMutedRef = useRef<boolean>(false);
  const transportModeRef = useRef<VoiceTransportMode>('gemini-live');
  const isSessionActiveRef = useRef<boolean>(false);
  const nextStartTimeRef = useRef<number>(0);
  const activeOutputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const currentRoleRef = useRef<'user' | 'assistant' | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transportModeRef.current = transportMode;
  }, [transportMode]);

  useEffect(() => {
    transcriptRef.current = transcript;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const clearHandshakeTimer = useCallback(() => {
    if (handshakeTimerRef.current !== null) {
      window.clearTimeout(handshakeTimerRef.current);
      handshakeTimerRef.current = null;
    }
  }, []);

  const stopScheduledAudio = useCallback(() => {
    for (const node of activeOutputSourcesRef.current) {
      try {
        node.stop();
      } catch {
        // Already stopped
      }
    }
    activeOutputSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const stopLivePcmPipeline = useCallback(() => {
    clearHandshakeTimer();
    stopScheduledAudio();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      void inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      void outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'stop' }));
        } catch {
          // Ignore send errors on teardown
        }
      }
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
    }
  }, [clearHandshakeTimer, stopScheduledAudio]);

  const stopBrowserSpeechFallback = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // Ignore abort errors
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const appendTranscriptChunk = useCallback((role: 'user' | 'assistant', chunk: string) => {
    if (!chunk.trim()) return;

    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && currentRoleRef.current === role) {
        const needsSpace =
          last.text.length > 0 &&
          !/\s$/.test(last.text) &&
          !/^[\s.,!?;:']/.test(chunk);
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${needsSpace ? ' ' : ''}${chunk}`.replace(/\s+/g, ' '),
        };
        return updated;
      }

      currentRoleRef.current = role;
      return [
        ...prev,
        {
          id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          text: chunk.trim(),
        },
      ];
    });
  }, []);

  const schedulePcmOutput = useCallback((base64Pcm: string) => {
    const outputCtx = outputAudioCtxRef.current;
    if (!outputCtx) return;

    if (outputCtx.state === 'suspended') {
      void outputCtx.resume();
    }

    const samples = pcm16Base64ToFloat32(base64Pcm);
    if (samples.length === 0) return;

    const audioBuffer = outputCtx.createBuffer(1, samples.length, LIVE_OUTPUT_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(samples);

    const source = outputCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputCtx.destination);

    const now = outputCtx.currentTime;
    const startTime = Math.max(now + 0.02, nextStartTimeRef.current);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    activeOutputSourcesRef.current.add(source);
    setStatus('speaking');

    source.onended = () => {
      activeOutputSourcesRef.current.delete(source);
      if (
        activeOutputSourcesRef.current.size === 0 &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        setStatus('listening');
      }
    };

    source.start(startTime);
  }, []);

  const startBrowserRecognitionLoop = useCallback(
    (onSpokenTurn: (spokenText: string) => void) => {
      const support = detectBrowserSpeechSupport();
      if (!support.recognitionCtor || isMutedRef.current || !isSessionActiveRef.current) {
        setStatus('listening');
        return;
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }

      try {
        const recognition = new support.recognitionCtor();
        recognition.lang = profile.language === 'Hinglish/Hindi' ? 'en-IN' : 'en-IN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
          if (isSessionActiveRef.current) {
            setStatus('listening');
          }
        };

        recognition.onresult = (event) => {
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal && res[0]?.transcript) {
              finalText += ` ${res[0].transcript}`;
            }
          }
          const cleaned = finalText.trim();
          if (cleaned) {
            onSpokenTurn(cleaned);
          }
        };

        recognition.onerror = (evt) => {
          if (evt.error === 'not-allowed' || evt.error === 'service-not-allowed') {
            const transition = resolveVoiceTransportTransition(
              transportModeRef.current,
              'mic-denied'
            );
            setNotice(transition.notice);
            setStatus('listening');
          }
        };

        recognition.onend = () => {
          if (
            isSessionActiveRef.current &&
            transportModeRef.current === 'browser-speech-fallback' &&
            !isMutedRef.current &&
            recognitionRef.current === recognition
          ) {
            // Restart recognition softly when idle listening
            window.setTimeout(() => {
              if (
                isSessionActiveRef.current &&
                transportModeRef.current === 'browser-speech-fallback' &&
                !isMutedRef.current &&
                !(typeof window !== 'undefined' && window.speechSynthesis?.speaking)
              ) {
                try {
                  recognition.start();
                } catch {
                  // Already running or blocked
                }
              }
            }, 350);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        setStatus('listening');
      }
    },
    [profile.language]
  );

  const handleBrowserFallbackTurn = useCallback(
    async (userMessage: string) => {
      const trimmed = userMessage.trim();
      if (!trimmed) return;

      // Pause recognition while generating & speaking reply to avoid echo
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore
        }
      }

      currentRoleRef.current = null;
      appendTranscriptChunk('user', trimmed);
      currentRoleRef.current = null;
      setStatus('thinking');

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      try {
        const reply = await requestVoiceChatReply(
          trimmed,
          transcriptRef.current.map((entry) => ({ role: entry.role, text: entry.text })),
          aqiData,
          profile,
          plan?.headlineAdvisory ?? null,
          controller.signal
        );

        if (controller.signal.aborted || !isSessionActiveRef.current) return;

        currentRoleRef.current = null;
        appendTranscriptChunk('assistant', reply);
        currentRoleRef.current = null;

        const support = detectBrowserSpeechSupport();
        if (support.hasSynthesis && typeof window !== 'undefined') {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(reply);
          utterance.lang = 'en-IN';
          utterance.rate = 1;
          utterance.onstart = () => setStatus('speaking');
          utterance.onend = () => {
            if (isSessionActiveRef.current) {
              setStatus('listening');
              startBrowserRecognitionLoop((spoken) => {
                void handleBrowserFallbackTurn(spoken);
              });
            }
          };
          utterance.onerror = () => {
            if (isSessionActiveRef.current) {
              setStatus('listening');
            }
          };
          setStatus('speaking');
          window.speechSynthesis.speak(utterance);
        } else {
          setStatus('listening');
          startBrowserRecognitionLoop((spoken) => {
            void handleBrowserFallbackTurn(spoken);
          });
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setStatus('listening');
      }
    },
    [
      aqiData,
      appendTranscriptChunk,
      plan?.headlineAdvisory,
      profile,
      startBrowserRecognitionLoop,
    ]
  );

  const activateBrowserSpeechFallback = useCallback(
    (event: 'live-error' | 'live-timeout' | 'live-closed-unexpectedly' | 'mic-denied') => {
      stopLivePcmPipeline();

      const transition = resolveVoiceTransportTransition(transportModeRef.current, event);
      transportModeRef.current = transition.mode;
      setTransportMode(transition.mode);
      setNotice(transition.notice);
      isSessionActiveRef.current = true;
      setStatus('listening');

      if (transition.shouldActivateBrowserFallback && !isMutedRef.current) {
        startBrowserRecognitionLoop((spoken) => {
          void handleBrowserFallbackTurn(spoken);
        });
      }
    },
    [handleBrowserFallbackTurn, startBrowserRecognitionLoop, stopLivePcmPipeline]
  );

  const teardownSession = useCallback(
    (resetStatus: boolean = true) => {
      isSessionActiveRef.current = false;
      stopLivePcmPipeline();
      stopBrowserSpeechFallback();
      currentRoleRef.current = null;
      setMicLevel(0);
      setIsMuted(false);
      if (resetStatus) {
        setStatus('idle');
      }
    },
    [stopBrowserSpeechFallback, stopLivePcmPipeline]
  );

  useEffect(() => {
    if (!isOpen) {
      teardownSession(true);
      setNotice(null);
    }
  }, [isOpen, teardownSession]);

  useEffect(() => {
    return () => {
      teardownSession(false);
    };
  }, [teardownSession]);

  const startConversation = useCallback(async () => {
    teardownSession(false);
    setNotice(null);
    transportModeRef.current = 'gemini-live';
    setTransportMode('gemini-live');
    isSessionActiveRef.current = true;
    setStatus('connecting');

    // Step 1: Request microphone access cleanly with iframe-safe error handling
    let stream: MediaStream;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      activateBrowserSpeechFallback('mic-denied');
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
    } catch {
      activateBrowserSpeechFallback('mic-denied');
      return;
    }

    // Step 2: Prepare 16kHz input and 24kHz output AudioContexts and attempt Gemini Live WebSocket
    try {
      const inputAudioCtx = new AudioContext({ sampleRate: LIVE_INPUT_SAMPLE_RATE });
      const outputAudioCtx = new AudioContext({ sampleRate: LIVE_OUTPUT_SAMPLE_RATE });
      inputAudioCtxRef.current = inputAudioCtx;
      outputAudioCtxRef.current = outputAudioCtx;

      if (inputAudioCtx.state === 'suspended') await inputAudioCtx.resume();
      if (outputAudioCtx.state === 'suspended') await outputAudioCtx.resume();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      let liveReady = false;

      // Guard against stalled handshakes in sandboxed networks -> seamless browser fallback
      handshakeTimerRef.current = window.setTimeout(() => {
        if (!liveReady && isSessionActiveRef.current) {
          activateBrowserSpeechFallback('live-timeout');
        }
      }, LIVE_HANDSHAKE_TIMEOUT_MS);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'setup',
            voiceName: selectedVoice,
            aqiData,
            profile,
            planHeadline: plan?.headlineAdvisory ?? null,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg: {
          type?: string;
          data?: string;
          text?: string;
          reason?: string;
          message?: string;
        };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          liveReady = true;
          clearHandshakeTimer();
          setStatus('listening');
          setNotice(null);

          // Begin streaming 16kHz mono 16-bit PCM audio frames
          const source = inputAudioCtx.createMediaStreamSource(stream);
          const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
          sourceNodeRef.current = source;
          processorRef.current = processor;

          const silentGain = inputAudioCtx.createGain();
          silentGain.gain.value = 0;

          processor.onaudioprocess = (audioEvent) => {
            if (wsRef.current?.readyState !== WebSocket.OPEN) return;
            if (isMutedRef.current) {
              setMicLevel(0);
              return;
            }

            const rawChannel = audioEvent.inputBuffer.getChannelData(0);
            setMicLevel(computeAudioLevel(rawChannel));

            const pcm16k = downsampleFloat32(
              rawChannel,
              inputAudioCtx.sampleRate,
              LIVE_INPUT_SAMPLE_RATE
            );
            const base64Audio = float32ToPcm16Base64(pcm16k);
            wsRef.current.send(
              JSON.stringify({
                type: 'audio',
                data: base64Audio,
              })
            );
          };

          source.connect(processor);
          processor.connect(silentGain);
          silentGain.connect(inputAudioCtx.destination);
          return;
        }

        if (msg.type === 'audio' && msg.data) {
          schedulePcmOutput(msg.data);
          return;
        }

        if (msg.type === 'inputTranscript' && msg.text) {
          appendTranscriptChunk('user', msg.text);
          return;
        }

        if (msg.type === 'outputTranscript' && msg.text) {
          appendTranscriptChunk('assistant', msg.text);
          return;
        }

        if (msg.type === 'interrupted') {
          stopScheduledAudio();
          currentRoleRef.current = null;
          setStatus('listening');
          return;
        }

        if (msg.type === 'turnComplete') {
          currentRoleRef.current = null;
          if (activeOutputSourcesRef.current.size === 0) {
            setStatus('listening');
          }
          return;
        }

        if (msg.type === 'live_unavailable' || msg.type === 'error') {
          activateBrowserSpeechFallback('live-error');
          return;
        }

        if (msg.type === 'closed' && isSessionActiveRef.current) {
          if (!liveReady) {
            activateBrowserSpeechFallback('live-closed-unexpectedly');
          } else {
            teardownSession(true);
          }
        }
      };

      ws.onerror = () => {
        if (isSessionActiveRef.current) {
          activateBrowserSpeechFallback('live-error');
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws && isSessionActiveRef.current) {
          if (!liveReady) {
            activateBrowserSpeechFallback('live-closed-unexpectedly');
          } else {
            teardownSession(true);
          }
        }
      };
    } catch {
      activateBrowserSpeechFallback('live-error');
    }
  }, [
    activateBrowserSpeechFallback,
    aqiData,
    appendTranscriptChunk,
    clearHandshakeTimer,
    plan?.headlineAdvisory,
    profile,
    schedulePcmOutput,
    selectedVoice,
    stopScheduledAudio,
    teardownSession,
  ]);

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const nextMuted = !prev;
      isMutedRef.current = nextMuted;
      if (transportModeRef.current === 'browser-speech-fallback') {
        if (nextMuted) {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch {
              // Ignore
            }
          }
        } else if (isSessionActiveRef.current) {
          startBrowserRecognitionLoop((spoken) => {
            void handleBrowserFallbackTurn(spoken);
          });
        }
      }
      return nextMuted;
    });
  };

  const sendTextTurn = (promptText: string) => {
    const trimmed = sanitizeHazardReportText(promptText, 500);
    if (!trimmed) return;

    if (
      transportModeRef.current === 'gemini-live' &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      currentRoleRef.current = null;
      appendTranscriptChunk('user', trimmed);
      currentRoleRef.current = null;
      wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
      setTextInput('');
      return;
    }

    // Works seamlessly in Browser Speech Fallback mode (and even if user types directly!)
    if (!isSessionActiveRef.current) {
      isSessionActiveRef.current = true;
      transportModeRef.current = 'browser-speech-fallback';
      setTransportMode('browser-speech-fallback');
    }
    setTextInput('');
    void handleBrowserFallbackTurn(trimmed);
  };

  const handleTextSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendTextTurn(textInput);
  };

  if (!isOpen) return null;

  const isConnected = status === 'listening' || status === 'thinking' || status === 'speaking';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-voice-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 text-white border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
              <AudioLines className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="live-voice-dialog-title"
                  className="text-base font-bold tracking-tight text-white truncate"
                >
                  VayuMitra Live Voice Conversation
                </h2>
                {isConnected && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/70"
                  >
                    {transportMode === 'gemini-live' ? 'Live Audio' : 'Browser Voice Mode'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                {aqiData
                  ? `${aqiData.displayName} · US AQI ${aqiData.current.usAqi} · PM2.5 ${aqiData.current.pm25.toFixed(1)} µg/m³`
                  : 'Real-time smog, fog & respiratory guidance'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              teardownSession(true);
              onClose();
            }}
            aria-label="Close live voice conversation"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Voice Stage & Status Visualizer */}
        <div className="px-5 py-5 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full transition-transform duration-150 ${
                  status === 'speaking'
                    ? 'bg-emerald-500/25 scale-110 animate-pulse'
                    : status === 'listening' && !isMuted
                      ? 'bg-emerald-500/20'
                      : 'bg-slate-200/70 dark:bg-slate-800'
                }`}
                style={
                  status === 'listening' && !isMuted
                    ? { transform: `scale(${1 + micLevel * 0.35})` }
                    : undefined
                }
              />
              <div
                className={`relative w-12 h-12 rounded-full flex items-center justify-center border ${
                  status === 'speaking'
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : status === 'listening'
                      ? isMuted
                        ? 'bg-amber-600 border-amber-400 text-white'
                        : 'bg-emerald-600 border-emerald-400 text-white'
                      : status === 'connecting' || status === 'thinking'
                        ? 'bg-slate-800 border-slate-600 text-emerald-300'
                        : 'bg-slate-900 dark:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {status === 'connecting' || status === 'thinking' ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                ) : status === 'speaking' ? (
                  <Volume2 className="w-5 h-5" aria-hidden="true" />
                ) : isMuted ? (
                  <MicOff className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Mic className="w-5 h-5" aria-hidden="true" />
                )}
              </div>
            </div>

            <div className="space-y-0.5" aria-live="polite">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {status === 'idle' && 'Ready for hands-free voice advice'}
                {status === 'connecting' && 'Connecting microphone & live audio...'}
                {status === 'thinking' && 'Preparing spoken guidance...'}
                {status === 'listening' &&
                  (isMuted
                    ? 'Microphone muted'
                    : transportMode === 'gemini-live'
                      ? 'Listening — speak naturally anytime'
                      : 'Listening via Browser Voice — speak or type below')}
                {status === 'speaking' && 'VayuMitra AI is speaking'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Grounded in live PM2.5, winter fog visibility, household members, and commute profile.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isConnected && status !== 'connecting' ? (
              <button
                type="button"
                onClick={startConversation}
                aria-label="Start live voice conversation"
                className="h-10 px-4 inline-flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Start Conversation</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  disabled={status === 'connecting'}
                  aria-pressed={isMuted}
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`h-10 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isMuted
                      ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {isMuted ? (
                    <>
                      <MicOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Unmute</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Mute</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => teardownSession(true)}
                  aria-label="End voice conversation"
                  className="h-10 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <PhoneOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>End</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Voice Persona Selector (when idle) */}
        {!isConnected && status !== 'connecting' && (
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Assistant Voice
            </span>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Select voice persona">
              {VOICE_OPTIONS.map((v) => {
                const active = selectedVoice === v.name;
                return (
                  <button
                    key={v.name}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Select ${v.name} voice (${v.tone})`}
                    onClick={() => setSelectedVoice(v.name)}
                    title={v.tone}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
                    }`}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Calm Info Notice (e.g. Automatic Browser Voice Fallback or Mic Permission Notice) */}
        {notice && (
          <div
            role="status"
            aria-live="polite"
            className="mx-5 mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs flex items-start gap-2.5"
          >
            <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        {/* Live Transcript Feed */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[200px] max-h-[340px]">
          {transcript.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center py-4 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
                Click <strong className="text-slate-900 dark:text-slate-100">Start Conversation</strong> to speak hands-free, or click any question below to hear an immediate spoken answer.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendTextTurn(prompt)}
                    className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          ) : (
            transcript.map((entry) => (
              <div
                key={entry.id}
                className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    entry.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-75 mb-0.5">
                    {entry.role === 'user' ? 'You' : 'VayuMitra AI'}
                  </p>
                  <p>{entry.text}</p>
                </div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Always-Ready Follow-Up Input (works in both Live & Browser Fallback modes) */}
        <form
          onSubmit={handleTextSubmit}
          className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
        >
          <label htmlFor="live-voice-text-input" className="sr-only">
            Type a question for spoken reply
          </label>
          <input
            id="live-voice-text-input"
            type="text"
            maxLength={500}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Speak aloud or type a question for a spoken reply..."
            className="flex-1 h-10 px-3.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || status === 'thinking'}
            aria-label="Send prompt for spoken reply"
            className="h-10 px-3.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
