interface VendorDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
}

interface VendorHTMLElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as VendorDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as VendorDocument;
  const elem = document.documentElement as VendorHTMLElement | null;
  if (!elem) return false;
  const hasRequest =
    typeof elem.requestFullscreen === "function" ||
    typeof elem.webkitRequestFullscreen === "function";
  if (!hasRequest) return false;
  if (doc.fullscreenEnabled === false || doc.webkitFullscreenEnabled === false) {
    return false;
  }
  return true;
}

export async function enterFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (getFullscreenElement()) return true;
  if (!isFullscreenSupported()) return false;

  const elem = document.documentElement as VendorHTMLElement;
  try {
    if (typeof elem.requestFullscreen === "function") {
      await elem.requestFullscreen();
    } else if (typeof elem.webkitRequestFullscreen === "function") {
      await elem.webkitRequestFullscreen();
    }
    return Boolean(getFullscreenElement());
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  if (!getFullscreenElement()) return;
  try {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
    }
  } catch {
    // Ignore errors when document is no longer active
  }
}
