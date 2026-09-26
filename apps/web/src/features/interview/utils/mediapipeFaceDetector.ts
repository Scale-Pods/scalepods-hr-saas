/**
 * mediapipeFaceDetector.ts
 *
 * Singleton wrapper around @mediapipe/tasks-vision FaceDetector.
 * The WASM model (~2 MB) is downloaded once on first call and cached.
 */

import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

let detector: FaceDetector | null = null;
let initialising = false;
let initFailed = false;

async function getDetector(): Promise<FaceDetector | null> {
  if (detector) return detector;
  if (initFailed) return null;
  if (initialising) return null;

  initialising = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.6,
      minSuppressionThreshold: 0.4,
    });

    return detector;
  } catch (err) {
    console.warn('[MediaPipe] FaceDetector initialisation failed:', err);
    initFailed = true;
    return null;
  } finally {
    initialising = false;
  }
}

/**
 * Returns number of faces currently detected in videoElement.
 * Returns -1 if detector is not yet ready.
 */
export async function detectFaces(videoElement: HTMLVideoElement): Promise<number> {
  if (!videoElement || videoElement.readyState < 2 || videoElement.paused) {
    return -1;
  }

  const d = await getDetector();
  if (!d) return -1;

  try {
    const result = d.detectForVideo(videoElement, performance.now());
    return result.detections.length;
  } catch {
    return -1;
  }
}

export function disposeFaceDetector(): void {
  if (detector) {
    try {
      detector.close();
    } catch {}
    detector = null;
  }
  initialising = false;
  initFailed = false;
}
