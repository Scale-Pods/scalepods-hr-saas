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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // 1. Fetch Campaign and Rounds
    const [cRes, rRes, appsRes, risRes, statusesRes] = await Promise.all([
      admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle(),
      admin.from("campaign_rounds").select("*").eq("campaign_id", campaignId).order("round_number"),
      admin
        .from("applications")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      admin
        .from("round_instances")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      admin
        .from("round_instances")
        .select("round_number, status")
        .eq("campaign_id", campaignId)
        .in("status", ["passed", "failed", "no_show"]),
    ]);

    if (cRes.error) {
      return NextResponse.json({ error: cRes.error.message }, { status: 500 });
    }
    if (!cRes.data || (cRes.data.cadence_config as { is_deleted?: boolean } | null)?.is_deleted) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const campaign = cRes.data;
    const rounds = rRes.data ?? [];
    const applicationsList = appsRes.data ?? [];
    const roundInstances = risRes.data ?? [];
    const byRound: Record<number, string> = {};
    for (const s of (statusesRes.data ?? []) as { round_number: number; status: string }[]) {
      byRound[s.round_number] = s.status;
    }

    const roundInstanceIds = roundInstances.map((r) => r.id);
    const appIds = applicationsList.map((a) => a.id);

    // 2. Fetch Sessions, Answers, Scorecards, Decision Ledger strictly for this campaign
    const [sessionsRes, answersRes, dlRes] = await Promise.all([
      roundInstanceIds.length > 0
        ? admin.from("interview_sessions").select("*").in("round_instance_id", roundInstanceIds)
        : Promise.resolve({ data: [] }),
      roundInstanceIds.length > 0
        ? admin
            .from("interview_answers")
            .select("id, session_id, round_instance_id, answer_text")
            .in("round_instance_id", roundInstanceIds)
        : Promise.resolve({ data: [] }),
      appIds.length > 0 || roundInstanceIds.length > 0
        ? admin
            .from("decision_ledger")
            .select("*")
            .or(
              [
                appIds.length > 0 ? `application_id.in.(${appIds.join(",")})` : null,
                roundInstanceIds.length > 0
                  ? `round_instance_id.in.(${roundInstanceIds.join(",")})`
                  : null,
              ]
                .filter(Boolean)
                .join(","),
            )
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    interface SessionItem {
      id?: string;
      round_instance_id?: string;
      status?: string;
      started_at?: string;
    }

    const allSessions = (sessionsRes.data ?? []) as SessionItem[];
    const sessionIds = allSessions.map((s) => s.id);

    const scFilters = [
      roundInstanceIds.length > 0 ? `round_instance_id.in.(${roundInstanceIds.join(",")})` : null,
      sessionIds.length > 0 ? `session_id.in.(${sessionIds.join(",")})` : null,
    ].filter(Boolean);

    const scorecardsRes =
      scFilters.length > 0
        ? await admin.from("scorecards").select("*").or(scFilters.join(","))
        : { data: [] };

    interface AnswerItem {
      session_id?: string;
      round_instance_id?: string;
    }
    interface ScorecardItem {
      session_id?: string;
      round_instance_id?: string;
      overall_score?: number;
    }
    interface DecisionLedgerItem {
      application_id?: string;
      round_instance_id?: string;
      score_type?: string;
      stage?: string;
      score?: number;
      rationale?: string;
    }

    const allAnswers = (answersRes.data ?? []) as AnswerItem[];
    const allScorecards = (scorecardsRes.data ?? []) as ScorecardItem[];
    const dlList = (dlRes.data ?? []) as DecisionLedgerItem[];

    // 3. Map candidates
    const candidates = applicationsList.map((app) => {
      const appRi = roundInstances.find(
        (r) =>
          r.application_id === app.id ||
          (r.candidate_id === app.candidate_id &&
            r.round_number === (app.current_round_number ?? 1)),
      );

      const appResumeScoreRow = dlList.find(
        (d) =>
          d.application_id === app.id &&
          (d.score_type === "resume" ||
            d.stage === "resume_screening" ||
            d.stage?.includes("resume")) &&
          d.score != null,
      );

      const appRoundScoreRow = dlList.find(
        (d) =>
          ((appRi && d.round_instance_id === appRi.id) ||
            (d.application_id === app.id &&
              d.score_type !== "resume" &&
              !d.stage?.includes("resume"))) &&
          d.score != null,
      );

      const appSession = appRi ? allSessions.find((s) => s.round_instance_id === appRi.id) : null;

      const appCard = allScorecards.find(
        (sc) =>
          (appSession && sc.session_id === appSession.id) ||
          (appRi && sc.round_instance_id === appRi.id),
      );

      const appAnswers = allAnswers.filter(
        (a) =>
          (appSession && a.session_id === appSession.id) ||
          (appRi && a.round_instance_id === appRi.id),
      );

      let interviewStatus:
        | "not_started"
        | "in_progress"
        | "incomplete"
        | "completed"
        | "evaluated" = "not_started";
      if (appRoundScoreRow || appCard?.overall_score != null) {
        interviewStatus = "evaluated";
      } else if (appSession?.status === "completed" || appRi?.status === "completed") {
        interviewStatus = "completed";
      } else if (appSession?.status === "incomplete" || appRi?.status === "incomplete") {
        interviewStatus = "incomplete";
      } else if (appSession?.status === "in_progress" || appRi?.status === "in_progress") {
        const startMs = appSession?.started_at ? new Date(appSession.started_at).getTime() : 0;
        const isStale = startMs > 0 && Date.now() - startMs > 25 * 60 * 1000;
        interviewStatus = isStale ? "incomplete" : "in_progress";
      } else if (appRi) {
        interviewStatus = "not_started";
      }

      const isRoundStage = app.current_stage === "round" || Boolean(appRi);
      let stageLabel = "Resume Screening";
      if (isRoundStage) {
        stageLabel = `Round ${app.current_round_number ?? appRi?.round_number ?? 1}`;
      } else if (app.current_stage === "offer") {
        stageLabel = app.status === "offer_sent" ? "Offer Sent" : "Offer Ready";
      }

      const resumeScore = appResumeScoreRow?.score != null ? Number(appResumeScoreRow.score) : null;
      const aiScore =
        appRoundScoreRow?.score != null
          ? Number(appRoundScoreRow.score)
          : appCard?.overall_score != null
            ? Number(appCard.overall_score)
            : null;

      return {
        application_id: app.id,
        candidate_id: app.candidate_id,
        name: app.candidate_name,
        email: app.candidate_email,
        phone: app.candidate_phone,
        resume_url: app.resume_path,
        current_stage: stageLabel,
        current_round_number: isRoundStage
          ? (app.current_round_number ?? appRi?.round_number ?? 1)
          : null,
        status: app.status,
        status_before_hold: app.status_before_hold,
        rejection_reason: app.rejection_reason,
        latest_score: aiScore != null ? aiScore : resumeScore,
        resume_score: resumeScore,
        ai_interview_score: aiScore,
        interview_status: interviewStatus,
        interview_session_id: appSession?.id ?? null,
        answers_count: appAnswers.length,
        score_rationale: (appRoundScoreRow || appResumeScoreRow)?.rationale ?? null,
        decision: app.status === "rejected" ? "rejected" : (appRi?.status ?? app.status),
        round_instance_id: appRi?.id ?? null,
        round_number: isRoundStage ? (app.current_round_number ?? appRi?.round_number ?? 1) : null,
        reviewer_cutoff: appRi?.reviewer_cutoff ?? null,
        created_at: app.created_at,
      };
    });

    return NextResponse.json({
      campaign,
      rounds,
      candidates,
      roundStatuses: byRound,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
      .select("id, candidate_id")
      .eq("campaign_id", campaignId);

    if (risErr) {
      console.warn("Could not query round_instances for campaign:", risErr);
    }

    const riIds = (ris ?? []).map((r) => r.id);
    const campaignCandIds = Array.from(
      new Set(
        (ris ?? [])
          .map((r) => r.candidate_id)
          .filter((cid): cid is string => typeof cid === "string" && Boolean(cid)),
      ),
    );

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

    // 4. Clean up storage files in bucket "resumes" for this campaign
    try {
      if (admin.storage) {
        const { data: files } = await admin.storage
          .from("resumes")
          .list(`${campaign.account_id}/${campaignId}`, { limit: 1000 });

        if (files && files.length > 0) {
          const pathsToDelete: string[] = [];
          for (const item of files) {
            pathsToDelete.push(`${campaign.account_id}/${campaignId}/${item.name}`);
            const { data: subFiles } = await admin.storage
              .from("resumes")
              .list(`${campaign.account_id}/${campaignId}/${item.name}`);
            for (const sub of subFiles ?? []) {
              pathsToDelete.push(`${campaign.account_id}/${campaignId}/${item.name}/${sub.name}`);
            }
          }
          if (pathsToDelete.length > 0) {
            await admin.storage.from("resumes").remove(pathsToDelete);
          }
        }
      }
    } catch (storageErr) {
      console.warn("Failed to clean up campaign storage:", storageErr);
    }

    // 5. Delete the campaign (cascades to campaign_rounds, round_instances, etc.)
    const { error: delErr } = await admin.from("campaigns").delete().eq("id", campaignId);

    if (delErr) {
      console.warn(
        "[api/campaigns/[id]] Hard delete blocked by database trigger, falling back to soft-delete archive:",
        delErr,
      );
      const { data: currentCamp } = await admin
        .from("campaigns")
        .select("cadence_config")
        .eq("id", campaignId)
        .maybeSingle();

      const currentCadence = (currentCamp?.cadence_config || {}) as Record<string, unknown>;
      const { error: softErr } = await admin
        .from("campaigns")
        .update({
          status: "closed",
          cadence_config: {
            ...currentCadence,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
          },
        })
        .eq("id", campaignId);

      if (softErr) {
        return NextResponse.json({ error: softErr.message }, { status: 500 });
      }
    }

    // 6. Clean up orphaned candidates who have no remaining campaigns
    try {
      const { data: remainingCamps } = await admin
        .from("campaigns")
        .select("id")
        .eq("account_id", campaign.account_id);

      if (!remainingCamps || remainingCamps.length === 0) {
        // If all campaigns were deleted, clean up all candidates belonging to this account.
        // Postgres cascade deletes decision_ledger, outreach_log, interview_sessions, etc.
        await admin.from("candidates").delete().eq("account_id", campaign.account_id);
      } else if (campaignCandIds.length > 0) {
        // Find remaining round instances for this account
        const { data: activeRis } = await admin
          .from("round_instances")
          .select("candidate_id")
          .eq("account_id", campaign.account_id);

        const activeCandIds = new Set((activeRis ?? []).map((r) => r.candidate_id));
        const orphanCandIds = campaignCandIds.filter((cid) => !activeCandIds.has(cid));

        if (orphanCandIds.length > 0) {
          await admin.from("candidates").delete().in("id", orphanCandIds);
        }
      }
    } catch (cleanErr) {
      console.warn("Failed to clean up orphaned candidates:", cleanErr);
    }

    // 7. Notify n8n asynchronously
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
