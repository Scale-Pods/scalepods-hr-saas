import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

// Service role client to bypass storage RLS for recording uploads
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://inkfjgmnxkfitnegpiej.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // 1. JSON-based upload confirmation (used after direct signed URL PUT)
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const { action, sessionId, filePath } = body;

      if (action === "confirm_upload" && sessionId && filePath) {
        const supabaseAdmin = getAdminSupabase();

        const { data: sessionRow } = await supabaseAdmin
          .from("interview_sessions")
          .update({
            recording_url: filePath,
          })
          .eq("id", sessionId)
          .select("id, account_id, round_instance_id")
          .maybeSingle();

        if (sessionRow?.round_instance_id) {
          void supabaseAdmin
            .from("scorecards")
            .update({ recording_path: filePath })
            .eq("round_instance_id", sessionRow.round_instance_id);
        }

        const { data: signedData } = await supabaseAdmin.storage
          .from("recordings")
          .createSignedUrl(filePath, 86400);

        return NextResponse.json({
          success: true,
          filePath,
          signedUrl: signedData?.signedUrl ?? null,
        });
      }
    }

    // 2. Fallback FormData multipart upload
    const formData = await request.formData();
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

    const { error: uploadError } = await supabaseAdmin.storage
      .from("recordings")
      .upload(filePath, buffer, {
        contentType: file.type || "video/webm",
        upsert: true,
      });

    if (uploadError) {
      console.error("[recording API] Upload error to bucket 'recordings':", uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Update interview_sessions with recording path and completion
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("interview_sessions")
      .update({
        recording_url: filePath,
        status: "completed",
        completed_at: nowIso,
      })
      .eq("id", sessionId);

    if (sessionRow?.round_instance_id) {
      await supabaseAdmin
        .from("scorecards")
        .update({ recording_path: filePath })
        .eq("round_instance_id", sessionRow.round_instance_id);
    }

    const { data: signedData } = await supabaseAdmin.storage
      .from("recordings")
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

      const { data: signedUpload, error: uploadErr } = await supabaseAdmin.storage
        .from("recordings")
        .createSignedUploadUrl(filePath);

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

    if (!targetPath && sessionId) {
      const { data: sessionRow } = await supabaseAdmin
        .from("interview_sessions")
        .select("recording_url, account_id")
        .eq("id", sessionId)
        .maybeSingle();

      targetPath = sessionRow?.recording_url ?? null;
      accountId = sessionRow?.account_id ?? "shared";

      // If recording_url is null in DB, scan storage folder for existing files
      if (!targetPath) {
        try {
          const { data: files } = await supabaseAdmin.storage
            .from("recordings")
            .list(`${accountId}/${sessionId}`, { limit: 5 });

          if (files && files.length > 0 && files[0]?.name) {
            targetPath = `${accountId}/${sessionId}/${files[0].name}`;
            void supabaseAdmin
              .from("interview_sessions")
              .update({ recording_url: targetPath })
              .eq("id", sessionId);
          }
        } catch {}
      }
    }

    if (!targetPath) {
      return NextResponse.json(
        { error: "Recording not found for the given session or path." },
        { status: 404 },
      );
    }

    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from("recordings")
      .createSignedUrl(targetPath, 86400);

    if (signedErr || !signedData?.signedUrl) {
      return NextResponse.json(
        { error: signedErr?.message || "Could not generate playback URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      filePath: targetPath,
      signedUrl: signedData.signedUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
