import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { BUCKETS } from "@/lib/storage";

// Primary bucket for interview recordings
const RECORDINGS_BUCKET = BUCKETS.recordings; // "interview-recordings"

// Service role client to bypass storage RLS for recording uploads
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase credentials are not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Helper to merge all chunk files for a session into a single playable recording.webm
async function mergeChunksForSession(
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  accountId: string,
  sessionId: string,
): Promise<{ filePath: string | null; error?: string }> {
  const chunksFolder = `${accountId}/${sessionId}/chunks`;
  const { data: chunkFiles, error: listErr } = await supabaseAdmin.storage
    .from(RECORDINGS_BUCKET)
    .list(chunksFolder, { limit: 500 });

  if (listErr || !chunkFiles || chunkFiles.length === 0) {
    return { filePath: null, error: listErr?.message || "No chunks found" };
  }

  // Sort chunks numerically: chunk_00000.webm, chunk_00001.webm, etc.
  const sorted = [...chunkFiles]
    .filter((f) => f.name.endsWith(".webm") && !f.name.startsWith("."))
    .sort((a, b) => {
      const ai = parseInt(a.name.replace(/[^0-9]/g, ""), 10);
      const bi = parseInt(b.name.replace(/[^0-9]/g, ""), 10);
      return (Number.isNaN(ai) ? 0 : ai) - (Number.isNaN(bi) ? 0 : bi);
    });

  if (sorted.length === 0) {
    return { filePath: null, error: "No valid chunk files found" };
  }

  const buffers: Buffer[] = [];

  for (const file of sorted) {
    const { data: blob, error: downloadErr } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .download(`${chunksFolder}/${file.name}`);

    if (downloadErr || !blob) {
      console.warn(`[recording API] Failed to download chunk ${file.name}:`, downloadErr);
      continue;
    }
    const arrBuf = await blob.arrayBuffer();
    buffers.push(Buffer.from(arrBuf));
  }

  if (buffers.length === 0) {
    return {
      filePath: `${chunksFolder}/${sorted[0].name}`,
      error: "Failed to download chunk buffers",
    };
  }

  const combined = Buffer.concat(buffers);
  const finalFilePath = `${accountId}/${sessionId}/recording.webm`;

  // Attempt to upload merged single file (may be subject to bucket file_size_limit)
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(RECORDINGS_BUCKET)
    .upload(finalFilePath, combined, {
      contentType: "video/webm",
      upsert: true,
    });

  if (uploadErr) {
    console.warn(
      `[recording API] Merged recording upload notice (${uploadErr.message}). Chunks (${sorted.length}) remain available for direct playback.`,
    );
    // Return the first chunk path as valid entry point so the session has a recording path
    return { filePath: `${chunksFolder}/${sorted[0].name}` };
  }

  console.log(
    `[recording API] Successfully merged ${buffers.length} chunks into ${finalFilePath} (${combined.length} bytes)`,
  );
  return { filePath: finalFilePath };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // 1. JSON-based actions
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const { action, sessionId, filePath } = body;

      // Finalize and stitch all streamed chunks
      if (action === "finalize_chunks" && sessionId) {
        const supabaseAdmin = getAdminSupabase();
        const { data: sessionRow } = await supabaseAdmin
          .from("interview_sessions")
          .select("id, account_id, candidate_id")
          .eq("id", sessionId)
          .maybeSingle();

        const accountId = sessionRow?.account_id || "shared";
        const { filePath: mergedPath } = await mergeChunksForSession(
          supabaseAdmin,
          accountId,
          sessionId,
        );

        const resolvedPath = mergedPath || `${accountId}/${sessionId}/chunks/chunk_00000.webm`;

        // Update candidate metadata so recruiter UI knows recording is available
        if (sessionRow?.candidate_id) {
          const { data: cand } = await supabaseAdmin
            .from("candidates")
            .select("id, metadata")
            .eq("id", sessionRow.candidate_id)
            .maybeSingle();

          const existingMeta = (cand?.metadata as Record<string, unknown>) || {};
          await supabaseAdmin
            .from("candidates")
            .update({
              metadata: {
                ...existingMeta,
                interview_recording_path: resolvedPath,
                interview_session_id: sessionId,
              },
            })
            .eq("id", sessionRow.candidate_id);
        }

        const { data: signedData } = await supabaseAdmin.storage
          .from(RECORDINGS_BUCKET)
          .createSignedUrl(resolvedPath, 86400);

        return NextResponse.json({
          success: true,
          filePath: resolvedPath,
          signedUrl: signedData?.signedUrl ?? null,
        });
      }

      // Legacy direct signed upload confirmation
      if (action === "confirm_upload" && sessionId && filePath) {
        const supabaseAdmin = getAdminSupabase();

        await supabaseAdmin
          .from("interview_sessions")
          .update({
            status: "completed",
          })
          .eq("id", sessionId);

        let signedUrl: string | null = null;
        try {
          const { data: signedData } = await supabaseAdmin.storage
            .from(RECORDINGS_BUCKET)
            .createSignedUrl(filePath, 86400);
          signedUrl = signedData?.signedUrl ?? null;
        } catch {
          const { data: fbData } = await supabaseAdmin.storage
            .from("recordings")
            .createSignedUrl(filePath, 86400);
          signedUrl = fbData?.signedUrl ?? null;
        }

        return NextResponse.json({
          success: true,
          filePath,
          signedUrl,
        });
      }
    }

    // 2. FormData multipart upload (Chunked streaming or Full recording fallback)
    const formData = await request.formData();
    const action = formData.get("action") as string | null;

    if (action === "upload_chunk") {
      const sessionId = formData.get("sessionId") as string | null;
      const chunkIndex = formData.get("chunkIndex") as string | null;
      const chunkFile = (formData.get("chunk") || formData.get("file")) as File | null;
      const accountIdParam = formData.get("accountId") as string | null;

      if (!sessionId || !chunkFile || chunkIndex == null) {
        return NextResponse.json(
          { error: "sessionId, chunkIndex, and chunk file are required." },
          { status: 400 },
        );
      }

      const supabaseAdmin = getAdminSupabase();
      const { data: sessionRow } = await supabaseAdmin
        .from("interview_sessions")
        .select("id, account_id")
        .eq("id", sessionId)
        .maybeSingle();

      const accountId = sessionRow?.account_id || accountIdParam || "shared";
      const padIndex = String(chunkIndex).padStart(5, "0");
      const chunkPath = `${accountId}/${sessionId}/chunks/chunk_${padIndex}.webm`;

      const bytes = await chunkFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const { error: chunkErr } = await supabaseAdmin.storage
        .from(RECORDINGS_BUCKET)
        .upload(chunkPath, buffer, {
          contentType: chunkFile.type || "video/webm",
          upsert: true,
        });

      if (chunkErr) {
        console.error(`[recording API] Failed to upload chunk ${chunkIndex}:`, chunkErr);
        return NextResponse.json({ error: chunkErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        chunkIndex: Number(chunkIndex),
        filePath: chunkPath,
        sizeBytes: buffer.length,
      });
    }

    const sessionId = formData.get("sessionId") as string | null;
    const accountIdParam = formData.get("accountId") as string | null;
    const file = formData.get("recording") as File | null;

    if (!sessionId || !file) {
      return NextResponse.json(
        { error: "sessionId and recording file are required." },
        { status: 400 },
      );
    }

    const supabaseAdmin = getAdminSupabase();

    // Resolve session to retrieve tenant account_id and round_instance_id
    const { data: sessionRow, error: sessionErr } = await supabaseAdmin
      .from("interview_sessions")
      .select("id,account_id,round_instance_id,candidate_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) {
      console.warn("[recording API] Session lookup error:", sessionErr);
    }

    const accountId = sessionRow?.account_id || accountIdParam || "shared";
    const filePath = `${accountId}/${sessionId}/recording_${Date.now()}.webm`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Try primary bucket (interview-recordings), fallback to legacy 'recordings'
    let uploadError = null;
    let usedBucket: string = RECORDINGS_BUCKET;
    const { error: primaryErr } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || "video/webm",
        upsert: true,
      });

    if (primaryErr) {
      console.warn(
        "[recording API] Upload to primary bucket failed, attempting fallback:",
        primaryErr,
      );
      const { error: fallbackErr } = await supabaseAdmin.storage
        .from("recordings")
        .upload(filePath, buffer, {
          contentType: file.type || "video/webm",
          upsert: true,
        });
      if (fallbackErr) {
        uploadError = primaryErr;
      } else {
        usedBucket = "recordings";
      }
    }

    if (uploadError) {
      console.error("[recording API] Upload error to bucket 'interview-recordings':", uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Update interview_sessions status to completed
    await supabaseAdmin
      .from("interview_sessions")
      .update({
        status: "completed",
      })
      .eq("id", sessionId);

    const { data: signedData } = await supabaseAdmin.storage
      .from(usedBucket)
      .createSignedUrl(filePath, 86400);

    return NextResponse.json({
      success: true,
      filePath,
      signedUrl: signedData?.signedUrl ?? null,
      sizeBytes: buffer.length,
    });
  } catch (err) {
    console.error("[recording API] Unexpected error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const sessionId = searchParams.get("sessionId");
    const pathParam = searchParams.get("path");

    const supabaseAdmin = getAdminSupabase();

    // A. Generate signed upload URL for direct client-to-storage streaming
    if (action === "get_upload_url" && sessionId) {
      const { data: sessionRow } = await supabaseAdmin
        .from("interview_sessions")
        .select("id,account_id")
        .eq("id", sessionId)
        .maybeSingle();

      const accountId = sessionRow?.account_id || "shared";
      const filePath = `${accountId}/${sessionId}/recording_${Date.now()}.webm`;

      // Try primary bucket first
      let signedUpload = null;
      let uploadErr = null;
      const { data: primaryData, error: primaryErr } = await supabaseAdmin.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUploadUrl(filePath);

      if (primaryErr || !primaryData) {
        console.warn(
          "[recording API] createSignedUploadUrl error on primary, trying legacy:",
          primaryErr,
        );
        const { data: fbData, error: fbErr } = await supabaseAdmin.storage
          .from("recordings")
          .createSignedUploadUrl(filePath);
        signedUpload = fbData;
        uploadErr = fbErr;
      } else {
        signedUpload = primaryData;
      }

      if (uploadErr || !signedUpload) {
        console.warn("[recording API] createSignedUploadUrl error:", uploadErr);
        return NextResponse.json(
          { error: uploadErr?.message || "Failed to create signed upload URL" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        filePath,
        signedUrl: signedUpload.signedUrl,
        token: signedUpload.token,
      });
    }

    // B. Resolve playback signed URL
    let targetPath = pathParam;
    let accountId = "shared";
    const chunkUrls: Array<{ name: string; path: string; url: string }> = [];

    if (!targetPath && sessionId) {
      const { data: sessionRow } = await supabaseAdmin
        .from("interview_sessions")
        .select("id, account_id, candidate_id")
        .eq("id", sessionId)
        .maybeSingle();

      accountId = sessionRow?.account_id ?? "shared";

      // 1. First scan for full recording.webm or direct files
      try {
        const { data: files } = await supabaseAdmin.storage
          .from(RECORDINGS_BUCKET)
          .list(`${accountId}/${sessionId}`, { limit: 10 });

        const recordingFile = files?.find(
          (f) => f.name.endsWith(".webm") && !f.name.startsWith("."),
        );

        if (recordingFile) {
          targetPath = `${accountId}/${sessionId}/${recordingFile.name}`;
        }
      } catch (listErr) {
        console.warn("[recording API GET] Direct file list warning:", listErr);
      }

      // 2. Scan for streamed 6-second chunk patches in chunks/ subfolder
      try {
        const chunksFolder = `${accountId}/${sessionId}/chunks`;
        const { data: chunkFiles } = await supabaseAdmin.storage
          .from(RECORDINGS_BUCKET)
          .list(chunksFolder, { limit: 500 });

        if (chunkFiles && chunkFiles.length > 0) {
          const sorted = [...chunkFiles]
            .filter((f) => f.name.endsWith(".webm") && !f.name.startsWith("."))
            .sort((a, b) => {
              const ai = parseInt(a.name.replace(/[^0-9]/g, ""), 10);
              const bi = parseInt(b.name.replace(/[^0-9]/g, ""), 10);
              return (Number.isNaN(ai) ? 0 : ai) - (Number.isNaN(bi) ? 0 : bi);
            });

          for (const cf of sorted) {
            const cp = `${chunksFolder}/${cf.name}`;
            const { data: signRes } = await supabaseAdmin.storage
              .from(RECORDINGS_BUCKET)
              .createSignedUrl(cp, 86400);

            if (signRes?.signedUrl) {
              chunkUrls.push({
                name: cf.name,
                path: cp,
                url: signRes.signedUrl,
              });
            }
          }

          if (!targetPath && chunkUrls.length > 0) {
            targetPath = chunkUrls[0].path;
          }
        }
      } catch (chunkScanErr) {
        console.warn("[recording API GET] Chunk scan warning:", chunkScanErr);
      }

      // 3. If targetPath still not resolved, check legacy bucket
      if (!targetPath) {
        try {
          const { data: legacyFiles } = await supabaseAdmin.storage
            .from("recordings")
            .list(`${accountId}/${sessionId}`, { limit: 5 });
          if (legacyFiles && legacyFiles.length > 0 && legacyFiles[0]?.name) {
            targetPath = `${accountId}/${sessionId}/${legacyFiles[0].name}`;
          }
        } catch {}
      }
    }

    if (!targetPath && chunkUrls.length === 0) {
      return NextResponse.json(
        { error: "Recording not found for the given session or path." },
        { status: 404 },
      );
    }

    let signedUrl: string | null = null;
    if (targetPath) {
      const { data: primarySign } = await supabaseAdmin.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUrl(targetPath, 86400);

      if (primarySign?.signedUrl) {
        signedUrl = primarySign.signedUrl;
      } else {
        const { data: fbSign } = await supabaseAdmin.storage
          .from("recordings")
          .createSignedUrl(targetPath, 86400);
        signedUrl = fbSign?.signedUrl ?? null;
      }
    }

    if (!signedUrl && chunkUrls.length > 0) {
      signedUrl = chunkUrls[0].url;
    }

    if (!signedUrl) {
      console.warn("[recording API] createSignedUrl error for path:", targetPath);
      return NextResponse.json(
        { error: "Failed to generate video stream signed playback URL." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      signedUrl,
      path: targetPath,
      chunks: chunkUrls,
      totalChunks: chunkUrls.length,
    });
  } catch (err) {
    console.error("[recording API GET] Unexpected error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
