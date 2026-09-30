import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callWorkflow } from "@/lib/webhooks";

function getAdminClient() {
  const env = getEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

function getAuthClient(authHeader?: string | null) {
  const env = getEnv();
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization");
    const authClient = getAuthClient(authHeader);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    const admin = getAdminClient();

    // 1. Verify campaign exists and check ownership if user is authenticated
    const { data: campaign, error: fetchErr } = await admin
      .from("campaigns")
      .select("id, account_id, name")
      .eq("id", campaignId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (user && campaign.account_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized to delete this campaign" }, { status: 403 });
    }

    // 2. Find all round_instances associated with this campaign
    const { data: ris, error: risErr } = await admin
      .from("round_instances")
      .select("id")
      .eq("campaign_id", campaignId);

    if (risErr) {
      console.warn("Could not query round_instances for campaign:", risErr);
    }

    const riIds = (ris ?? []).map((r) => r.id);

    if (riIds.length > 0) {
      // 3a. Disconnect foreign keys in credit_ledger so round_instances can be deleted
      const { error: clErr } = await admin
        .from("credit_ledger")
        .update({ round_instance_id: null })
        .in("round_instance_id", riIds);

      if (clErr) {
        console.warn("Failed to unbind credit_ledger rows:", clErr);
      }

      // 3b. Delete outreach_log rows pointing to these round_instances
      // (avoiding unique dedup_key collision on nullify)
      const { error: olErr } = await admin
        .from("outreach_log")
        .delete()
        .in("round_instance_id", riIds);

      if (olErr) {
        console.warn("Failed to clean up outreach_log rows:", olErr);
      }

      // 3c. Unbind self-referential retakes in round_instances
      const { error: retakeErr } = await admin
        .from("round_instances")
        .update({ retake_of_round_instance_id: null })
        .in("retake_of_round_instance_id", riIds);

      if (retakeErr) {
        console.warn("Failed to unbind round_instances retakes:", retakeErr);
      }
    }

    // 4. Delete the campaign (cascades to campaign_rounds, round_instances, etc.)
    const { error: delErr } = await admin.from("campaigns").delete().eq("id", campaignId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // 5. Notify n8n asynchronously
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    callWorkflow("campaigns", {
      body: {
        action: "delete",
        account_id: campaign.account_id,
        campaign_id: campaignId,
      },
      accessToken: token,
    }).catch((wfErr) => {
      console.warn("n8n delete notification skipped or failed:", wfErr);
    });

    return NextResponse.json({ success: true, id: campaignId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
