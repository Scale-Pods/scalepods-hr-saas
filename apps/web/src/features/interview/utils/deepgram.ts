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
  'n8n:5',
  'Zapier:3',
  'Integromat:3',
  'LangChain:3',
  'LlamaIndex:3',
  'FastAPI:3',
  'GraphQL:3',
  'tRPC:3',
  'Supabase:3',
  'PostgreSQL:3',
  'MongoDB:3',
  'Redis:3',
  'Kafka:3',
  'Docker:3',
  'Kubernetes:3',
  'React:3',
  'Next.js:3',
  'Vue.js:3',
  'Nuxt.js:3',
  'TypeScript:3',
  'JavaScript:3',
  'PyTorch:3',
  'TensorFlow:3',
  'OpenAI:3',
  'Claude:3',
  'Vercel:3',
  'Netlify:3',
  'WebSockets:3',
  'WebRTC:3',
  'microservices:3'
];

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

  constructor(options: DeepgramSTTOptions = {}) {
    this.apiKey =
      options.apiKey ||
      (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY : '') ||
      '';
    this.model = options.model || 'nova-2';
    this.language = options.language || 'en';
    this.keywords = options.keywords || DEFAULT_TECH_KEYWORDS;
    this.onTranscript = options.onTranscript;
    this.onError = options.onError;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
  }

  static isConfigured(): boolean {
    return Boolean(
      typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
    );
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && typeof WebSocket !== 'undefined');
  }

  start(audioStream: MediaStream): Promise<void> {
    if (!this.apiKey) {
      return Promise.reject(new Error('Deepgram API key not provided'));
    }

    return new Promise((resolve, reject) => {
      try {
        const params = new URLSearchParams({
          model: this.model,
          language: this.language,
          smart_format: 'true',
          punctuate: 'true',
          interim_results: 'true',
        });

        for (const kw of this.keywords) {
          params.append('keywords', kw);
        }

        const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
        this.socket = new WebSocket(url, ['token', this.apiKey]);

        this.socket.onopen = () => {
          this.isRunning = true;
          this.startMediaRecorder(audioStream);
          this.onOpen?.();
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const alt = data.channel?.alternatives?.[0];
            if (alt?.transcript) {
              const isFinal = Boolean(data.is_final);
              this.onTranscript?.(alt.transcript, isFinal);
            }
          } catch {}
        };

        this.socket.onerror = (event) => {
          console.warn('[DeepgramSTT] WebSocket error event:', event);
          const err = new Error('Deepgram WebSocket error');
          this.onError?.(err);
          if (!this.isRunning) reject(err);
        };

        this.socket.onclose = (event) => {
          console.log('[DeepgramSTT] WebSocket closed with code:', event.code, event.reason);
          this.isRunning = false;
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

  private startMediaRecorder(audioStream: MediaStream) {
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      this.mediaRecorder = new MediaRecorder(audioStream, { mimeType: mime });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(e.data);
        }
      };
      this.mediaRecorder.start(250);
    } catch (e) {
      console.warn('Failed to start Deepgram MediaRecorder:', e);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
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
