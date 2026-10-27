import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const applicationId = searchParams.get("application_id") || searchParams.get("id");
    const candidateId = searchParams.get("candidate_id");
    const campaignId = searchParams.get("campaign_id");
    const email = searchParams.get("email") || searchParams.get("candidate_email");

    if (!applicationId && !candidateId && !email) {
      return NextResponse.json(
        { error: "Provide application_id, candidate_id, or email" },
        { status: 400 },
      );
    }

    const env = getEnv();
    const serviceKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    });

    interface ApplicationOfferViewLookup {
      id?: string;
      campaign_id?: string;
      candidate_id?: string;
      candidate_name?: string;
      candidate_email?: string;
      created_at?: string;
      status?: string;
      [key: string]: unknown;
    }
    interface OfferDbViewRow {
      id?: string;
      application_id?: string;
      candidate_email?: string;
      sent_to_candidate_at?: string;
      field_values?: Record<string, unknown>;
      pdf_url?: string;
      pdf_base64?: string;
      created_at?: string;
      status?: string;
      signwell_document_id?: string;
      signwell_signing_url?: string;
      [key: string]: unknown;
    }
    interface CampaignOfferViewLookup {
      id?: string;
      name?: string;
      location?: string;
      cadence_config?: unknown;
      salary_min?: number;
      salary_max?: number;
      salary_currency?: string;
    }
    interface CandidateOfferViewLookup {
      id?: string;
      full_name?: string;
      name?: string;
      email?: string;
      phone?: string;
    }

    // 1. Try finding application without foreign key embedding (prevents PostgREST composite FK errors)
    let appRow: ApplicationOfferViewLookup | null = null;

    if (applicationId && applicationId !== "undefined") {
      const { data } = await adminSupabase
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .maybeSingle();
      appRow = data;
    }

    if (
      !appRow &&
      candidateId &&
      candidateId !== "undefined" &&
      campaignId &&
      campaignId !== "undefined"
    ) {
      const { data } = await adminSupabase
        .from("applications")
        .select("*")
        .eq("candidate_id", candidateId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      appRow = data;
    }

    if (!appRow && candidateId && candidateId !== "undefined") {
      const { data } = await adminSupabase
        .from("applications")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(1);
      appRow = data?.[0] || null;
    }

    if (!appRow && email) {
      const { data } = await adminSupabase
        .from("applications")
        .select("*")
        .ilike("candidate_email", email.trim())
        .order("created_at", { ascending: false })
        .limit(1);
      appRow = data?.[0] || null;
    }

    const resolvedAppId = appRow?.id || applicationId;
    const resolvedCandidateId = appRow?.candidate_id || candidateId;
    const resolvedCampaignId = appRow?.campaign_id || campaignId;

    // 2. Fetch from offers table
    let offerRow: OfferDbViewRow | null = null;
    if (resolvedAppId) {
      const { data } = await adminSupabase
        .from("offers")
        .select("*")
        .eq("application_id", resolvedAppId)
        .maybeSingle();
      offerRow = data;
    }

    if (!offerRow && applicationId) {
      const { data } = await adminSupabase
        .from("offers")
        .select("*")
        .eq("id", applicationId)
        .maybeSingle();
      offerRow = data;
    }

    // 3. Fetch campaign details directly
    let campRow: CampaignOfferViewLookup | null = null;
    if (resolvedCampaignId) {
      const { data } = await adminSupabase
        .from("campaigns")
        .select("id, name, location, cadence_config, salary_min, salary_max, salary_currency")
        .eq("id", resolvedCampaignId)
        .maybeSingle();
      campRow = data;
    }

    // 4. Fetch candidate details directly
    let candRow: CandidateOfferViewLookup | null = null;
    if (resolvedCandidateId && resolvedCandidateId !== "undefined") {
      const { data } = await adminSupabase
        .from("candidates")
        .select("id, full_name, name, email, phone")
        .eq("id", resolvedCandidateId)
        .maybeSingle();
      candRow = data;
    }

    if (!candRow && email) {
      const { data } = await adminSupabase
        .from("candidates")
        .select("id, full_name, name, email, phone")
        .ilike("email", email.trim())
        .limit(1);
      candRow = data?.[0] || null;
    }

    // 5. Fallback to decision_ledger
    let decisionRow: { decided_at?: string; rationale?: string } | null = null;
    if (!offerRow && resolvedAppId) {
      const { data: dlRows } = await adminSupabase
        .from("decision_ledger")
        .select("decided_at, rationale, stage, decision")
        .eq("application_id", resolvedAppId)
        .or("stage.eq.offer,decision.eq.offer_sent")
        .order("decided_at", { ascending: false })
        .limit(1);
      decisionRow = dlRows?.[0] || null;
    }

    if (!appRow && !offerRow && !candRow) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const fieldValues = (offerRow?.field_values || {}) as Record<string, unknown>;

    const candidateName =
      (fieldValues.candidate_name as string) ||
      appRow?.candidate_name ||
      candRow?.full_name ||
      candRow?.name ||
      "Candidate";

    const candidateEmail =
      offerRow?.candidate_email ||
      (fieldValues.candidate_email as string) ||
      appRow?.candidate_email ||
      candRow?.email ||
      "";

    const positionTitle =
      (fieldValues.position_title as string) || campRow?.name || "Open Position";

    const salary = String(
      fieldValues.salary ||
        campRow?.salary_min ||
        (campRow?.name && String(campRow.name).toLowerCase().includes("intern")
          ? "10000"
          : "1200000"),
    );

    const currency = (fieldValues.currency as string) || campRow?.salary_currency || "INR";

    const startDate =
      (fieldValues.start_date as string) ||
      new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

    const companyName = (fieldValues.company_name as string) || "ScalePods Technologies";

    const signatoryName = (fieldValues.signatory_name as string) || "Manish";

    const signatoryTitle = (fieldValues.signatory_title as string) || "Head of Talent Acquisition";

    const specialTerms = (fieldValues.special_terms as string) || "";

    const dynamicVars = (fieldValues.dynamic_variables || fieldValues) as Record<string, string>;

    const sentAt =
      offerRow?.sent_to_candidate_at ||
      decisionRow?.decided_at ||
      appRow?.created_at ||
      new Date().toISOString();

    return NextResponse.json({
      success: true,
      offer: {
        id: offerRow?.id || resolvedAppId,
        application_id: resolvedAppId,
        candidate_id: resolvedCandidateId,
        campaign_id: resolvedCampaignId,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        position_title: positionTitle,
        salary,
        currency,
        start_date: startDate,
        company_name: companyName,
        signatory_name: signatoryName,
        signatory_title: signatoryTitle,
        special_terms: specialTerms,
        dynamic_variables: dynamicVars,
        status: offerRow?.status || appRow?.status || "offer_sent",
        sent_at: sentAt,
      },
    });
  } catch (err) {
    console.error("[api/offers/view] Error retrieving offer:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load offer letter" },
      { status: 500 },
    );
  }
}
