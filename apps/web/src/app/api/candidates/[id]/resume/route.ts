import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { BUCKETS } from "@/lib/storage";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function authenticateUser(req: NextRequest): Promise<User | null> {
  const env = getEnv();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const authClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      },
    );
    const {
      data: { user },
    } = await authClient.auth.getUser(bearer);
    return user;
  }

  try {
    const serverClient = await supabaseServer();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

function getAdminClient() {
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * GET /api/candidates/[id]/resume?campaignId=<campaign_id>
 * Generates an authenticated signed URL or streams the candidate's uploaded resume from Supabase Storage.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: candidateId } = await params;
    if (!candidateId) {
      return NextResponse.json({ error: "Candidate ID is required" }, { status: 400 });
    }

    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId");

    const admin = getAdminClient();

    // 1. Fetch candidate to verify tenant ownership
    const { data: cand, error: candErr } = await admin
      .from("candidates")
      .select("id, account_id, name, email, resume_url")
      .eq("id", candidateId)
      .maybeSingle();

    if (candErr) {
      console.error("[api/candidates/[id]/resume] Candidate fetch error:", candErr);
    }

    if (!cand) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (cand.account_id && cand.account_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Fetch associated application to resolve resume_path
    let resumePath: string | null = null;

    if (campaignId) {
      const { data: app } = await admin
        .from("applications")
        .select("id, resume_path")
        .eq("candidate_id", candidateId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (app?.resume_path) {
        resumePath = app.resume_path;
      }
    }

    if (!resumePath) {
      const { data: apps } = await admin
        .from("applications")
        .select("id, resume_path")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (apps && apps.length > 0 && apps[0]?.resume_path) {
        resumePath = apps[0].resume_path;
      }
    }

    if (!resumePath && cand.resume_url) {
      resumePath = cand.resume_url;
    }

    // 3. Fallback: Search storage folder for candidate's resume
    if (!resumePath && cand.account_id) {
      const folder = campaignId ? `${cand.account_id}/${campaignId}` : cand.account_id;
      const { data: files } = await admin.storage.from(BUCKETS.resumes).list(folder, { limit: 50 });

      if (files && files.length > 0) {
        const safeEmail = (cand.email || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const safeName = (cand.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const matched =
          files.find((f) => {
            const lower = f.name.toLowerCase();
            return (
              (safeEmail && lower.includes(safeEmail)) || (safeName && lower.includes(safeName))
            );
          }) || files[0];

        if (matched?.name) {
          resumePath = `${folder}/${matched.name}`;
        }
      }
    }

    if (!resumePath) {
      return NextResponse.json(
        { error: "No resume file found on record for this candidate." },
        { status: 404 },
      );
    }

    // 4. If it's already an absolute HTTP/HTTPS URL, redirect directly
    if (resumePath.startsWith("http://") || resumePath.startsWith("https://")) {
      return NextResponse.redirect(resumePath, 307);
    }

    // 5. Clean storage path
    const cleanPath = resumePath.replace(/^\/+/, "").replace(/^resumes\//, "");

    // 6. Generate signed URL with admin privileges (1 hour validity)
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKETS.resumes)
      .createSignedUrl(cleanPath, 3600);

    if (signed?.signedUrl && !signErr) {
      return NextResponse.redirect(signed.signedUrl, 307);
    }

    // 7. If signed URL generation failed, attempt direct download and stream
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from(BUCKETS.resumes)
      .download(cleanPath);

    if (dlErr || !fileBlob) {
      console.error("[api/candidates/[id]/resume] Storage download error:", dlErr || signErr);
      return NextResponse.json(
        { error: "Resume file could not be retrieved from storage." },
        { status: 404 },
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const lowerName = cleanPath.toLowerCase();
    const contentType = lowerName.endsWith(".pdf")
      ? "application/pdf"
      : lowerName.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : lowerName.endsWith(".txt")
          ? "text/plain; charset=utf-8"
          : "application/octet-stream";

    const fileName = cleanPath.split("/").pop() || "resume.pdf";

    return new NextResponse(new Uint8Array(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[api/candidates/[id]/resume] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error retrieving resume" }, { status: 500 });
  }
}
