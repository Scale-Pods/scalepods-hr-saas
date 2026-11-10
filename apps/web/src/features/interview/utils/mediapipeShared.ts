/**
 * Suppresses MediaPipe WASM/TFLite C++ diagnostic log spam (XNNPACK delegate, OpenGL, Feedback manager)
 * strictly for the duration of model creation.
 */
export async function withQuietTfliteInit<T>(fn: () => Promise<T>): Promise<T> {
  const origInfo = console.info;
  const origWarn = console.warn;
  const origLog = console.log;
  const isTfliteNoise = (args: unknown[]) =>
    args.some(
      (a) =>
        typeof a === "string" &&
        (a.includes("TensorFlow Lite") ||
          a.includes("XNNPACK") ||
          a.includes("Feedback manager requires") ||
          a.includes("OpenGL")),
    );
  console.info = (...args: unknown[]) => {
    if (!isTfliteNoise(args)) origInfo.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    if (!isTfliteNoise(args)) origWarn.apply(console, args);
  };
  console.log = (...args: unknown[]) => {
    if (!isTfliteNoise(args)) origLog.apply(console, args);
  };
  try {
    return await fn();
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
    console.log = origLog;
  }
}
