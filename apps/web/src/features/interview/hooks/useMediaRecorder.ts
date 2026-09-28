import { useCallback, useRef, useState } from "react";
import {
  createCompositeStream,
  getAudioStream,
  getCameraStream,
  getMimeType,
  getScreenStream,
} from "../utils/mediaHelpers";

interface MediaRecorderState {
  status: "idle" | "recording" | "paused" | "stopped";
  duration: number;
  error: string | null;
  recordingId: string | null;
}

export function useMediaRecorder() {
  const [state, setState] = useState<MediaRecorderState>({
    status: "idle",
    duration: 0,
    error: null,
    recordingId: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>("");
  const accountIdRef = useRef<string>("");
  const compositeCleanupRef = useRef<(() => void) | null>(null);
  const mimeTypeRef = useRef<string>("video/webm");
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(
    async (
      sessionId: string,
      existingStreams?: {
        camera?: MediaStream;
        screen?: MediaStream | null;
        audio?: MediaStream | null;
      },
      accountId?: string,
    ) => {
      try {
        sessionIdRef.current = sessionId;
        accountIdRef.current = accountId || "";
        chunksRef.current = [];
        setState((prev) => ({ ...prev, status: "recording", error: null }));

        const cameraStream = existingStreams?.camera || (await getCameraStream());
        let screenStream: MediaStream | null = null;
        if (existingStreams) {
          screenStream = existingStreams.screen ?? null;
        } else {
          try {
            screenStream = await getScreenStream();
          } catch {
            screenStream = null;
          }
        }

        let audioStream: MediaStream | null = existingStreams?.audio ?? null;
        if (!audioStream) {
          try {
            audioStream = await getAudioStream();
          } catch {
            audioStream = null;
          }
        }

        let mixedStream: MediaStream;
        let cleanup: (() => void) | null = null;

        if (screenStream && audioStream) {
          const result = createCompositeStream(cameraStream, screenStream, audioStream, {
            cameraWidth: 240,
            cameraHeight: 180,
            cameraMargin: 16,
            frameRate: 15,
          });
          mixedStream = result.stream;
          cleanup = result.cleanup;
        } else if (screenStream) {
          mixedStream = new MediaStream([
            ...cameraStream.getVideoTracks(),
            ...screenStream.getVideoTracks(),
            ...(cameraStream.getAudioTracks() || []),
          ]);
        } else if (audioStream) {
          mixedStream = new MediaStream([
            ...cameraStream.getVideoTracks(),
            ...audioStream.getAudioTracks(),
          ]);
        } else {
          mixedStream = new MediaStream([
            ...cameraStream.getVideoTracks(),
            ...cameraStream.getAudioTracks(),
          ]);
        }

        compositeCleanupRef.current = cleanup;
        streamsRef.current = [
          cameraStream,
          ...(screenStream ? [screenStream] : []),
          ...(audioStream ? [audioStream] : []),
        ];

        const mime = getMimeType();
        mimeTypeRef.current = mime;

        const recorder = mime
          ? new MediaRecorder(mixedStream, { mimeType: mime })
          : new MediaRecorder(mixedStream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onerror = (e) => {
          console.warn("[useMediaRecorder] Recorder error:", e);
          setState((prev) => ({ ...prev, error: "Recording error" }));
        };

        recorder.start(5000); // 5s chunk slices for frequent flushing
        startTimeRef.current = Date.now();

        if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = setInterval(() => {
          setState((prev) => ({
            ...prev,
            duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }));
        }, 1000);
      } catch (err) {
        console.error("[useMediaRecorder] Failed to start:", err);
        setState((prev) => ({ ...prev, status: "idle", error: (err as Error).message }));
        throw err;
      }
    },
    [],
  );

  const stop = useCallback(async (): Promise<{ blob: Blob | null; filePath: string | null }> => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === "inactive") {
        setState((prev) => ({ ...prev, status: "stopped" }));
        if (compositeCleanupRef.current) {
          try {
            compositeCleanupRef.current();
          } catch {}
          compositeCleanupRef.current = null;
        }
        resolve({ blob: null, filePath: null });
        return;
      }

      rec.onstop = async () => {
        setState((prev) => ({ ...prev, status: "stopped" }));

        // Clean up composite stream now that recorder has officially finalized
        if (compositeCleanupRef.current) {
          try {
            compositeCleanupRef.current();
          } catch {}
          compositeCleanupRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "video/webm" });
        let uploadedFilePath: string | null = null;

        // Upload interview video to Supabase Storage via server endpoint
        if (sessionIdRef.current && blob.size > 0) {
          try {
            const formData = new FormData();
            formData.append("sessionId", sessionIdRef.current);
            formData.append("recording", blob, `interview_${sessionIdRef.current}.webm`);
            if (accountIdRef.current) {
              formData.append("accountId", accountIdRef.current);
            }

            const res = await fetch("/api/interview/recording", {
              method: "POST",
              body: formData,
            });

            if (res.ok) {
              const resData = await res.json();
              uploadedFilePath = resData.filePath ?? null;
              console.log("[useMediaRecorder] Recording stored in Supabase:", resData.filePath);
              setState((prev) => ({ ...prev, recordingId: resData.filePath }));
            } else {
              const errData = await res.json().catch(() => ({}));
              console.warn("[useMediaRecorder] Recording upload failed:", errData);
            }
          } catch (uploadErr) {
            console.warn("[useMediaRecorder] Storage upload skipped/failed:", uploadErr);
          }
        } else {
          console.warn("[useMediaRecorder] No recording blob to upload. Blob size:", blob.size);
        }

        resolve({ blob, filePath: uploadedFilePath });
      };

      try {
        if (rec.state === "recording") {
          try {
            rec.requestData();
          } catch (reqErr) {
            console.warn("[useMediaRecorder] requestData warning:", reqErr);
          }
        }
        rec.stop();
      } catch (stopErr) {
        console.warn("[useMediaRecorder] stop error:", stopErr);
        resolve({ blob: null, filePath: null });
      }
    });
  }, []);

  return {
    status: state.status,
    duration: state.duration,
    error: state.error,
    recordingId: state.recordingId,
    start,
    stop,
  };
}
