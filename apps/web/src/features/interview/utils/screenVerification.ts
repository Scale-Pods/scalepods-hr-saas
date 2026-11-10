export type BeaconColor = "R" | "G" | "B" | "Y";

export const BEACON_COLOR_HEX: Record<BeaconColor, string> = {
  R: "#ff0040",
  G: "#00e650",
  B: "#006eff",
  Y: "#ffd200",
};

/**
 * Six distinct 2x2 permutations [topLeft, topRight, bottomLeft, bottomRight].
 * Adjacent steps change all 4 quadrants to defeat static-image spoofing.
 */
export const BEACON_PATTERNS: ReadonlyArray<
  readonly [BeaconColor, BeaconColor, BeaconColor, BeaconColor]
> = [
  ["R", "G", "B", "Y"],
  ["G", "B", "Y", "R"],
  ["B", "Y", "R", "G"],
  ["Y", "R", "G", "B"],
  ["R", "B", "Y", "G"],
  ["G", "Y", "R", "B"],
];

export function getBeaconPattern(
  step: number,
): readonly [BeaconColor, BeaconColor, BeaconColor, BeaconColor] {
  const idx =
    ((Math.floor(step) % BEACON_PATTERNS.length) + BEACON_PATTERNS.length) % BEACON_PATTERNS.length;
  return BEACON_PATTERNS[idx];
}

/**
 * Classifies a quadrant's average RGB into one of the 4 high-saturation beacon hues.
 * Tolerant of Display-P3 conversion, YUV 4:2:0 subsampling, and hardware scaler compression.
 */
export function classifyRgbCell(r: number, g: number, b: number): BeaconColor | null {
  if (r >= 140 && g >= 120 && r - b >= 70 && g - b >= 55) return "Y";
  if (r >= 130 && r - g >= 60 && r - b >= 50) return "R";
  if (g >= 130 && g - r >= 50 && g - b >= 40) return "G";
  if (b >= 130 && b - r >= 60 && b - g >= 35) return "B";
  return null;
}

/** Checks whether the 4 sampled [r,g,b] quadrant averages match the current or previous pattern. */
export function verifyBeaconQuadrants(
  samples: Array<[number, number, number]>,
  expected: readonly BeaconColor[],
  fallbackExpected?: readonly BeaconColor[] | null,
): boolean {
  if (samples.length !== 4 || expected.length !== 4) return false;

  const classified = samples.map(([r, g, b]) => classifyRgbCell(r, g, b));
  if (classified.some((c) => c === null)) return false;

  const matches = (target: readonly BeaconColor[]) =>
    target.length === 4 && classified.every((c, idx) => c === target[idx]);

  if (matches(expected)) return true;
  if (fallbackExpected && matches(fallbackExpected)) return true;
  return false;
}

function averageBoxRgb(
  data: Uint8ClampedArray,
  canvasWidth: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
): [number, number, number] {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * canvasWidth + x) * 4;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  }

  if (count === 0) return [0, 0, 0];
  return [rSum / count, gSum / count, bSum / count];
}

/**
 * Samples the screen-share <video> at the live viewport coordinates of the rotating beacon.
 * Returns `null` when the capture stream or viewport is not ready yet (never counts as a failure),
 * `true` when the shared monitor displays the interview's live beacon, and `false` otherwise.
 */
export function verifyScreenShareFrame(
  video: HTMLVideoElement,
  beaconEl: HTMLElement,
  canvas: HTMLCanvasElement,
  expected: readonly BeaconColor[],
  fallbackExpected?: readonly BeaconColor[] | null,
): boolean | null {
  if (
    typeof window === "undefined" ||
    !video ||
    video.readyState < 2 ||
    video.paused ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0 ||
    window.innerWidth <= 0 ||
    window.innerHeight <= 0
  ) {
    return null;
  }

  const rect = beaconEl.getBoundingClientRect();
  if (rect.width < 12 || rect.height < 12) return null;

  const scaleX = video.videoWidth / window.innerWidth;
  const scaleY = video.videoHeight / window.innerHeight;

  const vx = Math.max(0, Math.floor(rect.left * scaleX));
  const vy = Math.max(0, Math.floor(rect.top * scaleY));
  const vw = Math.max(4, Math.min(video.videoWidth - vx, Math.round(rect.width * scaleX)));
  const vh = Math.max(4, Math.min(video.videoHeight - vy, Math.round(rect.height * scaleY)));

  if (vw < 4 || vh < 4) return null;

  const size = 32;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(video, vx, vy, vw, vh, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size).data;

    // Sample inner 8x8 center of each 16x16 quadrant to avoid border/chroma-subsampling bleed
    const samples: Array<[number, number, number]> = [
      averageBoxRgb(imgData, size, 4, 12, 4, 12),
      averageBoxRgb(imgData, size, 20, 28, 4, 12),
      averageBoxRgb(imgData, size, 4, 12, 20, 28),
      averageBoxRgb(imgData, size, 20, 28, 20, 28),
    ];

    return verifyBeaconQuadrants(samples, expected, fallbackExpected);
  } catch {
    return null;
  }
}
