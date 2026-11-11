const MEDIAPIPE_NOISE_RE =
  /[IWE]\d{4}\s|\b(?:face_landmarker_graph|inference_feedback_manager|gl_context(?:_webgl)?)\.cc\b|TensorFlow Lite|XNNPACK|Feedback manager requires|OpenGL error checking|Graph successfully started running|Graph finished closing successfully|Successfully destroyed WebGL context/;

function isMediapipeNoise(args: unknown[]): boolean {
  return args.some((a) => typeof a === "string" && MEDIAPIPE_NOISE_RE.test(a));
}

let quietRefCount = 0;
let restoreConsole: (() => void) | null = null;

/**
 * Installs a ref-counted console filter suppressing C++/WASM MediaPipe diagnostic noise
 * across async initialization, first-frame graph startup, and WebGL teardown.
 * Returns a release callback that restores original console methods once all holds finish.
 */
export function acquireMediapipeQuietConsole(): () => void {
  if (quietRefCount === 0 && typeof console !== "undefined") {
    const origInfo = console.info;
    const origWarn = console.warn;
    const origLog = console.log;
    const origError = console.error;

    console.info = (...args: unknown[]) => {
      if (!isMediapipeNoise(args)) origInfo.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      if (!isMediapipeNoise(args)) origWarn.apply(console, args);
    };
    console.log = (...args: unknown[]) => {
      if (!isMediapipeNoise(args)) origLog.apply(console, args);
    };
    console.error = (...args: unknown[]) => {
      if (!isMediapipeNoise(args)) origError.apply(console, args);
    };

    restoreConsole = () => {
      console.info = origInfo;
      console.warn = origWarn;
      console.log = origLog;
      console.error = origError;
      restoreConsole = null;
    };
  }

  quietRefCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    quietRefCount = Math.max(0, quietRefCount - 1);
    if (quietRefCount === 0) {
      restoreConsole?.();
    }
  };
}

/**
 * Suppresses MediaPipe WASM/TFLite C++ diagnostic log spam strictly for the duration of `fn`.
 */
export async function withQuietTfliteInit<T>(fn: () => Promise<T>): Promise<T> {
  const release = acquireMediapipeQuietConsole();
  try {
    return await fn();
  } finally {
    release();
  }
}
