import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

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

function getAnonClient() {
  const env = getEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

async function handleRemove(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const anonClient = getAnonClient();
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let campaignId: string | null = null;
    let candidateId: string | null = null;
    let applicationId: string | null = null;

    if (req.method === "GET" || req.method === "DELETE") {
      const url = new URL(req.url);
      campaignId = url.searchParams.get("campaignId") || url.searchParams.get("campaign_id");
      candidateId = url.searchParams.get("candidateId") || url.searchParams.get("candidate_id");
      applicationId =
        url.searchParams.get("applicationId") || url.searchParams.get("application_id");
    }

    if (!campaignId || !candidateId) {
      const body = await req.json().catch(() => ({}));
      campaignId = campaignId || body.campaignId || body.campaign_id;
      candidateId = candidateId || body.candidateId || body.candidate_id;
      applicationId = applicationId || body.applicationId || body.application_id;
    }

    if (!campaignId && !candidateId && !applicationId) {
      return NextResponse.json(
        { error: "campaignId and candidateId (or applicationId) are required." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    // 1. Resolve application if applicationId was not explicitly provided
    let targetAppId = applicationId;
    let targetCandId = candidateId;
    let targetCampId = campaignId;

    if (targetAppId) {
      const { data: appRow } = await admin
        .from("applications")
        .select("id, account_id, campaign_id, candidate_id")
        .eq("id", targetAppId)
        .eq("account_id", user.id)
        .maybeSingle();

      if (appRow) {
        targetCandId = appRow.candidate_id;
        targetCampId = appRow.campaign_id;
      }
    } else if (targetCampId && targetCandId) {
      const { data: appRow } = await admin
        .from("applications")
        .select("id, account_id, campaign_id, candidate_id")
        .eq("campaign_id", targetCampId)
        .eq("candidate_id", targetCandId)
        .eq("account_id", user.id)
        .maybeSingle();

      if (appRow) {
        targetAppId = appRow.id;
      }
    }

    // 2. Delete application if found (cascades related round instances, sessions, scorecards, offers, etc.)
    if (targetAppId) {
      const { error: appDelErr } = await admin
        .from("applications")
        .delete()
        .eq("id", targetAppId)
        .eq("account_id", user.id);

      if (appDelErr) {
        console.warn("[api/applications/remove] Error deleting application:", appDelErr);
      }
    }

    // 3. Delete any unlinked round_instances for this campaign and candidate
    if (targetCampId && targetCandId) {
      await admin
        .from("round_instances")
        .delete()
        .eq("campaign_id", targetCampId)
        .eq("candidate_id", targetCandId)
        .eq("account_id", user.id);

      // Clean decision ledger entries for this candidate and campaign
      if (targetAppId) {
        await admin
          .from("decision_ledger")
          .delete()
          .eq("application_id", targetAppId)
          .eq("account_id", user.id);
      }
    }

    // 4. If candidate has no other applications or rounds across any campaigns, clean up candidate row
    if (targetCandId) {
      const [{ data: otherApps }, { data: otherRis }] = await Promise.all([
        admin
          .from("applications")
          .select("id")
          .eq("candidate_id", targetCandId)
          .eq("account_id", user.id),
        admin
          .from("round_instances")
          .select("id")
          .eq("candidate_id", targetCandId)
          .eq("account_id", user.id),
      ]);

      if ((!otherApps || otherApps.length === 0) && (!otherRis || otherRis.length === 0)) {
        await admin.from("candidates").delete().eq("id", targetCandId).eq("account_id", user.id);
      }
    }

    return NextResponse.json({
      success: true,
      removed: true,
      campaign_id: targetCampId,
      candidate_id: targetCandId,
      application_id: targetAppId,
    });
  } catch (err) {
    console.error("[api/applications/remove] unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return handleRemove(req);
}

export async function DELETE(req: NextRequest) {
  return handleRemove(req);
}
