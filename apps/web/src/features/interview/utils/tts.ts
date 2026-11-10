import { useCallback, useRef } from "react";
import { DEFAULT_PUBLIC_DEEPGRAM_API_KEY, getEnv } from "@/env";

interface TTSEngine {
  speak: (text: string, onend?: () => void) => void;
  prefetch: (text: string) => void;
  cancel: () => void;
  isSpeaking: () => boolean;
}

export const FIXED_DEEPGRAM_VOICE_MODEL = "flux-priya-en";
export const DEEPGRAM_V2_SPEED = 1.05;

function getDeepgramApiKey(): string {
  try {
    const fromEnv = getEnv().NEXT_PUBLIC_DEEPGRAM_API_KEY;
    if (fromEnv && !fromEnv.includes("your-deepgram-api-key")) return fromEnv;
  } catch {
    // Fallback for test environments without Next env loader
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY) {
    const k = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
    if (!k.includes("your-deepgram-api-key")) return k;
  }
  return DEFAULT_PUBLIC_DEEPGRAM_API_KEY;
}

export function prepareTextForTTS(text: string): string {
  if (!text) return "";
  let cleaned = text
    // Split snake_case identifiers into natural spoken words (e.g. "answer_text" -> "answer text")
    // Must run before stripping "_" markdown formatting.
    .replace(/\b([a-zA-Z0-9]+)_([a-zA-Z0-9_]+)\b/g, (m) => m.replace(/_/g, " "))
    // Strip markdown formatting so TTS never speaks literal symbols
    .replace(/[*_`~#]/g, "")
    // Smooth harsh exclamation marks after short greetings with a name so voices don't clip the name
    .replace(/\b(Hello|Hi|Hey|Welcome)\s+([A-Z][a-zA-Z'-]+)\s*!/g, "$1 $2,")
    // Replace slashes between options (e.g. "retries/fallbacks") with natural speech pause
    .replace(/\b([a-zA-Z0-9]+)\s*\/\s*([a-zA-Z0-9]+)\b/g, (full, a: string, b: string) => {
      const upper = full.toUpperCase();
      if (upper === "CI/CD") return "C I C D";
      if (upper === "UI/UX") return "U I U X";
      return `${a} or ${b}`;
    });

  const acronyms: Array<[RegExp, string]> = [
    [/\bopenai\b/gi, "Open A I"],
    [/\bchatgpt\b/gi, "Chat G P T"],
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
    [/\byaml\b/gi, "yammel"],
    [/\bsaas\b/gi, "Sass"],
    [/\bllm\b/gi, "L L M"],
    [/\bllms\b/gi, "L L Ms"],
    [/\bapis\b/gi, "A P Is"],
    [/\bapi\b/gi, "A P I"],
    [/\bci\/cd\b/gi, "C I C D"],
    [/\bui\/ux\b/gi, "U I U X"],
    [/\bui\b/gi, "U I"],
    [/\bux\b/gi, "U X"],
    [/\bnext\.js\b/gi, "Next J S"],
    [/\bnode\.js\b/gi, "Node J S"],
    [/\breact\.js\b/gi, "React J S"],
    [/\btypescript\b/gi, "Type Script"],
    [/\bjavascript\b/gi, "Java Script"],
    [/\bgithub\b/gi, "Git Hub"],
    [/\bdevops\b/gi, "Dev Ops"],
    [/\bscalepods\b/gi, "Scale Pods"],
    [/\bskillgap\b/gi, "Skill Gap"],
    [/\bwhatsapp\b/gi, "Whats App"],
    [/\btwilio\b/gi, "Twil-ee-oh"],
    [/\bapify\b/gi, "App-i-fy"],
    [/\bvercel\b/gi, "Ver-sell"],
    [/\blangchain\b/gi, "Lang Chain"],
    [/\bhttps\b/gi, "H T T P S"],
    [/\bhttp\b/gi, "H T T P"],
    [/\bhtml\b/gi, "H T M L"],
    [/\bcss\b/gi, "C S S"],
    [/\bdom\b/gi, "D O M"],
    [/\burls\b/gi, "U R Ls"],
    [/\burl\b/gi, "U R L"],
    [/\buuid\b/gi, "U U I D"],
    [/\bsdk\b/gi, "S D K"],
    [/\bcli\b/gi, "C L I"],
    [/\baws\b/gi, "A W S"],
    [/\bgcp\b/gi, "G C P"],
    [/\bcrm\b/gi, "C R M"],
    [/\bkpis\b/gi, "K P Is"],
    [/\bkpi\b/gi, "K P I"],
    [/\bhr\b/gi, "H R"],
    [/\bjd\b/gi, "J D"],
    [/\bml\b/gi, "M L"],
    [/\bnlp\b/gi, "N L P"],
    [/\btts\b/gi, "T T S"],
    [/\bstt\b/gi, "S T T"],
    [/\bb2b\b/gi, "B 2 B"],
    [/\bb2c\b/gi, "B 2 C"],
    [/\brag\b/gi, "rag"],
    [/\bserp\b/gi, "serp"],
    // Match uppercase AI or titlecase Ai (e.g. "Ai Automation Intern", "AI Interviewer")
    [/\bA[Ii]'s\b/g, "A I's"],
    [/\bA[Ii]s\b/g, "A Is"],
    [/\bA[Ii]\b/g, "A I"],
    [/\b([a-z])8([a-z])\b/gi, "$1 8 $2"],
  ];
  for (const [pattern, replacement] of acronyms) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

export function buildDeepgramSpeakUrl(model: string): string {
  const isFluxV2 = model.startsWith("flux-");
  const endpointVersion = isFluxV2 ? "v2" : "v1";
  // Deepgram /v2/speak requires speed in exact increments of 0.05 (otherwise returns HTTP 400).
  const snappedSpeed = (Math.round(DEEPGRAM_V2_SPEED * 20) / 20).toFixed(2);
  const query = isFluxV2
    ? `model=${encodeURIComponent(model)}&speed=${snappedSpeed}`
    : `model=${encodeURIComponent(model)}`;
  return `https://api.deepgram.com/${endpointVersion}/speak?${query}`;
}

/**
 * Single locked Deepgram TTS engine (no backup/browser voices).
 * Every turn uses FIXED_DEEPGRAM_VOICE_MODEL so the interviewer voice never shifts mid-call.
 */
export function useTTSEngine(): TTSEngine {
  const audioBlobCacheRef = useRef<Map<string, Promise<Blob>>>(new Map());
  const ttsSessionTokenRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    isSpeakingRef.current = false;
  }, []);

  const fetchDeepgramBlob = useCallback((text: string): Promise<Blob> => {
    const apiKey = getDeepgramApiKey();
    const model = FIXED_DEEPGRAM_VOICE_MODEL;
    const preparedText = prepareTextForTTS(text);
    const cacheKey = `${model}::${DEEPGRAM_V2_SPEED}::${preparedText}`;
    const existing = audioBlobCacheRef.current.get(cacheKey);
    if (existing) {
      return existing;
    }

    const speakUrl = buildDeepgramSpeakUrl(model);

    const attemptFetch = async (): Promise<Blob> => {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(speakUrl, {
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
      } finally {
        clearTimeout(fetchTimeout);
      }
    };

    const fetchPromise = (async () => {
      try {
        return await attemptFetch();
      } catch (firstErr) {
        // Retry once with the exact same locked Deepgram voice instead of switching to any backup voice
        await new Promise((r) => setTimeout(r, 300));
        try {
          return await attemptFetch();
        } catch {
          audioBlobCacheRef.current.delete(cacheKey);
          throw firstErr;
        }
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
      void fetchDeepgramBlob(text).catch(() => {});
    },
    [fetchDeepgramBlob],
  );

  const speak = useCallback(
    (text: string, onend?: () => void) => {
      if (!text?.trim()) {
        if (onend) onend();
        return;
      }

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

      void (async () => {
        try {
          cancel();
          myToken = ttsSessionTokenRef.current;
          isSpeakingRef.current = true;

          const blob = await fetchDeepgramBlob(text);
          if (myToken !== ttsSessionTokenRef.current) {
            return;
          }

          audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          audio.playbackRate = 1.0;
          currentAudioRef.current = audio;

          audio.onended = () => {
            finish();
          };

          audio.onerror = (e) => {
            console.warn("Deepgram Audio playback error:", e);
            finish();
          };

          const preparedWords = prepareTextForTTS(text).split(/\s+/).filter(Boolean).length;
          const expectedDurationMs = Math.max(5000, Math.min(45000, preparedWords * 450 + 4000));
          safetyTimerRef.current = setTimeout(() => {
            if (!finished && myToken === ttsSessionTokenRef.current) {
              console.log("Deepgram playback safety timeout triggered, proceeding");
              finish();
            }
          }, expectedDurationMs);

          await audio.play();
        } catch (err) {
          if (myToken !== ttsSessionTokenRef.current) return;
          console.warn("Deepgram TTS failed (no backup voice configured):", err);
          finish();
        }
      })();
    },
    [cancel, fetchDeepgramBlob],
  );

  const isSpeaking = useCallback(() => isSpeakingRef.current, []);

  return { speak, prefetch, cancel, isSpeaking };
}
