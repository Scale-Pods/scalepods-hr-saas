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
