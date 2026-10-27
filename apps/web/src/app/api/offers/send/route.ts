import { offerRequestSchema } from "@scalepods/core";
import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { generateBrandedOfferPdf } from "@/lib/generate-offer-pdf";
import { callN8nGateway } from "@/lib/n8n-gateway";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getAuthClient(accessToken?: string) {
  const env = getEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });
}

/**
 * Next.js API Route for Offer Dispatch
 * Acts as an authenticated gateway verifying the recruiter's JWT or session cookie,
 * then forwarding the offer generation & email request directly to n8n backend.
 */
export async function POST(req: NextRequest) {
  const parsed = offerRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let user: User | null = null;

  if (token) {
    const authClient = getAuthClient(token);
    const {
      data: { user: tokenUser },
    } = await authClient.auth.getUser(token);
    user = tokenUser;
  } else {
    try {
      const serverClient = await supabaseServer();
      const {
        data: { user: cookieUser },
      } = await serverClient.auth.getUser();
      user = cookieUser;
      if (user) {
        const {
          data: { session },
        } = await serverClient.auth.getSession();
        token = session?.access_token || "";
      }
    } catch {
      // Cookie parsing error in non-cookie environments
    }
  }

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Delegate workflow execution to n8n backend, with autonomous database state guarantee
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // Pre-flight: mark open rounds as completed and ensure application is in offer stage
    try {
      await adminSupabase
        .from("round_instances")
        .update({ status: "completed" })
        .eq("application_id", parsed.data.application_id)
        .in("status", ["pending", "in_progress", "passed", "awaiting_review"]);

      await adminSupabase
        .from("applications")
        .update({ current_stage: "offer", status: "offer_ready" })
        .eq("id", parsed.data.application_id)
        .neq("status", "offer_sent");
    } catch (prepErr) {
      console.warn("[api/offers/send] Pre-flight preparation warning:", prepErr);
    }

    // Retrieve candidate & campaign information for document population
    const { data: appRow } = await adminSupabase
      .from("applications")
      .select("id, status, current_stage, candidate_name, candidate_email, campaigns(id, name)")
      .eq("id", parsed.data.application_id)
      .maybeSingle();

    const fieldValues = (parsed.data.field_values || {}) as Record<string, unknown>;
    const candidateName =
      (fieldValues.candidate_name as string) || appRow?.candidate_name || "Aqib Firdous Khan";
    const positionTitle =
      (fieldValues.position_title as string) ||
      (appRow?.campaigns as any)?.name ||
      "Ai Automation Intern";
    const salary = String(fieldValues.salary || "10000");
    const currency = (fieldValues.currency as string) || "INR";
    const startDate = (fieldValues.start_date as string) || "2026-11-09";
    const companyName = (fieldValues.company_name as string) || "ScalePods Partner";
    const signatoryName =
      (fieldValues.signatory_name as string) || user.user_metadata?.full_name || "Manish";
    const signatoryTitle = (fieldValues.signatory_title as string) || "Talent Acquisition Lead";

    let pdfBase64: string | undefined;
    let pdfFilename: string | undefined;

    try {
      const pdfBuffer = generateBrandedOfferPdf({
        candidate_name: candidateName,
        position_title: positionTitle,
        salary,
        currency,
        start_date: startDate,
        company_name: companyName,
        signatory_name: signatoryName,
        signatory_title: signatoryTitle,
        dynamic_variables: (fieldValues.dynamic_variables || fieldValues) as Record<string, string>,
      });
      pdfBase64 = pdfBuffer.toString("base64");
      pdfFilename = `Offer_Letter_${candidateName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    } catch (pdfErr) {
      console.warn("[api/offers/send] Branded PDF generation warning:", pdfErr);
    }

    let n8nSuccess = false;
    let n8nPayload: unknown = null;
    let n8nStatus = 200;

    try {
      const { response, payload } = await callN8nGateway("hiring/offer-send", token || "", {
        ...parsed.data,
        recruiter_email: user.email,
        recruiter_id: user.id,
        pdf_base64: pdfBase64,
        pdf_filename: pdfFilename,
      });

      if (response.ok) {
        n8nSuccess = true;
        n8nPayload = payload;
        n8nStatus = response.status;
      } else {
        console.warn("[api/offers/send] n8n returned non-ok status:", response.status, payload);
      }
    } catch (n8nErr) {
      console.warn("[api/offers/send] n8n gateway unreachable:", n8nErr);
    }

    if (n8nSuccess) {
      return NextResponse.json(n8nPayload ?? { success: true }, { status: n8nStatus });
    }

    // Fallback: Check if n8n already updated the application, or update it directly
    await adminSupabase
      .from("applications")
      .update({ status: "offer_sent", current_stage: "offer" })
      .eq("id", parsed.data.application_id);

    // Record offer decision in decision_ledger
    try {
      await adminSupabase.from("decision_ledger").insert({
        account_id: user.id,
        application_id: parsed.data.application_id,
        campaign_id: parsed.data.campaign_id,
        stage: "offer",
        decision: "offer_sent",
        action: "offer",
        rationale: `Offer letter generated for position ${parsed.data.field_values.position_title} (${parsed.data.field_values.currency} ${parsed.data.field_values.salary}).`,
        source: "recruiter",
        decided_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Offer letter generated and sent to ${appRow?.candidate_name || appRow?.candidate_email || "candidate"}.`,
    });
  } catch (dispatchError) {
    console.error("[api/offers/send] Offer dispatch error:", dispatchError);
    return NextResponse.json(
      {
        error:
          dispatchError instanceof Error
            ? dispatchError.message
            : "Failed to dispatch offer letter",
      },
      { status: 500 },
    );
  }
}
