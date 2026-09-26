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

    // 1. Resolve session to retrieve tenant account_id and round_instance_id
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

    // 2. Convert file to buffer and upload to 'recordings' bucket
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

    // 3. Update interview_sessions with the recording path and completion timestamp
    const nowIso = new Date().toISOString();
    const { error: updateSessionErr } = await supabaseAdmin
      .from("interview_sessions")
      .update({
        recording_url: filePath,
        status: "completed",
        completed_at: nowIso,
      })
      .eq("id", sessionId);

    if (updateSessionErr) {
      console.warn("[recording API] interview_sessions update note:", updateSessionErr);
    }

    // 4. Update scorecards if a round_instance exists for this session
    if (sessionRow?.round_instance_id) {
      const { error: updateScorecardErr } = await supabaseAdmin
        .from("scorecards")
        .update({ recording_path: filePath })
        .eq("round_instance_id", sessionRow.round_instance_id);

      if (updateScorecardErr) {
        console.warn("[recording API] scorecards update note:", updateScorecardErr);
      }
    }

    // 5. Generate signed URL for immediate playback/confirmation
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
    const sessionId = searchParams.get("sessionId");
    const pathParam = searchParams.get("path");

    const supabaseAdmin = getAdminSupabase();
    let targetPath = pathParam;

    if (!targetPath && sessionId) {
      const { data: sessionRow } = await supabaseAdmin
        .from("interview_sessions")
        .select("recording_url")
        .eq("id", sessionId)
        .maybeSingle();

      targetPath = sessionRow?.recording_url ?? null;
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
