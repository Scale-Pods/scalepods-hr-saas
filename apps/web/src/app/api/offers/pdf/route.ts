import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { generateBrandedOfferPdf } from "@/lib/generate-offer-pdf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const applicationId = searchParams.get("application_id") || searchParams.get("id");
    const candidateId = searchParams.get("candidate_id");
    const campaignId = searchParams.get("campaign_id");
    const email = searchParams.get("email") || searchParams.get("candidate_email");
    const download = searchParams.get("download") === "true";

    if (!applicationId && !candidateId && !email) {
      return new NextResponse("Provide application_id, candidate_id, or email", { status: 400 });
    }

    const env = getEnv();
    const serviceKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    });

    interface ApplicationOfferLookup {
      id?: string;
      campaign_id?: string;
      candidate_id?: string;
      candidate_name?: string;
      candidate_email?: string;
    }
    interface OfferDbRow {
      id?: string;
      application_id?: string;
      field_values?: Record<string, unknown>;
      pdf_url?: string;
      pdf_base64?: string;
    }
    interface CampaignOfferLookup {
      id?: string;
      name?: string;
      location?: string;
      cadence_config?: unknown;
      salary_min?: number;
      salary_max?: number;
      salary_currency?: string;
    }
    interface CandidateOfferLookup {
      id?: string;
      full_name?: string;
      name?: string;
      email?: string;
      phone?: string;
    }

    // 1. Fetch application details without composite foreign key joins
    let appRow: ApplicationOfferLookup | null = null;

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
    let offerRow: OfferDbRow | null = null;
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
    let campRow: CampaignOfferLookup | null = null;
    if (resolvedCampaignId) {
      const { data } = await adminSupabase
        .from("campaigns")
        .select("id, name, location, cadence_config, salary_min, salary_max, salary_currency")
        .eq("id", resolvedCampaignId)
        .maybeSingle();
      campRow = data;
    }

    // 4. Fetch candidate details directly
    let candRow: CandidateOfferLookup | null = null;
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

    const fieldValues = (offerRow?.field_values || {}) as Record<string, unknown>;

    const candidateName =
      (fieldValues.candidate_name as string) ||
      appRow?.candidate_name ||
      candRow?.full_name ||
      candRow?.name ||
      "Candidate";

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

    const dynamicVars = (fieldValues.dynamic_variables || fieldValues) as Record<string, string>;

    const pdfBuffer = generateBrandedOfferPdf({
      candidate_name: candidateName,
      position_title: positionTitle,
      salary,
      currency,
      start_date: startDate,
      company_name: companyName,
      signatory_name: signatoryName,
      signatory_title: signatoryTitle,
      dynamic_variables: dynamicVars,
    });

    const safeName = candidateName.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Offer_Letter_${safeName}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": download
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("[api/offers/pdf] PDF generation error:", err);
    return new NextResponse("Failed to generate offer PDF", { status: 500 });
  }
}
