import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import { withQuietTfliteInit } from "./mediapipeShared";

export interface DetectedProhibitedObject {
  label: string;
  score: number;
}

export const PROHIBITED_OBJECT_THRESHOLDS: Record<string, number> = {
  "cell phone": 0.45,
  remote: 0.55,
  book: 0.55,
  laptop: 0.6,
};

let objectDetector: ObjectDetector | null = null;
let initPromise: Promise<ObjectDetector | null> | null = null;
let initFailed = false;
let lastVideoTimestampMs = 0;

/** Extracts prohibited items above category-specific confidence thresholds from MediaPipe detections. */
export function filterProhibitedDetections(
  detections: Array<{ categories?: Array<{ categoryName?: string; score?: number }> }>,
): DetectedProhibitedObject[] {
  const found: DetectedProhibitedObject[] = [];
  for (const det of detections) {
    const cat = det.categories?.[0];
    const label = (cat?.categoryName || "").toLowerCase().trim();
    const score = Number(cat?.score || 0);
    const minScore = PROHIBITED_OBJECT_THRESHOLDS[label];
    if (minScore !== undefined && score >= minScore) {
      found.push({ label: label === "remote" ? "cell phone" : label, score });
    }
  }
  return found;
}

async function getObjectDetector(): Promise<ObjectDetector | null> {
  if (objectDetector) return objectDetector;
  if (initFailed) return null;
  if (initPromise) return initPromise;

  initPromise = withQuietTfliteInit(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );

      objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.42,
        maxResults: 5,
        categoryAllowlist: Object.keys(PROHIBITED_OBJECT_THRESHOLDS),
      });

      return objectDetector;
    } catch {
      initFailed = true;
      return null;
    } finally {
      initPromise = null;
    }
  });

  return initPromise;
}

/**
 * Runs camera object detection for mobile phones, secondary devices, and books/notes.
 */
export async function detectProhibitedObjects(
  videoElement: HTMLVideoElement,
): Promise<DetectedProhibitedObject[]> {
  if (!videoElement || videoElement.readyState < 2 || videoElement.paused) {
    return [];
  }

  const detector = await getObjectDetector();
  if (!detector) return [];

  try {
    const nowMs = Math.max(lastVideoTimestampMs + 1, Math.round(performance.now()));
    lastVideoTimestampMs = nowMs;
    const result = detector.detectForVideo(videoElement, nowMs);
    return filterProhibitedDetections(result.detections || []);
  } catch {
    return [];
  }
}

export function disposeObjectDetector(): void {
  if (objectDetector) {
    try {
      objectDetector.close();
    } catch {}
    objectDetector = null;
  }
  initPromise = null;
  initFailed = false;
  lastVideoTimestampMs = 0;
}
