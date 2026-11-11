import { DEFAULT_PUBLIC_DEEPGRAM_API_KEY, getEnv } from "@/env";

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

export function getDeepgramApiKey(): string {
  try {
    const fromEnv = getEnv().NEXT_PUBLIC_DEEPGRAM_API_KEY;
    if (fromEnv) return fromEnv;
  } catch {}
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY) {
    return process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
  }
  return DEFAULT_PUBLIC_DEEPGRAM_API_KEY;
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
  "Groq",
  "Gemini",
  "SkillGap",
  "ScalePods",
  "LiDAR",
  "Llama",
  "Meta Graph",
  "WhatsApp",
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
  Groq: 10,
  Gemini: 8,
  SkillGap: 8,
  ScalePods: 8,
  LiDAR: 8,
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
  private _pendingAudio: Blob[] = [];
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
    this.apiKey = options.apiKey || getDeepgramApiKey();
    this.model = options.model || "nova-3";
    this.language = options.language || "en";
    this.keywords = options.keywords || DEFAULT_TECH_KEYWORDS;
    this.onTranscript = options.onTranscript;
    this.onError = options.onError;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
  }

  static isConfigured(): boolean {
    const key = getDeepgramApiKey();
    return Boolean(key && key.trim().length > 0 && !key.includes("your-deepgram-api-key"));
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && typeof WebSocket !== "undefined");
  }

  start(audioStream?: MediaStream): Promise<void> {
    if (!this.apiKey) {
      this.apiKey = getDeepgramApiKey();
    }
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
          endpointing: "2500",
          filler_words: "false",
        });

        const isNova3 = this.model.startsWith("nova-3");
        for (const kw of this.keywords) {
          if (isNova3) {
            // Nova-3 uses keyterm prompting (plain terms without intensifiers)
            params.append("keyterm", kw);
          } else {
            // Older models (nova-2) use keywords with boost intensifier
            const boost = KEYWORD_BOOST_WEIGHTS[kw];
            params.append("keywords", boost ? `${kw}:${boost}` : kw);
          }
        }

        const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
        this.socket = new WebSocket(url, ["token", this.apiKey]);

        this.socket.onopen = () => {
          this._reconnectAttempts = 0;
          this.isRunning = true;
          // Immediately flush any queued audio chunks (Chunk 0 contains EBML container header!)
          if (this._pendingAudio.length > 0) {
            for (const chunk of this._pendingAudio) {
              if (chunk.size > 0 && this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(chunk);
              }
            }
            this._pendingAudio = [];
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
              const liveText = `${this.accumulatedFinalTranscript} ${text.trim()}`.trim();
              this.onTranscript?.(liveText, false);
            }
          } catch (err) {
            console.error("[DeepgramSTT] Error parsing socket message:", err);
          }
        };

        this.socket.onerror = () => {
          if (!this.isRunning && !this.socket) return;
          const err = new Error("Deepgram WebSocket error");
          this.onError?.(err);
          if (!this.isRunning) reject(err);
        };

        this.socket.onclose = (event) => {
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
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      if (this._pendingAudio.length > 0) {
        for (const chunk of this._pendingAudio) {
          if (chunk.size > 0 && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(chunk);
          }
        }
        this._pendingAudio = [];
      }
      if (data.size > 0) {
        this.socket.send(data);
      }
    } else if (data.size > 0 && this._pendingAudio.length < 50) {
      // Buffer early chunks while handshake completes so container header is preserved
      this._pendingAudio.push(data);
    }
  }

  stop() {
    // Reset reconnect state and detach handlers before closing so clean teardown emits no warnings
    this._reconnectAttempts = 3;
    this.isRunning = false;
    this._pendingAudio = [];
    if (this.socket) {
      const sock = this.socket;
      this.socket = null;
      sock.onmessage = null;
      sock.onerror = null;
      sock.onclose = null;
      try {
        if (sock.readyState === WebSocket.OPEN) {
          sock.onopen = null;
          sock.close(1000, "stopped");
        } else if (sock.readyState === WebSocket.CONNECTING) {
          // Wait for handshake completion before closing so Chrome doesn't log
          // "WebSocket is closed before the connection is established."
          sock.onopen = () => {
            try {
              sock.close(1000, "stopped");
            } catch {}
          };
        } else {
          sock.onopen = null;
        }
      } catch {}
    }
  }
}
