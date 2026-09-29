import { useCallback, useEffect, useRef, useState } from "react";

interface TTSEngine {
  speak: (text: string, onend?: () => void) => void;
  cancel: () => void;
  isSpeaking: () => boolean;
  setVoiceSettings: (rate: number, pitch: number, voiceName?: string) => void;
  getVoices: () => SpeechSynthesisVoice[];
}

function prepareTextForTTS(text: string): string {
  if (!text) return "";
  let cleaned = text;
  const acronyms: Array<[RegExp, string]> = [
    [/\bn8n\b/gi, "N-8-N"],
    [/\bgrpc\b/gi, "g-R-P-C"],
    [/\bfastapi\b/gi, "Fast API"],
    [/\bpostgresql\b/gi, "Postgres-Q-L"],
    [/\bpostgres\b/gi, "Postgres"],
    [/\bci\/cd\b/gi, "C-I C-D"],
    [/\bui\/ux\b/gi, "U-I U-X"],
    [/\bgraphql\b/gi, "Graph Q L"],
    [/\b([a-z])8([a-z])\b/gi, "$1 8 $2"],
  ];
  for (const [pattern, replacement] of acronyms) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

export function useTTSEngine(): TTSEngine {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
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

      const utterance = new SpeechSynthesisUtterance(text);
      activeUtteranceRef.current = utterance;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const currentVoices = voicesRef.current;
      if (currentVoices.length > 0) {
        const maleVoice = currentVoices.find((v) => {
          const name = v.name.toLowerCase();
          return (
            (name.includes("male") ||
              name.includes("david") ||
              name.includes("alex") ||
              name.includes("mark") ||
              name.includes("daniel") ||
              name.includes("george") ||
              name.includes("natural") ||
              name.includes("guy")) &&
            (v.lang.includes("en") || v.lang.includes("EN"))
          );
        });
        const fallbackEnglish = currentVoices.find(
          (v) => v.lang.includes("en") || v.lang.includes("EN"),
        );
        utterance.voice = maleVoice || fallbackEnglish || currentVoices[0] || null;
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

  const speakWithDeepgram = useCallback(
    async (text: string, apiKey: string, onend?: () => void) => {
      try {
        cancel();
        isSpeakingRef.current = true;

        const model = "aura-arcas-en";
        const speed = 1.1;
        const preparedText = prepareTextForTTS(text);

        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${model}`, {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: preparedText }),
        });

        if (!response.ok) {
          throw new Error(`Deepgram TTS request failed: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.playbackRate = speed;
        currentAudioRef.current = audio;

        audio.onended = () => {
          isSpeakingRef.current = false;
          currentAudioRef.current = null;
          URL.revokeObjectURL(audioUrl);
          if (onend) onend();
        };

        audio.onerror = (e) => {
          console.warn("Deepgram Audio playback error:", e);
          isSpeakingRef.current = false;
          currentAudioRef.current = null;
          URL.revokeObjectURL(audioUrl);
          if (onend) onend();
        };

        await audio.play();
      } catch (err) {
        console.warn("Deepgram TTS failed, falling back to Web Speech API:", err);
        currentAudioRef.current = null;
        speakWithWebSpeech(text, onend);
      }
    },
    [cancel, speakWithWebSpeech],
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

  return { speak, cancel, isSpeaking, setVoiceSettings, getVoices };
}
