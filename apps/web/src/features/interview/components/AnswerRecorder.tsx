import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeepgramSTT } from "../utils/deepgram";
import { getAudioStream } from "../utils/mediaHelpers";
import { normalizeTechnicalSpeech } from "../utils/speechNormalizer";

const SILENCE_TIMEOUT_MS = 8000;
const COUNTDOWN_TENTHS = Math.floor(SILENCE_TIMEOUT_MS / 100);
const THINKING_TIMEOUT_MS = 10000;
const THINKING_TENTHS = Math.floor(THINKING_TIMEOUT_MS / 100);
const SPEECH_STREAK_REQUIRED = 3;

function normalizeWordsOnly(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface AnswerRecorderState {
  transcript: string;
  isThinking: boolean;
  silenceCountdown: number;
  countdownTenths: number;
  thinkingCountdown: number;
  thinkingCountdownTenths: number;
  isRecording: boolean;
}

interface AnswerRecorderProps {
  onAnswerComplete: (text: string, audioBlob?: Blob) => void;
  onStateChange?: (state: AnswerRecorderState) => void;
  /** If provided, AnswerRecorder draws the waveform onto this external canvas (used by ChatInputBar) */
  externalCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  isAiSpeaking: boolean;
  expired?: boolean;
  endEarly?: boolean;
  audioStream?: MediaStream | null;
  stopAndSubmitRef?: React.MutableRefObject<((overrideText?: string) => void) | null>;
  syncTypedTextRef?: React.MutableRefObject<((text: string) => void) | null>;
}

export function AnswerRecorder({
  onAnswerComplete,
  onStateChange,
  externalCanvasRef,
  isAiSpeaking,
  expired,
  endEarly,
  audioStream,
  stopAndSubmitRef,
  syncTypedTextRef,
}: AnswerRecorderProps) {
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [silenceCountdown, setSilenceCountdown] = useState(COUNTDOWN_TENTHS);
  const [thinkingCountdown, setThinkingCountdown] = useState(THINKING_TENTHS);
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDeepgramConnected, setIsDeepgramConnected] = useState(false);

  const isRecordingRef = useRef(false);
  const transcriptRef = useRef("");
  const audioBlobRef = useRef<Blob | null>(null);
  const submittedRef = useRef(false);
  const shouldSubmitRef = useRef(false);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownDeadlineRef = useRef<number>(0);
  const postSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopSubmitFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStopAndSubmitRef = useRef<() => void>(() => {});
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isThinkingRef = useRef(false);
  const generationRef = useRef(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const deepgramRef = useRef<DeepgramSTT | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const audioActivityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVoiceActiveRef = useRef(false);
  const isCountdownActiveRef = useRef(false);
  const hasCandidateSpokenRef = useRef(false);
  const accumulatedWebSpeechRef = useRef("");

  const clearAudioActivityMonitor = useCallback(() => {
    if (audioActivityIntervalRef.current) {
      clearInterval(audioActivityIntervalRef.current);
      audioActivityIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    isVoiceActiveRef.current = false;
  }, []);

  const clearThinkingTimer = useCallback(() => {
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    isThinkingRef.current = false;
    setIsThinking(false);
    setThinkingCountdown(THINKING_TENTHS);
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (postSpeechTimerRef.current) {
      clearTimeout(postSpeechTimerRef.current);
      postSpeechTimerRef.current = null;
    }
    countdownDeadlineRef.current = 0;
    isCountdownActiveRef.current = false;
    setSilenceCountdown(COUNTDOWN_TENTHS);
  }, []);

  const drawWaveform = useCallback(() => {
    if (!isRecordingRef.current) return;
    const analyser = analyserRef.current;
    if (!analyser) return;
    const canvas = externalCanvasRef?.current ?? canvasRef.current;
    if (!canvas) {
      // Wait for ChatInputBar canvas mount rather than permanently exiting the animation loop
      rafRef.current = requestAnimationFrame(drawWaveform);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(24, 26, 32, 0.4)";
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3b82f6";
    ctx.beginPath();
    const sliceWidth = w / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = ((dataArray[i] - 128) * 1.8) / 128.0;
      const clamped = Math.max(-1, Math.min(1, normalized));
      const y = h / 2 + clamped * (h / 2 - 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
    rafRef.current = requestAnimationFrame(drawWaveform);
  }, [externalCanvasRef]);

  const doSubmit = useCallback(
    (text: string, blob?: Blob) => {
      if (submittedRef.current) return;
      submittedRef.current = true;

      onAnswerComplete(text || "Candidate responded via voice.", blob);

      setTranscript("");
      transcriptRef.current = "";
      hasCandidateSpokenRef.current = false;
      setDuration(0);
      audioBlobRef.current = null;
    },
    [onAnswerComplete],
  );

  const stopSTTEngines = useCallback(() => {
    if (deepgramRef.current) {
      deepgramRef.current.stop();
      deepgramRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        (recognitionRef.current as { abort: () => void }).abort();
      } catch {}
      recognitionRef.current = null;
    }
    setIsDeepgramConnected(false);
  }, []);

  const stopAndSubmit = useCallback(
    (overrideText?: string) => {
      if (submittedRef.current) return;
      shouldSubmitRef.current = true;

      clearThinkingTimer();
      clearCountdown();
      if (postSpeechTimerRef.current) {
        clearTimeout(postSpeechTimerRef.current);
        postSpeechTimerRef.current = null;
      }
      isRecordingRef.current = false;
      setIsRecording(false);
      accumulatedWebSpeechRef.current = "";

      if (overrideText?.trim()) {
        transcriptRef.current = overrideText.trim();
        setTranscript(transcriptRef.current);
      } else if (!transcriptRef.current.trim()) {
        transcriptRef.current = "Candidate submitted response.";
        setTranscript(transcriptRef.current);
      }

      const activeRecorder = mediaRecorderRef.current;
      if (activeRecorder && activeRecorder.state !== "inactive") {
        mediaRecorderRef.current = null;
        try {
          activeRecorder.stop();
          // Fallback in case MediaRecorder.onstop stalls in the browser
          stopSubmitFallbackRef.current = setTimeout(() => {
            stopSubmitFallbackRef.current = null;
            if (!submittedRef.current && shouldSubmitRef.current) {
              shouldSubmitRef.current = false;
              doSubmit(transcriptRef.current, audioBlobRef.current || undefined);
            }
          }, 600);
        } catch {
          shouldSubmitRef.current = false;
          doSubmit(transcriptRef.current, audioBlobRef.current || undefined);
        }
      } else {
        mediaRecorderRef.current = null;
        shouldSubmitRef.current = false;
        doSubmit(transcriptRef.current, audioBlobRef.current || undefined);
      }

      stopSTTEngines();

      if (intervalRef.current) clearInterval(intervalRef.current);
      clearAudioActivityMonitor();
      cancelAnimationFrame(rafRef.current);
    },
    [clearAudioActivityMonitor, clearCountdown, clearThinkingTimer, doSubmit, stopSTTEngines],
  );

  useEffect(() => {
    latestStopAndSubmitRef.current = () => stopAndSubmit();
    if (stopAndSubmitRef) {
      stopAndSubmitRef.current = stopAndSubmit;
    }
    return () => {
      if (stopAndSubmitRef) {
        stopAndSubmitRef.current = null;
      }
    };
  }, [stopAndSubmitRef, stopAndSubmit]);

  const stopRecordingSilently = useCallback(() => {
    shouldSubmitRef.current = false;
    clearThinkingTimer();
    clearCountdown();
    isRecordingRef.current = false;
    setIsRecording(false);
    accumulatedWebSpeechRef.current = "";
    setTranscript("");
    transcriptRef.current = "";
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;

    stopSTTEngines();

    if (intervalRef.current) clearInterval(intervalRef.current);
    clearAudioActivityMonitor();
    cancelAnimationFrame(rafRef.current);
  }, [clearAudioActivityMonitor, clearCountdown, clearThinkingTimer, stopSTTEngines]);

  const startThinkingTimer = useCallback(() => {
    clearThinkingTimer();
    if (!isRecordingRef.current) return;

    isThinkingRef.current = true;
    setIsThinking(true);
    setThinkingCountdown(THINKING_TENTHS);

    thinkingTimeoutRef.current = setTimeout(() => {
      if (isThinkingRef.current && isRecordingRef.current) {
        // Transition from thinking period directly into active recording (never submit empty)
        clearThinkingTimer();
      }
    }, THINKING_TIMEOUT_MS);

    thinkingIntervalRef.current = setInterval(() => {
      setThinkingCountdown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 100);
  }, [clearThinkingTimer]);

  const startCountdown = useCallback(() => {
    if (isThinkingRef.current) {
      clearThinkingTimer();
    }

    if (isCountdownActiveRef.current) return;
    if (!isRecordingRef.current) return;
    if (transcriptRef.current.trim().length === 0) return;

    isCountdownActiveRef.current = true;
    countdownDeadlineRef.current = Date.now() + SILENCE_TIMEOUT_MS;
    setSilenceCountdown(COUNTDOWN_TENTHS);

    silenceTimeoutRef.current = setTimeout(() => {
      if (transcriptRef.current.trim().length > 0) {
        latestStopAndSubmitRef.current();
      }
    }, SILENCE_TIMEOUT_MS + 50);

    countdownIntervalRef.current = setInterval(() => {
      const remainingMs = Math.max(0, countdownDeadlineRef.current - Date.now());
      const remainingTenths = Math.ceil(remainingMs / 100);
      setSilenceCountdown(remainingTenths);
      if (remainingMs <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        if (transcriptRef.current.trim().length > 0) {
          latestStopAndSubmitRef.current();
        }
      }
    }, 100);
  }, [clearThinkingTimer]);

  const schedulePostSpeechCountdown = useCallback(
    (delayMs = 1500) => {
      if (postSpeechTimerRef.current) {
        clearTimeout(postSpeechTimerRef.current);
      }
      postSpeechTimerRef.current = setTimeout(() => {
        postSpeechTimerRef.current = null;
        if (
          isRecordingRef.current &&
          !isVoiceActiveRef.current &&
          hasCandidateSpokenRef.current &&
          transcriptRef.current.trim().length > 0
        ) {
          startCountdown();
        }
      }, delayMs);
    },
    [startCountdown],
  );

  useEffect(() => {
    if (!syncTypedTextRef) return;
    syncTypedTextRef.current = (typed: string) => {
      transcriptRef.current = typed;
      setTranscript(typed);
      hasCandidateSpokenRef.current = typed.trim().length > 0;
      if (isThinkingRef.current) {
        clearThinkingTimer();
      }
      clearCountdown();
      if (typed.trim().length > 0) {
        schedulePostSpeechCountdown(1200);
      }
    };
    return () => {
      syncTypedTextRef.current = null;
    };
  }, [clearCountdown, clearThinkingTimer, schedulePostSpeechCountdown, syncTypedTextRef]);

  const applyNormalizedTranscript = useCallback(
    (normalized: string) => {
      if (!normalized.trim()) return;
      const prevTranscript = transcriptRef.current;
      const prevWords = normalizeWordsOnly(prevTranscript);
      const nextWords = normalizeWordsOnly(normalized);
      const wordsGrew =
        nextWords !== prevWords && (nextWords.length > prevWords.length || prevWords.length === 0);

      // Retain longer or monotonically update to prevent transcript clobbering
      if (
        normalized.trim().length >= prevTranscript.trim().length ||
        prevTranscript.trim().length === 0
      ) {
        setTranscript(normalized);
        transcriptRef.current = normalized;
      }

      if (wordsGrew) {
        hasCandidateSpokenRef.current = true;
        if (isThinkingRef.current) {
          clearThinkingTimer();
        }
        // Reset silence countdown when genuinely new words arrive, then start countdown after brief pause
        clearCountdown();
        schedulePostSpeechCountdown(1500);
      }
    },
    [clearCountdown, clearThinkingTimer, schedulePostSpeechCountdown],
  );

  const startWebSpeechFallback = useCallback(
    (gen: number) => {
      type SpeechRecClass = new () => {
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        lang: string;
        onresult:
          | ((event: {
              results: Array<Array<{ transcript: string }> & { isFinal?: boolean }>;
            }) => void)
          | null;
        onerror: ((event: { error: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        abort: () => void;
      };

      const SpeechRecognitionAPI =
        typeof window !== "undefined"
          ? (window as unknown as { SpeechRecognition?: SpeechRecClass }).SpeechRecognition ||
            (window as unknown as { webkitSpeechRecognition?: SpeechRecClass })
              .webkitSpeechRecognition
          : null;
      if (!SpeechRecognitionAPI) {
        return;
      }

      const launchInstance = () => {
        if (gen !== generationRef.current || !isRecordingRef.current) return;
        try {
          if (recognitionRef.current) {
            try {
              (recognitionRef.current as { abort: () => void }).abort();
            } catch {}
            recognitionRef.current = null;
          }

          const recognition = new SpeechRecognitionAPI();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;
          recognition.lang =
            typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

          recognition.onresult = (event) => {
            if (gen !== generationRef.current) return;

            let finalPart = "";
            let interimPart = "";
            for (let i = 0; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                finalPart += `${event.results[i][0].transcript} `;
              } else {
                interimPart += event.results[i][0].transcript;
              }
            }

            const base = accumulatedWebSpeechRef.current
              ? `${accumulatedWebSpeechRef.current} `
              : "";
            const combined = (base + finalPart + interimPart).trim();
            const normalized = normalizeTechnicalSpeech(combined);
            applyNormalizedTranscript(normalized);
          };

          recognition.onerror = (event) => {
            if (event.error !== "no-speech" && event.error !== "aborted") {
              console.log("[WebSpeech] Event:", event.error);
            }
          };

          recognition.onend = () => {
            if (gen !== generationRef.current || !isRecordingRef.current) return;
            // Always preserve entire accumulated transcript so far so silence restarts never drop prior words
            if (transcriptRef.current.trim().length > 0) {
              accumulatedWebSpeechRef.current = transcriptRef.current.trim();
            }
            if (gen === generationRef.current && isRecordingRef.current) {
              try {
                launchInstance();
              } catch {}
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (err) {
          console.warn("[WebSpeech] Failed to start recognition instance:", err);
        }
      };

      launchInstance();
    },
    [applyNormalizedTranscript],
  );

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    submittedRef.current = false;
    const gen = ++generationRef.current;

    shouldSubmitRef.current = false;
    clearCountdown();
    setTranscript("");
    transcriptRef.current = "";
    hasCandidateSpokenRef.current = false;
    audioBlobRef.current = null;
    try {
      let stream = audioStream;
      const isStreamLive =
        stream &&
        stream.getAudioTracks().length > 0 &&
        stream.getAudioTracks().some((t) => t.readyState === "live" && t.enabled);

      if (!isStreamLive) {
        try {
          stream = await getAudioStream();
        } catch (streamErr) {
          console.warn("Failed to acquire fresh audio stream:", streamErr);
        }
      }

      if (!stream) {
        console.warn("No audio stream available for Deepgram STT");
        return;
      }

      // Try setting up Web Audio analyser for waveform
      try {
        const AudioCtxClass =
          typeof window !== "undefined"
            ? window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
            : null;
        if (AudioCtxClass) {
          const audioCtx = new AudioCtxClass();
          audioCtxRef.current = audioCtx;
          if (audioCtx.state === "suspended") {
            void audioCtx.resume().catch(() => {});
          }

          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;

          const freqData = new Uint8Array(analyser.frequencyBinCount);
          let ambientNoiseFloor = 0;
          let calibrationTicks = 0;
          let speechStreak = 0;
          clearAudioActivityMonitor();

          setTimeout(() => {
            if (gen !== generationRef.current || !isRecordingRef.current) return;
            audioActivityIntervalRef.current = setInterval(() => {
              analyser.getByteFrequencyData(freqData);

              let vocalBandSum = 0;
              const vocalBinsCount = 17;
              for (let i = 2; i <= 18; i++) {
                vocalBandSum += freqData[i];
              }
              const vocalEnergy = vocalBandSum / vocalBinsCount;

              if (calibrationTicks < 20) {
                calibrationTicks++;
                ambientNoiseFloor =
                  ambientNoiseFloor === 0
                    ? vocalEnergy
                    : ambientNoiseFloor * 0.8 + vocalEnergy * 0.2;
                return;
              }

              const speechThreshold = Math.max(
                ambientNoiseFloor * 1.65,
                ambientNoiseFloor + 12.0,
                22.0,
              );
              const isSpeaking = vocalEnergy > speechThreshold;

              if (isSpeaking) {
                speechStreak++;
                if (speechStreak >= SPEECH_STREAK_REQUIRED) {
                  isVoiceActiveRef.current = true;
                  hasCandidateSpokenRef.current = true;
                  clearCountdown();
                  schedulePostSpeechCountdown(1500);
                }
              } else {
                speechStreak = 0;
                isVoiceActiveRef.current = false;
                // Gradually adapt ambient noise floor to steady room sound so fans don't permanently look like speech
                ambientNoiseFloor = ambientNoiseFloor * 0.96 + vocalEnergy * 0.04;
                // Only start silence auto-submit countdown after candidate has actually provided speech/text
                if (hasCandidateSpokenRef.current && transcriptRef.current.trim().length > 0) {
                  if (isThinkingRef.current) {
                    clearThinkingTimer();
                  }
                  startCountdown();
                }
              }

              const isConfirmedSpeech =
                speechStreak >= SPEECH_STREAK_REQUIRED || transcriptRef.current.trim().length > 0;
              if (isConfirmedSpeech && isThinkingRef.current) {
                clearThinkingTimer();
              }
            }, 100);
          }, 200);
        }
      } catch (audioCtxErr) {
        console.warn("AudioContext setup skipped:", audioCtxErr);
      }

      // 1. Connect exclusively to Deepgram Nova-3 streaming (sole STT engine) FIRST
      if (DeepgramSTT.isConfigured() && stream) {
        try {
          const deepgram = new DeepgramSTT({
            onTranscript: (fullText) => {
              if (gen !== generationRef.current) return;
              const normalized = normalizeTechnicalSpeech(fullText);
              if (normalized.trim().length > 0) {
                setIsDeepgramConnected(true);
                applyNormalizedTranscript(normalized);
              }
            },
            onError: () => {
              if (gen !== generationRef.current || !isRecordingRef.current) return;
              setIsDeepgramConnected(false);
            },
            onClose: () => {
              setIsDeepgramConnected(false);
            },
          });
          deepgramRef.current = deepgram;

          // Connect non-blockingly; early MediaRecorder chunks are buffered in DeepgramSTT._pendingAudio
          void Promise.race([
            deepgram.start(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Deepgram timeout")), 4000),
            ),
          ])
            .then(() => {
              if (gen === generationRef.current) setIsDeepgramConnected(true);
            })
            .catch(() => {
              if (gen === generationRef.current) setIsDeepgramConnected(false);
            });
        } catch {
          setIsDeepgramConnected(false);
        }
      }

      // 2. Start single MediaRecorder for capturing answer audio blob & streaming to Deepgram
      try {
        const preferredMime = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
        ].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));

        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
            deepgramRef.current?.sendAudio(e.data);
          }
        };

        recorder.onstop = () => {
          if (stopSubmitFallbackRef.current) {
            clearTimeout(stopSubmitFallbackRef.current);
            stopSubmitFallbackRef.current = null;
          }
          if (gen !== generationRef.current) return;

          const actualType = recorder.mimeType || preferredMime || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: actualType });
          audioBlobRef.current = blob;
          clearAudioActivityMonitor();
          if (audioCtxRef.current) {
            void audioCtxRef.current.close().catch(() => {});
            audioCtxRef.current = null;
          }
          analyserRef.current = null;
          cancelAnimationFrame(rafRef.current);

          if (shouldSubmitRef.current) {
            shouldSubmitRef.current = false;
            doSubmit(transcriptRef.current, blob);
          }
        };

        // Pass 100ms timeslice so ondataavailable continuously emits chunks to Deepgram
        recorder.start(100);
        mediaRecorderRef.current = recorder;
      } catch (recErr) {
        console.warn("MediaRecorder audio capture skipped:", recErr);
      }

      if (gen !== generationRef.current) return;
      isRecordingRef.current = true;
      setIsRecording(true);
      setDuration(0);

      startThinkingTimer();

      requestAnimationFrame(() => {
        if (gen === generationRef.current && isRecordingRef.current) {
          drawWaveform();
        }
      });

      intervalRef.current = setInterval(() => setDuration((prev) => prev + 1), 1000);

      // Start Web Speech API fallback only when Deepgram STT is not configured
      if (!DeepgramSTT.isConfigured()) {
        startWebSpeechFallback(gen);
      }
    } catch (err) {
      console.error("Failed to start recording stream:", err);
      if (!DeepgramSTT.isConfigured()) {
        startWebSpeechFallback(gen);
      }
    }
  }, [
    applyNormalizedTranscript,
    audioStream,
    clearAudioActivityMonitor,
    clearCountdown,
    clearThinkingTimer,
    doSubmit,
    drawWaveform,
    schedulePostSpeechCountdown,
    startCountdown,
    startThinkingTimer,
    startWebSpeechFallback,
  ]);

  useEffect(() => {
    if (!isAiSpeaking) {
      startRecording();
    } else {
      stopRecordingSilently();
    }
  }, [isAiSpeaking, startRecording, stopRecordingSilently]);

  useEffect(() => {
    if (expired && isRecordingRef.current) {
      stopAndSubmit();
    }
  }, [expired, stopAndSubmit]);

  useEffect(() => {
    if (endEarly && isRecordingRef.current) {
      stopAndSubmit();
    }
  }, [endEarly, stopAndSubmit]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      shouldSubmitRef.current = false;
      isRecordingRef.current = false;
      if (stopSubmitFallbackRef.current) {
        clearTimeout(stopSubmitFallbackRef.current);
        stopSubmitFallbackRef.current = null;
      }
      clearCountdown();
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      mediaRecorderRef.current = null;
      stopSTTEngines();
      if (recognitionRef.current) {
        try {
          (recognitionRef.current as { abort: () => void }).abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearAudioActivityMonitor();
      cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [clearAudioActivityMonitor, clearCountdown, stopSTTEngines]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-resize on transcript change
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.max(70, Math.min(textareaRef.current.scrollHeight, 400));
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [transcript]);

  useEffect(() => {
    onStateChange?.({
      transcript,
      isThinking,
      silenceCountdown,
      countdownTenths: COUNTDOWN_TENTHS,
      thinkingCountdown,
      thinkingCountdownTenths: THINKING_TENTHS,
      isRecording: isRecording && !isAiSpeaking,
    });
  }, [
    transcript,
    isThinking,
    isRecording,
    silenceCountdown,
    thinkingCountdown,
    isAiSpeaking,
    onStateChange,
  ]);

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  return (
    <div className="w-full space-y-4 animate-fade-in">
      <div className="card p-5 space-y-4 min-h-[140px]">
        {isAiSpeaking ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="flex items-center gap-1.5 h-8">
              <span
                className="w-1.5 h-4 rounded-full animate-bounce"
                style={{ background: "var(--blue)", animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-7 rounded-full animate-bounce"
                style={{ background: "var(--blue)", animationDelay: "150ms" }}
              />
              <span
                className="w-1.5 h-3 rounded-full animate-bounce"
                style={{ background: "var(--blue)", animationDelay: "300ms" }}
              />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
              AI is speaking... Please listen carefully.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isThinking ? (
                  <>
                    <span
                      className="w-2 h-2 rounded-full animate-ping"
                      style={{ background: "var(--orange)" }}
                    />
                    <span className="text-xs font-semibold" style={{ color: "var(--orange)" }}>
                      Thinking Time
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="w-2 h-2 rounded-full animate-ping"
                      style={{ background: "var(--green)" }}
                    />
                    <span className="text-xs font-semibold" style={{ color: "var(--green)" }}>
                      Listening
                    </span>
                  </>
                )}
                <span
                  className="px-2 py-0.5 text-[10px] font-medium rounded-md flex items-center gap-1"
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    color: "var(--green)",
                  }}
                  title="Noise suppression and voice detection active"
                >
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  Voice Active
                </span>
                <span
                  className="px-2 py-0.5 text-[10px] font-semibold rounded-md flex items-center gap-1.5"
                  style={{
                    background: isDeepgramConnected
                      ? "rgba(147, 51, 234, 0.12)"
                      : "rgba(255, 255, 255, 0.05)",
                    border: isDeepgramConnected
                      ? "1px solid rgba(147, 51, 234, 0.3)"
                      : "1px solid var(--separator)",
                    color: isDeepgramConnected ? "#c084fc" : "var(--label-tertiary)",
                  }}
                  title={
                    isDeepgramConnected ? "Deepgram Nova-3 active" : "Deepgram STT connection ready"
                  }
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: isDeepgramConnected ? "#c084fc" : "#888" }}
                  />
                  {isDeepgramConnected ? "Deepgram Nova-3" : "Deepgram STT"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {isThinking ? (
                  <div
                    className="flex items-center gap-1.5"
                    title="Time remaining to begin speaking or typing your response"
                  >
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 16 16"
                      className="transform -rotate-90"
                    >
                      <title>Thinking time countdown</title>
                      <circle
                        cx={8}
                        cy={8}
                        r={6.5}
                        fill="none"
                        stroke="var(--fill-tertiary)"
                        strokeWidth={2}
                      />
                      <circle
                        cx={8}
                        cy={8}
                        r={6.5}
                        fill="none"
                        stroke={
                          thinkingCountdown < 30
                            ? "var(--red)"
                            : thinkingCountdown < 70
                              ? "var(--orange)"
                              : "var(--blue)"
                        }
                        strokeWidth={2}
                        strokeDasharray={`${(thinkingCountdown / THINKING_TENTHS) * 40.84} 40.84`}
                        strokeLinecap="round"
                        className="transition-all duration-100"
                      />
                    </svg>
                    <span
                      className="text-[10px] font-mono font-bold"
                      style={{
                        color:
                          thinkingCountdown < 30
                            ? "var(--red)"
                            : thinkingCountdown < 70
                              ? "var(--orange)"
                              : "var(--label-secondary)",
                      }}
                    >
                      {(thinkingCountdown / 10).toFixed(1)}s limit
                    </span>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1.5"
                    title="Silence countdown before auto-submission"
                  >
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 16 16"
                      className="transform -rotate-90"
                    >
                      <title>Silence timer countdown</title>
                      <circle
                        cx={8}
                        cy={8}
                        r={6.5}
                        fill="none"
                        stroke="var(--fill-tertiary)"
                        strokeWidth={2}
                      />
                      <circle
                        cx={8}
                        cy={8}
                        r={6.5}
                        fill="none"
                        stroke={
                          silenceCountdown < 5
                            ? "var(--red)"
                            : silenceCountdown < 12
                              ? "var(--orange)"
                              : "var(--blue)"
                        }
                        strokeWidth={2}
                        strokeDasharray={`${(silenceCountdown / COUNTDOWN_TENTHS) * 40.84} 40.84`}
                        strokeLinecap="round"
                        className="transition-all duration-100"
                      />
                    </svg>
                    <span
                      className="text-[10px] font-mono font-bold"
                      style={{
                        color:
                          silenceCountdown < 5
                            ? "var(--red)"
                            : silenceCountdown < 12
                              ? "var(--orange)"
                              : "var(--label-secondary)",
                      }}
                    >
                      {(silenceCountdown / 10).toFixed(1)}s
                    </span>
                  </div>
                )}
                <span
                  className="text-xs font-mono font-bold"
                  style={{ color: "var(--label-secondary)" }}
                >
                  {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
                </span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              width={600}
              height={60}
              className="w-full h-14 rounded-lg"
              style={{ background: "var(--fill-quaternary)" }}
            />

            <textarea
              ref={textareaRef}
              value={transcript}
              onChange={(e) => {
                const val = e.target.value;
                setTranscript(val);
                transcriptRef.current = val;
                if (val.trim().length > 0) {
                  hasCandidateSpokenRef.current = true;
                }
                if (isThinkingRef.current) {
                  clearThinkingTimer();
                }
                if (isVoiceActiveRef.current) {
                  clearCountdown();
                } else if (val.trim().length > 0) {
                  clearCountdown();
                  startCountdown();
                }
              }}
              placeholder={
                isThinking
                  ? "Speak your response now (you have 10s to begin speaking)..."
                  : "Speak your response now (you can also edit or type words here)..."
              }
              className="w-full text-sm leading-relaxed font-medium rounded-xl p-3 min-h-[70px] max-h-[400px] overflow-y-auto transition-all duration-150 resize-none"
              style={{
                background: "var(--fill-quaternary)",
                border: "1px solid var(--separator)",
                color: "var(--label-primary)",
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px]" style={{ color: "var(--label-tertiary)" }}>
                {isThinking
                  ? `Start speaking within 10s | Auto-submits after ${(SILENCE_TIMEOUT_MS / 1000).toFixed(0)}s of silence once spoken`
                  : `Auto-submits after ${(SILENCE_TIMEOUT_MS / 1000).toFixed(0)}s of silence`}
              </p>
              <button
                type="button"
                onClick={() => stopAndSubmit()}
                disabled={!transcript.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: transcript.trim() ? "var(--blue)" : "var(--fill-tertiary)",
                  color: transcript.trim() ? "white" : "var(--label-tertiary)",
                }}
              >
                Submit Answer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
