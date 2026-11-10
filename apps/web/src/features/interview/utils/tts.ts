import { useCallback, useEffect, useRef, useState } from "react";

interface TTSEngine {
  speak: (text: string, onend?: () => void) => void;
  prefetch: (text: string) => void;
  cancel: () => void;
  isSpeaking: () => boolean;
  setVoiceSettings: (rate: number, pitch: number, voiceName?: string) => void;
  getVoices: () => SpeechSynthesisVoice[];
}

function prepareTextForTTS(text: string): string {
  if (!text) return "";
  let cleaned = text
    // Strip markdown formatting so TTS never speaks literal symbols
    .replace(/[*_`~#]/g, "")
    // Replace slashes between options (e.g. "retries/fallbacks") with natural speech pause
    .replace(/\b([a-zA-Z0-9]+)\s*\/\s*([a-zA-Z0-9]+)\b/g, (full, a: string, b: string) => {
      const upper = full.toUpperCase();
      if (upper === "CI/CD") return "C I C D";
      if (upper === "UI/UX") return "U I U X";
      return `${a} or ${b}`;
    });

  const acronyms: Array<[RegExp, string]> = [
    [/\bn8n\b/gi, "en eight en"],
    [/\bgrpc\b/gi, "G R P C"],
    [/\bfastapi\b/gi, "Fast A P I"],
    [/\bpostgresql\b/gi, "Postgres Q L"],
    [/\bpostgres\b/gi, "Postgres"],
    [/\bnosql\b/gi, "No S Q L"],
    [/\bsql\b/gi, "S Q L"],
    [/\bsupabase\b/gi, "Soopabase"],
    [/\bgroq\b/gi, "Grock"],
    [/\blidar\b/gi, "Lie-dar"],
    [/\bgraphql\b/gi, "Graph Q L"],
    [/\boauth\b/gi, "Oh-auth"],
    [/\bjwt\b/gi, "J W T"],
    [/\bjson\b/gi, "Jay-son"],
    [/\bsaas\b/gi, "Sass"],
    [/\bllm\b/gi, "L L M"],
    [/\bllms\b/gi, "L L Ms"],
    [/\bapis\b/gi, "A P Is"],
    [/\bapi\b/gi, "A P I"],
    [/\bci\/cd\b/gi, "C I C D"],
    [/\bui\/ux\b/gi, "U I U X"],
    [/\bnext\.js\b/gi, "Next J S"],
    [/\bnode\.js\b/gi, "Node J S"],
    [/\breact\.js\b/gi, "React J S"],
    [/\b([a-z])8([a-z])\b/gi, "$1 8 $2"],
  ];
  for (const [pattern, replacement] of acronyms) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

export function useTTSEngine(): TTSEngine {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const lockedWebSpeechVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioBlobCacheRef = useRef<Map<string, Promise<Blob>>>(new Map());
  const ttsSessionTokenRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        voicesRef.current = availableVoices;
      }
    };

    loadVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const cancel = useCallback(() => {
    ttsSessionTokenRef.current += 1;
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {}
      currentAudioRef.current = null;
    }
    activeUtteranceRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isSpeakingRef.current = false;
  }, []);

  const speakWithWebSpeech = useCallback(
    (text: string, onend?: () => void) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        console.warn("SpeechSynthesis not available in this browser");
        if (onend) onend();
        return;
      }

      cancel();

      try {
        window.speechSynthesis.resume();
      } catch {}

      const preparedText = prepareTextForTTS(text);
      const utterance = new SpeechSynthesisUtterance(preparedText);
      activeUtteranceRef.current = utterance;
      utterance.lang = "en-IN";
      utterance.rate = 1.08;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const currentVoices = voicesRef.current;
      if (currentVoices.length > 0) {
        if (!lockedWebSpeechVoiceRef.current) {
          // 1. Prefer Indian English (en-IN) natural/female voices first
          const indianNaturalVoice = currentVoices.find((v) => {
            const name = v.name.toLowerCase();
            const lang = v.lang.toLowerCase();
            return (
              (lang === "en-in" || lang.startsWith("en_in") || name.includes("india")) &&
              (name.includes("neerja") ||
                name.includes("natural") ||
                name.includes("online") ||
                name.includes("neural") ||
                name.includes("aditi") ||
                name.includes("raveena") ||
                name.includes("heera") ||
                name.includes("veena") ||
                name.includes("kavya") ||
                name.includes("google"))
            );
          });

          const anyIndianVoice = currentVoices.find((v) => {
            const name = v.name.toLowerCase();
            const lang = v.lang.toLowerCase();
            return lang === "en-in" || lang.startsWith("en_in") || name.includes("india");
          });

          // 2. Fallback to fluent natural English female voices if no en-IN voice is installed
          const naturalVoice = currentVoices.find((v) => {
            const name = v.name.toLowerCase();
            const isEn = v.lang.toLowerCase().startsWith("en");
            return (
              isEn &&
              (name.includes("natural") ||
                name.includes("online") ||
                name.includes("neural") ||
                name.includes("aria") ||
                name.includes("jenny") ||
                name.includes("samantha") ||
                name.includes("ava"))
            );
          });

          const fallbackEnglish = currentVoices.find((v) => v.lang.toLowerCase().startsWith("en"));
          lockedWebSpeechVoiceRef.current =
            indianNaturalVoice ||
            anyIndianVoice ||
            naturalVoice ||
            fallbackEnglish ||
            currentVoices[0] ||
            null;
        }
        utterance.voice = lockedWebSpeechVoiceRef.current;
      }

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (safetyTimerRef.current) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }
        activeUtteranceRef.current = null;
        isSpeakingRef.current = false;
        if (onend) onend();
      };

      utterance.onstart = () => {
        isSpeakingRef.current = true;
      };

      utterance.onend = () => {
        finish();
      };

      utterance.onerror = (e) => {
        if (e.error !== "interrupted") {
          console.warn("Speech synthesis error:", e);
        }
        finish();
      };

      const words = text.split(/\s+/).length;
      const expectedDurationMs = Math.max(3500, Math.min(30000, words * 380 + 2500));
      safetyTimerRef.current = setTimeout(() => {
        if (!finished) {
          console.log("TTS safety timeout triggered, proceeding to answer phase");
          finish();
        }
      }, expectedDurationMs);

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Failed to speak text:", err);
        finish();
      }
    },
    [cancel],
  );

  const fetchDeepgramBlob = useCallback((text: string, apiKey: string): Promise<Blob> => {
    const model = process.env.NEXT_PUBLIC_DEEPGRAM_VOICE_MODEL || "flux-priya-en";
    const preparedText = prepareTextForTTS(text);
    const cacheKey = `${model}::${preparedText}`;
    const existing = audioBlobCacheRef.current.get(cacheKey);
    if (existing) {
      return existing;
    }

    const endpointVersion = model.startsWith("flux-") ? "v2" : "v1";
    const query =
      endpointVersion === "v2"
        ? `model=${encodeURIComponent(model)}&speed=1.18&expressivity=0`
        : `model=${encodeURIComponent(model)}`;

    const fetchPromise = (async () => {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch(`https://api.deepgram.com/${endpointVersion}/speak?${query}`, {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: preparedText }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Deepgram TTS request failed: ${response.status} ${response.statusText}`);
        }
        return await response.blob();
      } catch (err) {
        audioBlobCacheRef.current.delete(cacheKey);
        throw err;
      } finally {
        clearTimeout(fetchTimeout);
      }
    })();

    if (audioBlobCacheRef.current.size >= 12) {
      const oldestKey = audioBlobCacheRef.current.keys().next().value;
      if (oldestKey) audioBlobCacheRef.current.delete(oldestKey);
    }
    audioBlobCacheRef.current.set(cacheKey, fetchPromise);
    return fetchPromise;
  }, []);

  const prefetch = useCallback(
    (text: string) => {
      if (!text?.trim()) return;
      const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
      if (apiKey && apiKey.trim().length > 0 && !apiKey.includes("your-deepgram-api-key")) {
        void fetchDeepgramBlob(text, apiKey).catch(() => {});
      }
    },
    [fetchDeepgramBlob],
  );

  const speakWithDeepgram = useCallback(
    async (text: string, apiKey: string, onend?: () => void) => {
      let audioUrl: string | null = null;
      let finished = false;
      let myToken = 0;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (safetyTimerRef.current) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }
        isSpeakingRef.current = false;
        currentAudioRef.current = null;
        if (audioUrl) {
          try {
            URL.revokeObjectURL(audioUrl);
          } catch {}
          audioUrl = null;
        }
        if (onend && myToken === ttsSessionTokenRef.current) onend();
      };

      try {
        cancel();
        myToken = ttsSessionTokenRef.current;
        isSpeakingRef.current = true;

        const blob = await fetchDeepgramBlob(text, apiKey);
        if (myToken !== ttsSessionTokenRef.current) {
          return;
        }

        audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.playbackRate = 1.02;
        currentAudioRef.current = audio;

        audio.onended = () => {
          finish();
        };

        audio.onerror = (e) => {
          console.warn("Deepgram Audio playback error:", e);
          finish();
        };

        // Safety timer ensures the interview continues even if audio stalls or autoplay is interrupted
        const words = text.split(/\s+/).length;
        const expectedDurationMs = Math.max(3500, Math.min(30000, words * 360 + 2500));
        safetyTimerRef.current = setTimeout(() => {
          if (!finished && myToken === ttsSessionTokenRef.current) {
            console.log("Deepgram playback safety timeout triggered, proceeding");
            finish();
          }
        }, expectedDurationMs);

        await audio.play();
      } catch (err) {
        if (myToken !== ttsSessionTokenRef.current) return;
        console.warn("Deepgram TTS failed, falling back to locked en-IN voice:", err);
        if (safetyTimerRef.current) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }
        currentAudioRef.current = null;
        if (audioUrl) {
          try {
            URL.revokeObjectURL(audioUrl);
          } catch {}
        }
        speakWithWebSpeech(text, onend);
      }
    },
    [cancel, fetchDeepgramBlob, speakWithWebSpeech],
  );

  const speak = useCallback(
    (text: string, onend?: () => void) => {
      if (!text?.trim()) {
        if (onend) onend();
        return;
      }
      const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
      if (apiKey && apiKey.trim().length > 0 && !apiKey.includes("your-deepgram-api-key")) {
        speakWithDeepgram(text, apiKey, onend);
      } else {
        speakWithWebSpeech(text, onend);
      }
    },
    [speakWithDeepgram, speakWithWebSpeech],
  );

  const isSpeaking = useCallback(() => isSpeakingRef.current, []);

  const setVoiceSettings = useCallback(
    (_rate: number, _pitch: number) => {
      cancel();
    },
    [cancel],
  );

  const getVoices = useCallback(() => voices, [voices]);

  return { speak, prefetch, cancel, isSpeaking, setVoiceSettings, getVoices };
}
