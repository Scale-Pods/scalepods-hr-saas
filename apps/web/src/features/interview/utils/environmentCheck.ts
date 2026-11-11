export interface DeviceCheckResult {
  ok: boolean;
  deviceLabel: string;
  reason: string | null;
}

export interface DisplayCheckResult {
  ok: boolean;
  screenCount: number;
  apiSupported: boolean;
  reason: string | null;
}

interface NavigatorUAData {
  mobile?: boolean;
  platform?: string;
}

/**
 * Verifies the interview is running on a desktop/laptop device.
 * Blocks phones, tablets, iPads, and mobile WebViews while allowing desktop touch laptops
 * that report a fine primary pointer (mouse/trackpad).
 */
export function checkDesktopDevice(): DeviceCheckResult {
  if (typeof navigator === "undefined") {
    return { ok: true, deviceLabel: "Desktop", reason: null };
  }

  const ua = navigator.userAgent || "";
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const maxTouch = navigator.maxTouchPoints ?? 0;

  if (uaData?.mobile === true) {
    return {
      ok: false,
      deviceLabel: "Mobile Device",
      reason:
        "Mobile devices are not permitted. Please join this interview from a laptop or desktop PC.",
    };
  }

  const mobileUaRe =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Kindle|Silk|PlayBook|CriOS\/.+Mobile|FxiOS/i;
  if (mobileUaRe.test(ua)) {
    return {
      ok: false,
      deviceLabel: /iPad|Tablet|Silk|PlayBook/i.test(ua) ? "Tablet" : "Mobile Device",
      reason:
        "Phones and tablets are not permitted. Please open the interview link on a laptop or desktop PC.",
    };
  }

  // iPadOS Safari identifies itself as Macintosh in UA but reports multi-touch without a fine pointer
  const isMacUA = /Macintosh/i.test(ua);
  const hasFinePointer =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: fine)").matches
      : true;

  if (isMacUA && maxTouch > 1 && !hasFinePointer) {
    return {
      ok: false,
      deviceLabel: "iPad / Tablet",
      reason: "iPads and tablets are not permitted. Please use a laptop or desktop computer.",
    };
  }

  if (!hasFinePointer && maxTouch > 1) {
    return {
      ok: false,
      deviceLabel: "Touchscreen Tablet",
      reason: "A laptop or desktop PC with a mouse/trackpad is required for this interview.",
    };
  }

  const platform = uaData?.platform || navigator.platform || "Desktop PC";
  return { ok: true, deviceLabel: platform, reason: null };
}

/**
 * Verifies only a single display is active using the synchronous `screen.isExtended` check
 * on Chromium browsers. Non-Chromium browsers (Safari/Firefox) do not expose `isExtended`
 * and are permitted with screen-share-only display enforcement (`displaySurface: "monitor"`).
 */
export function checkSingleDisplay(): DisplayCheckResult {
  if (typeof window === "undefined" || !window.screen) {
    return { ok: true, screenCount: 1, apiSupported: false, reason: null };
  }

  const extScreen = window.screen as Screen & { isExtended?: boolean };
  if (typeof extScreen.isExtended === "boolean") {
    if (extScreen.isExtended) {
      return {
        ok: false,
        screenCount: 2,
        apiSupported: true,
        reason:
          "Multiple monitors detected. Please disconnect all external displays so only one screen is connected.",
      };
    }
    return { ok: true, screenCount: 1, apiSupported: true, reason: null };
  }

  // Safari / Firefox fallback: allow with screen-share-only enforcement
  return { ok: true, screenCount: 1, apiSupported: false, reason: null };
}

export interface FrameBrightnessResult {
  avgLuminance: number;
  brightRatio: number;
  isBlack: boolean;
}

/** Evaluates RGBA pixel buffer brightness to detect closed hardware shutters / covered lenses. */
export function analyzeFrameBrightness(data: Uint8ClampedArray): FrameBrightnessResult {
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount === 0) {
    return { avgLuminance: 0, brightRatio: 0, isBlack: false };
  }

  let lumSum = 0;
  let brightCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lumSum += lum;
    if (r > 28 || g > 28 || b > 28) {
      brightCount++;
    }
  }

  const avgLuminance = lumSum / pixelCount;
  const brightRatio = brightCount / pixelCount;
  return {
    avgLuminance,
    brightRatio,
    isBlack: avgLuminance < 14 && brightRatio < 0.03,
  };
}

let sharedCheckCanvas: HTMLCanvasElement | null = null;

/**
 * Checks whether a live <video> element is emitting solid black frames (closed shutter / covered lens).
 * Returns `null` when the video element or 2D canvas context is not ready yet.
 */
export function isVideoFrameBlack(
  video: HTMLVideoElement | null | undefined,
  canvas?: HTMLCanvasElement | null,
): boolean | null {
  if (
    !video ||
    video.readyState < 2 ||
    video.paused ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    return null;
  }

  let targetCanvas = canvas || null;
  if (!targetCanvas && typeof document !== "undefined") {
    if (!sharedCheckCanvas) {
      sharedCheckCanvas = document.createElement("canvas");
    }
    targetCanvas = sharedCheckCanvas;
  }
  if (!targetCanvas) return null;

  const size = 32;
  if (targetCanvas.width !== size) targetCanvas.width = size;
  if (targetCanvas.height !== size) targetCanvas.height = size;

  const ctx = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(video, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    return analyzeFrameBrightness(data).isBlack;
  } catch {
    return null;
  }
}
