import { useCallback, useRef, useState } from "react";
import {
  createCompositeStream,
  getAudioStream,
  getCameraStream,
  getMimeType,
  getScreenStream,
} from "../utils/mediaHelpers";

/**
 * 6-second chunk interval for streaming recording patches to storage during the interview.
 */
const CHUNK_INTERVAL_MS = 6000;

interface MediaRecorderState {
  status: "idle" | "recording" | "paused" | "stopped";
  duration: number;
  error: string | null;
  recordingId: string | null;
}

/**
 * Upload a single Blob chunk patch to Supabase Storage with automatic retry.
 * Handles transient network glitches with exponential backoff (1s, 2s, 4s).
 */
async function uploadChunkWithRetry(
  sessionId: string,
  chunkIndex: number,
  chunkBlob: Blob,
  accountId?: string,
  maxRetries = 3,
): Promise<void> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      const formData = new FormData();
      formData.append("action", "upload_chunk");
      formData.append("sessionId", sessionId);
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("chunk", chunkBlob, `chunk_${String(chunkIndex).padStart(5, "0")}.webm`);
      if (accountId) {
        formData.append("accountId", accountId);
      }

      const res = await fetch("/api/interview/recording", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        return; // Upload successful!
      }
      const errJson = await res.json().catch(() => ({}));
      lastError = new Error(errJson.error || `HTTP ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    attempt++;
    if (attempt <= maxRetries) {
      const delayMs = 2 ** (attempt - 1) * 1000;
      console.warn(
        `[useMediaRecorder] Chunk ${chunkIndex} upload attempt ${attempt} failed. Retrying in ${delayMs}ms...`,
        lastError?.message,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(
    `[useMediaRecorder] Chunk ${chunkIndex} upload failed after ${maxRetries + 1} attempts:`,
    lastError,
  );
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
  const chunkIndexRef = useRef<number>(0);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueChunkUpload = useCallback(
    (sessionId: string, chunkIndex: number, chunkBlob: Blob, accountId?: string) => {
      uploadQueueRef.current = uploadQueueRef.current
        .then(() => uploadChunkWithRetry(sessionId, chunkIndex, chunkBlob, accountId))
        .catch((err) => {
          console.warn("[useMediaRecorder] Background chunk upload queue warning:", err);
        });
    },
    [],
  );

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
        chunkIndexRef.current = 0;
        uploadQueueRef.current = Promise.resolve();
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
            const chunk = e.data;
            const index = chunkIndexRef.current++;
            const currentSessionId = sessionIdRef.current;
            const currentAccountId = accountIdRef.current;

            if (currentSessionId) {
              enqueueChunkUpload(currentSessionId, index, chunk, currentAccountId);
            }
          }
        };

        recorder.onerror = (e) => {
          console.warn("[useMediaRecorder] Recorder error:", e);
          setState((prev) => ({ ...prev, error: "Recording error" }));
        };

        // Emit 6-second chunk patches continuously throughout the interview
        recorder.start(CHUNK_INTERVAL_MS);
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
    [enqueueChunkUpload],
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

        // 1. Wait for all queued in-flight chunk uploads to settle
        try {
          await uploadQueueRef.current;
        } catch (chunkWaitErr) {
          console.warn("[useMediaRecorder] Error awaiting chunk uploads:", chunkWaitErr);
        }

        let uploadedFilePath: string | null = null;

        // 2. Finalize streamed chunks on server into a playable recording
        if (sessionIdRef.current && chunkIndexRef.current > 0) {
          try {
            const finalizeRes = await fetch("/api/interview/recording", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "finalize_chunks",
                sessionId: sessionIdRef.current,
                totalChunks: chunkIndexRef.current,
              }),
            });

            if (finalizeRes.ok) {
              const finData = await finalizeRes.json();
              uploadedFilePath = finData.filePath ?? null;
              console.log("[useMediaRecorder] Recording finalized from chunks:", finData.filePath);
              setState((prev) => ({ ...prev, recordingId: finData.filePath }));
            } else {
              const finErrData = await finalizeRes.json().catch(() => ({}));
              console.warn("[useMediaRecorder] Finalize chunks note:", finErrData);
            }
          } catch (finErr) {
            console.warn("[useMediaRecorder] Finalize chunks error:", finErr);
          }
        }

        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "video/webm" });

        // 3. Fallback: If chunk finalization didn't yield a filePath, upload the full assembled blob
        if (!uploadedFilePath && sessionIdRef.current && blob.size > 0) {
          try {
            // Attempt 2a: Direct signed upload URL (bypasses server body limits)
            let directUploadSuccess = false;
            try {
              const urlRes = await fetch(
                `/api/interview/recording?action=get_upload_url&sessionId=${sessionIdRef.current}`,
              );
              if (urlRes.ok) {
                const urlData = await urlRes.json();
                if (urlData.signedUrl && urlData.filePath) {
                  const putRes = await fetch(urlData.signedUrl, {
                    method: "PUT",
                    headers: {
                      "Content-Type": blob.type || "video/webm",
                    },
                    body: blob,
                  });

                  if (putRes.ok) {
                    uploadedFilePath = urlData.filePath;
                    directUploadSuccess = true;
                    // Notify server to link recording path to session and scorecard
                    await fetch("/api/interview/recording", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "confirm_upload",
                        sessionId: sessionIdRef.current,
                        filePath: urlData.filePath,
                      }),
                    }).catch(() => {});
                    console.log(
                      "[useMediaRecorder] Recording stored via signed upload:",
                      urlData.filePath,
                    );
                    setState((prev) => ({ ...prev, recordingId: urlData.filePath }));
                  }
                }
              }
            } catch (signedErr) {
              console.warn("[useMediaRecorder] Signed upload error, trying fallback:", signedErr);
            }

            // Attempt 2b: FormData POST fallback
            if (!directUploadSuccess) {
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
            }
          } catch (uploadErr) {
            console.warn("[useMediaRecorder] Storage upload skipped/failed:", uploadErr);
          }
        } else if (!uploadedFilePath && blob.size === 0) {
          console.warn("[useMediaRecorder] No recording blob to upload. Blob size: 0");
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
