import { useCallback, useEffect, useRef, useState } from "react";

interface TTSEngine {
  speak: (text: string, onend?: () => void) => void;
  cancel: () => void;
  isSpeaking: () => boolean;
  setVoiceSettings: (rate: number, pitch: number, voiceName?: string) => void;
  getVoices: () => SpeechSynthesisVoice[];
}

export function useTTSEngine(): TTSEngine {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const isSpeakingRef = useRef(false);
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
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        console.warn("SpeechSynthesis not available in this browser");
        if (onend) onend();
        return;
      }

      cancel();

      // Ensure speech synthesis is not paused (Chrome on Windows bug)
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
        const preferredVoice = currentVoices.find((v) => {
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
        utterance.voice = preferredVoice || fallbackEnglish || currentVoices[0] || null;
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

      // Safety timeout: calculate based on word count (~250 words per min = ~240ms/word + 2.5s buffer)
      // This guarantees onend is triggered even if the browser speech engine gets stuck or drops onend!
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

  const speak = useCallback(
    (text: string, onend?: () => void) => {
      if (!text || !text.trim()) {
        if (onend) onend();
        return;
      }
      speakWithWebSpeech(text, onend);
    },
    [speakWithWebSpeech],
  );

  const isSpeaking = useCallback(() => isSpeakingRef.current, []);

  const setVoiceSettings = useCallback((_rate: number, _pitch: number) => {}, []);

  const getVoices = useCallback(() => voices, [voices]);

  return {
    speak,
    cancel,
    isSpeaking,
    setVoiceSettings,
    getVoices,
  };
}
