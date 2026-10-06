import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const riId =
      searchParams.get("riId") || searchParams.get("round_instance_id") || searchParams.get("id");

    if (!riId) {
      return NextResponse.json({ error: "round_instance_id is required" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    // 1. Fetch Round Instance
    const { data: roundInstance, error: riErr } = await supabase
      .from("round_instances")
      .select("*")
      .eq("id", riId)
      .maybeSingle();

    if (riErr || !roundInstance) {
      return NextResponse.json(
        { error: riErr?.message || "Round not found or link has expired." },
        { status: 404 },
      );
    }

    // 2. Fetch Candidate
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id, name, email, phone")
      .eq("id", roundInstance.candidate_id)
      .maybeSingle();

    // 3. Fetch Campaign
    let campaign = { id: roundInstance.campaign_id, name: "Interview", number_of_rounds: 1 };
    if (roundInstance.campaign_id) {
      const { data: campRow } = await supabase
        .from("campaigns")
        .select("id, name, number_of_rounds")
        .eq("id", roundInstance.campaign_id)
        .maybeSingle();
      if (campRow) campaign = campRow;
    }

    // 4. Fetch Campaign Round
    type CampaignRoundType = {
      round_number: number;
      round_type: "ai_interview" | "human_interview" | "assignment";
      cutoff_score: number | null;
      interviewer_email?: string | null;
    };
    let campaignRound: CampaignRoundType | null = null;

    if (roundInstance.campaign_id && roundInstance.round_number) {
      const { data: crRow } = await supabase
        .from("campaign_rounds")
        .select("round_number, round_type, cutoff_score, interviewer_email")
        .eq("campaign_id", roundInstance.campaign_id)
        .eq("round_number", roundInstance.round_number)
        .maybeSingle();
      if (crRow) {
        campaignRound = crRow as unknown as CampaignRoundType;
      }
    }

    // 5. Fetch Account
    let accountTier: "free" | "basic" | "growth" | "enterprise" = "enterprise";
    if (roundInstance.account_id) {
      const { data: accRow } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", roundInstance.account_id)
        .maybeSingle();
      if (accRow?.tier) accountTier = accRow.tier as typeof accountTier;
    }

    const contextPayload = {
      round_instance: {
        id: roundInstance.id,
        round_type: roundInstance.round_type,
        status: roundInstance.status,
        scheduled_at: roundInstance.scheduled_at,
        meet_link: roundInstance.conferencing_link,
        event_id: null,
        deadline_at: roundInstance.deadline_at,
        retake_of_round_instance_id: roundInstance.retake_of_round_instance_id,
        fault_reason: roundInstance.fault_reason,
      },
      candidate: {
        id: candidate?.id || roundInstance.candidate_id,
        name: candidate?.name || "Candidate",
        email: candidate?.email || "",
        phone: candidate?.phone || null,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        number_of_rounds: campaign.number_of_rounds,
      },
      round: {
        round_number: campaignRound?.round_number || roundInstance.round_number || 1,
        round_type: campaignRound?.round_type || roundInstance.round_type || "human_interview",
        interviewer_email: campaignRound?.interviewer_email || null,
        cutoff_score: campaignRound?.cutoff_score || null,
        daily_start_time: "09:00",
        daily_end_time: "18:00",
      },
      account: {
        tier: accountTier,
        voice_screening_included: true,
      },
      booked_event: null,
    };

    return NextResponse.json(contextPayload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
