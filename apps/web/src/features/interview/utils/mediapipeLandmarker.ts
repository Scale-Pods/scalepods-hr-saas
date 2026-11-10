/**
 * mediapipeLandmarker.ts
 *
 * Singleton wrapper around @mediapipe/tasks-vision FaceLandmarker.
 * Detects gaze away and head down posture for integrity monitoring.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface BehaviorResult {
  gazeAway: boolean;
  headDown: boolean;
  faceCount: number;
  yawDeg: number;
  pitchDeg: number;
}

const GAZE_BLEND_THRESHOLD = 0.3;
const GAZE_YAW_THRESHOLD = 18;
const HEAD_DOWN_BLEND_THRESHOLD = 0.3;
const HEAD_DOWN_PITCH_THRESHOLD = -14;

let landmarker: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker | null> | null = null;
let initFailed = false;
let lastVideoTimestampMs = 0;

/** Suppresses MediaPipe WASM/TFLite C++ XNNPACK delegate diagnostic messages during init. */
async function withQuietTfliteInit<T>(fn: () => Promise<T>): Promise<T> {
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

async function getLandmarker(): Promise<FaceLandmarker | null> {
  if (landmarker) return landmarker;
  if (initFailed) return null;
  if (initPromise) return initPromise;

  initPromise = withQuietTfliteInit(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );

      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      return landmarker;
    } catch {
      initFailed = true;
      return null;
    } finally {
      initPromise = null;
    }
  });

  return initPromise;
}

function extractHeadPose(matrix: number[]): { yawDeg: number; pitchDeg: number } {
  if (!matrix || matrix.length < 16) return { yawDeg: 0, pitchDeg: 0 };
  const r00 = matrix[0];
  const r10 = matrix[1];
  const r20 = matrix[2];
  const r21 = matrix[6];
  const r22 = matrix[10];

  const pitchRad = Math.atan2(-r21, r22);
  const yawRad = Math.atan2(r20, Math.sqrt(r00 * r00 + r10 * r10));

  return {
    pitchDeg: (pitchRad * 180) / Math.PI,
    yawDeg: (yawRad * 180) / Math.PI,
  };
}

export async function detectBehavior(
  videoElement: HTMLVideoElement,
): Promise<BehaviorResult | null> {
  if (!videoElement || videoElement.readyState < 2 || videoElement.paused) {
    return null;
  }

  const lm = await getLandmarker();
  if (!lm) return null;

  try {
    const nowMs = Math.max(lastVideoTimestampMs + 1, Math.round(performance.now()));
    lastVideoTimestampMs = nowMs;
    const result = lm.detectForVideo(videoElement, nowMs);
    const faceCount = result.faceLandmarks.length;

    if (faceCount === 0) {
      return { gazeAway: false, headDown: false, faceCount: 0, yawDeg: 0, pitchDeg: 0 };
    }

    const blendshapes = result.faceBlendshapes[0]?.categories || [];
    const shapeMap = new Map<string, number>(blendshapes.map((c) => [c.categoryName, c.score]));

    const lookLeftScore = Math.max(
      shapeMap.get("eyeLookOutLeft") || 0,
      shapeMap.get("eyeLookInRight") || 0,
    );
    const lookRightScore = Math.max(
      shapeMap.get("eyeLookOutRight") || 0,
      shapeMap.get("eyeLookInLeft") || 0,
    );
    const lookDownScore = Math.max(
      shapeMap.get("eyeLookDownLeft") || 0,
      shapeMap.get("eyeLookDownRight") || 0,
    );

    const matrix = result.facialTransformationMatrixes?.[0]?.data as number[] | undefined;
    const { yawDeg, pitchDeg } = matrix ? extractHeadPose(matrix) : { yawDeg: 0, pitchDeg: 0 };

    const eyeGazeAway =
      lookLeftScore > GAZE_BLEND_THRESHOLD || lookRightScore > GAZE_BLEND_THRESHOLD;
    const headTurned = Math.abs(yawDeg) > GAZE_YAW_THRESHOLD;
    const gazeAway = eyeGazeAway && headTurned;

    const eyeLookingDown = lookDownScore > HEAD_DOWN_BLEND_THRESHOLD;
    const headTiltedDown = pitchDeg < HEAD_DOWN_PITCH_THRESHOLD;
    const headDown = eyeLookingDown && headTiltedDown;

    return { gazeAway, headDown, faceCount, yawDeg, pitchDeg };
  } catch {
    return null;
  }
}

export function disposeLandmarker(): void {
  if (landmarker) {
    try {
      landmarker.close();
    } catch {}
    landmarker = null;
  }
  initPromise = null;
  initFailed = false;
  lastVideoTimestampMs = 0;
}
