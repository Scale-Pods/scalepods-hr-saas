export interface DeepgramSTTOptions {
  apiKey?: string;
  model?: string;
  language?: string;
  keywords?: string[];
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

const DEFAULT_TECH_KEYWORDS = [
  "n8n",
  "Zapier",
  "Integromat",
  "LangChain",
  "LlamaIndex",
  "FastAPI",
  "GraphQL",
  "tRPC",
  "Supabase",
  "PostgreSQL",
  "MongoDB",
  "React",
  "Next.js",
  "Vue.js",
  "Nuxt.js",
  "TypeScript",
  "JavaScript",
  "PyTorch",
  "TensorFlow",
  "OpenAI",
  "Claude",
  "Vercel",
  "Netlify",
  "WebSockets",
  "WebRTC",
  "microservices",
  "RabbitMQ",
  "Airflow",
  "Firebase",
  "BigQuery",
  "DynamoDB",
  "Docker",
  "Kubernetes",
  "GitHub Actions",
  "Spring Boot",
];

/**
 * Keyword boost weights for Deepgram. Higher = stronger preference.
 * Terms with unusual phonetics or that STT frequently mishears get a higher boost.
 */
const KEYWORD_BOOST_WEIGHTS: Record<string, number> = {
  n8n: 10,
  tRPC: 8,
  gRPC: 8,
  "Next.js": 6,
  WebRTC: 6,
  LangChain: 6,
  LlamaIndex: 6,
  Supabase: 5,
  PostgreSQL: 5,
  RabbitMQ: 5,
  Kubernetes: 4,
};

export class DeepgramSTT {
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private apiKey: string;
  private model: string;
  private language: string;
  private keywords: string[];
  private onTranscript?: (transcript: string, isFinal: boolean) => void;
  private onError?: (error: Error) => void;
  private onOpen?: () => void;
  private onClose?: () => void;
  private isRunning = false;
  private accumulatedFinalTranscript = "";
  /** Tracks the last audio stream so reconnects can reattach it */
  private _lastStream?: MediaStream;
  /** Reconnect attempt counter — resets to 0 on clean stop() */
  private _reconnectAttempts = 0;

  constructor(options: DeepgramSTTOptions = {}) {
    this.apiKey =
      options.apiKey ||
      (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY : "") ||
      "";
    this.model = options.model || "nova-3";
    this.language = options.language || "en";
    this.keywords = options.keywords || DEFAULT_TECH_KEYWORDS;
    this.onTranscript = options.onTranscript;
    this.onError = options.onError;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
  }

  static isConfigured(): boolean {
    const key =
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY : undefined;
    return Boolean(key && key.trim().length > 0 && !key.includes("your-deepgram-api-key"));
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && typeof WebSocket !== "undefined");
  }

  start(audioStream?: MediaStream): Promise<void> {
    if (!this.apiKey) {
      return Promise.reject(new Error("Deepgram API key not provided"));
    }

    // Store stream reference so automatic reconnects can reattach it
    if (audioStream) {
      this._lastStream = audioStream;
    }

    this.accumulatedFinalTranscript = "";

    return new Promise((resolve, reject) => {
      try {
        const params = new URLSearchParams({
          model: this.model,
          language: this.language,
          smart_formatting: "true",
          punctuate: "true",
          interim_results: "true",
          vad_events: "true",
          // 900ms gives natural pauses room without cutting off mid-sentence hesitations
          endpointing: "900",
          // Wait 2s of complete silence before finalising an utterance
          utterance_end_ms: "2000",
          no_delay: "true",
          // Strip filler words ("um", "uh") from the final transcript
          filler_words: "false",
        });

        // Apply per-keyword boost weights — higher numbers prioritise rare/unusual terms
        for (const kw of this.keywords) {
          const boost = KEYWORD_BOOST_WEIGHTS[kw];
          params.append("keywords", boost ? `${kw}:${boost}` : kw);
        }

        const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
        this.socket = new WebSocket(url, ["token", this.apiKey]);

        this.socket.onopen = () => {
          this._reconnectAttempts = 0;
          this.isRunning = true;
          const streamToRecord = audioStream ?? this._lastStream;
          if (streamToRecord) {
            this.startMediaRecorder(streamToRecord);
          }
          this.onOpen?.();
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const alt = data.channel?.alternatives?.[0];
            const text = alt?.transcript || "";
            if (!text.trim()) return;

            if (data.is_final) {
              this.accumulatedFinalTranscript = (
                this.accumulatedFinalTranscript +
                " " +
                text.trim()
              ).trim();
              this.onTranscript?.(this.accumulatedFinalTranscript, true);
            } else {
              const liveText = (this.accumulatedFinalTranscript + " " + text.trim()).trim();
              this.onTranscript?.(liveText, false);
            }
          } catch (err) {
            console.error("[DeepgramSTT] Error parsing socket message:", err);
          }
        };

        this.socket.onerror = (event) => {
          console.warn("[DeepgramSTT] WebSocket error event:", event);
          const err = new Error("Deepgram WebSocket error");
          this.onError?.(err);
          if (!this.isRunning) reject(err);
        };

        this.socket.onclose = (event) => {
          console.log("[DeepgramSTT] WebSocket closed with code:", event.code, event.reason);
          this.isRunning = false;
          // Attempt exponential-backoff reconnect on unexpected drops (not clean close / no-data)
          if (
            event.code !== 1000 &&
            event.code !== 1005 &&
            this._reconnectAttempts < 3 &&
            this._lastStream
          ) {
            const delayMs = 1000 * 2 ** this._reconnectAttempts;
            this._reconnectAttempts++;
            console.warn(
              `[DeepgramSTT] Unexpected close (${event.code}). Reconnecting in ${delayMs}ms (attempt ${this._reconnectAttempts}/3)...`,
            );
            setTimeout(() => {
              void this.start(this._lastStream);
            }, delayMs);
            return;
          }
          if (event.code !== 1000 && event.code !== 1005) {
            this.onError?.(new Error(`Deepgram closed: ${event.code}`));
          }
          this.onClose?.();
        };
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  sendAudio(data: Blob) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && data.size > 0) {
      this.socket.send(data);
    }
  }

  private startMediaRecorder(audioStream: MediaStream) {
    try {
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/aac",
        "audio/wav",
      ];
      let mime = "";
      if (typeof MediaRecorder !== "undefined") {
        for (const c of candidates) {
          if (MediaRecorder.isTypeSupported(c)) {
            mime = c;
            break;
          }
        }
      }
      this.mediaRecorder = mime
        ? new MediaRecorder(audioStream, { mimeType: mime })
        : new MediaRecorder(audioStream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(e.data);
        }
      };
      this.mediaRecorder.start(100);
    } catch (e) {
      console.warn("Failed to start Deepgram MediaRecorder:", e);
    }
  }

  stop() {
    // Reset reconnect state so a manual stop doesn't trigger reconnect
    this._reconnectAttempts = 3;
    this.isRunning = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }
}
