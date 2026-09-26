export function getMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export async function getCameraStream(constraints?: MediaTrackConstraints, timeoutMs = 6000): Promise<MediaStream> {
  const tmr = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
  const stream = await Promise.race([
    navigator.mediaDevices.getUserMedia({ video: constraints || { width: 640, height: 480, frameRate: 15 } }),
    tmr,
  ]) as MediaStream;
  return stream;
}

export async function getMediaDevicesStream(): Promise<{ camera: MediaStream; audio: MediaStream | null }> {
  try {
    const combined = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 15 },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const videoTracks = combined.getVideoTracks();
    const audioTracks = combined.getAudioTracks();
    const camera = new MediaStream(videoTracks);
    const audio = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
    return { camera, audio };
  } catch {
    const camera = await getCameraStream();
    const audio = await getAudioStream();
    return { camera, audio };
  }
}

export const OPTIMAL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
  googEchoCancellation: true,
  googAutoGainControl: true,
  googNoiseSuppression: true,
  googHighpassFilter: true,
  googNoiseSuppression2: true,
  googEchoCancellation2: true,
} as unknown as MediaTrackConstraints;

export async function getAudioStream(timeoutMs = 4000): Promise<MediaStream | null> {
  const audioOnlyTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));

  try {
    return await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: OPTIMAL_AUDIO_CONSTRAINTS }),
      audioOnlyTimeout,
    ]) as MediaStream;
  } catch {}

  try {
    return await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }),
      audioOnlyTimeout,
    ]) as MediaStream;
  } catch {}

  try {
    return await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true }),
      audioOnlyTimeout,
    ]) as MediaStream;
  } catch {}

  return null;
}

export async function getScreenStream(timeoutMs = 15000): Promise<MediaStream | null> {
  const tmr = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  );
  try {
    const stream = await Promise.race([
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }),
      tmr,
    ]) as MediaStream;
    return stream;
  } catch (err: unknown) {
    if ((err as Error)?.message === 'timeout') {
      console.warn(`getScreenStream timed out after ${timeoutMs}ms`);
    }
    return null;
  }
}

export function stopStream(stream?: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

export interface CompositeStreamOptions {
  cameraWidth?: number;
  cameraHeight?: number;
  cameraMargin?: number;
  frameRate?: number;
}

/**
 * Creates a canvas composite stream where screen share is full background
 * and webcam is a picture-in-picture box in the bottom-right corner.
 */
export function createCompositeStream(
  cameraStream: MediaStream,
  screenStream: MediaStream,
  audioStream: MediaStream,
  options: CompositeStreamOptions = {}
): { stream: MediaStream; cleanup: () => void } {
  const {
    cameraWidth = 240,
    cameraHeight = 180,
    cameraMargin = 16,
    frameRate = 15,
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  const screenVideo = document.createElement('video');
  screenVideo.srcObject = screenStream;
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  void screenVideo.play().catch(() => {});

  const cameraVideo = document.createElement('video');
  cameraVideo.srcObject = cameraStream;
  cameraVideo.muted = true;
  cameraVideo.playsInline = true;
  void cameraVideo.play().catch(() => {});

  let animationFrameId: number;
  let isRunning = true;

  const draw = () => {
    if (!isRunning) return;
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (screenVideo.readyState >= 2) {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
      }

      if (cameraVideo.readyState >= 2) {
        const x = canvas.width - cameraWidth - cameraMargin;
        const y = canvas.height - cameraHeight - cameraMargin;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 2, y - 2, cameraWidth + 4, cameraHeight + 4);
        ctx.drawImage(cameraVideo, x, y, cameraWidth, cameraHeight);
        ctx.restore();
      }
    }
    animationFrameId = requestAnimationFrame(draw);
  };

  animationFrameId = requestAnimationFrame(draw);

  const canvasStream = canvas.captureStream(frameRate);
  const audioTracks = audioStream.getAudioTracks();
  const mixedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(audioTracks.length > 0 ? audioTracks : []),
  ]);

  const cleanup = () => {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
    screenVideo.pause();
    cameraVideo.pause();
    screenVideo.srcObject = null;
    cameraVideo.srcObject = null;
  };

  return { stream: mixedStream, cleanup };
}
