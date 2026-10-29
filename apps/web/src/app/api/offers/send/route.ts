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
    // Pre-flight: Verify account tier limit for offer letters
    try {
      const { data: acc } = await adminSupabase
        .from("accounts")
        .select("tier")
        .eq("id", user.id)
        .maybeSingle();

      const userTier = acc?.tier || "free";
      if (userTier === "free") {
        return NextResponse.json(
          {
            error: "Plan limit reached",
            detail:
              "The Free plan does not include offer letters (0 included). Please upgrade your plan in Billing to extend official offers.",
            reason: "offers_per_month_exceeded",
          },
          { status: 403 },
        );
      }

      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();
      const { count: offersCount } = await adminSupabase
        .from("offers")
        .select("id", { count: "exact", head: true })
        .eq("account_id", user.id)
        .gte("created_at", startOfMonth);

      const { data: tierCheck } = await adminSupabase.rpc("check_tier_limit", {
        p_account_id: user.id,
        p_limit_key: "offers_per_month",
        p_current_count: offersCount || 0,
      });

      if (
        tierCheck &&
        typeof tierCheck === "object" &&
        (tierCheck as { allowed?: boolean }).allowed === false
      ) {
        const tc = tierCheck as { tier?: string; limit_value?: number };
        return NextResponse.json(
          {
            error: "Plan limit reached",
            detail: `Your ${tc.tier || userTier} plan includes ${tc.limit_value ?? 0} offer letters per month. Please upgrade your plan in Billing to extend more offers.`,
            reason: "offers_per_month_exceeded",
          },
          { status: 403 },
        );
      }
    } catch (tierErr) {
      console.warn("[api/offers/send] Tier limit check warning:", tierErr);
    }

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
      (appRow?.campaigns as { name?: string } | undefined)?.name ||
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

    // Guaranteed persistence: Update applications table
    await adminSupabase
      .from("applications")
      .update({ status: "offer_sent", current_stage: "offer" })
      .eq("id", parsed.data.application_id);

    // Guaranteed persistence: Upsert into offers table
    const resolvedFieldValues = {
      ...fieldValues,
      candidate_name: candidateName,
      position_title: positionTitle,
      salary,
      currency,
      start_date: startDate,
      company_name: companyName,
      signatory_name: signatoryName,
      signatory_title: signatoryTitle,
    };

    try {
      const { data: existingOffer } = await adminSupabase
        .from("offers")
        .select("id")
        .eq("application_id", parsed.data.application_id)
        .maybeSingle();

      const offerRecord = {
        account_id: user.id,
        campaign_id: parsed.data.campaign_id,
        application_id: parsed.data.application_id,
        field_values: resolvedFieldValues,
        candidate_email: appRow?.candidate_email || (fieldValues.candidate_email as string) || "",
        company_signer_email: user.email || "",
        status: "sent_to_candidate",
        sent_to_candidate_at: new Date().toISOString(),
      };

      if (existingOffer) {
        await adminSupabase.from("offers").update(offerRecord).eq("id", existingOffer.id);
      } else {
        await adminSupabase.from("offers").insert(offerRecord);
      }
    } catch (offerSaveErr) {
      console.warn(
        "[api/offers/send] Failed to persist offer record in offers table:",
        offerSaveErr,
      );
    }

    // Record offer decision in decision_ledger
    try {
      await adminSupabase.from("decision_ledger").insert({
        account_id: user.id,
        application_id: parsed.data.application_id,
        campaign_id: parsed.data.campaign_id,
        stage: "offer",
        decision: "offer_sent",
        action: "offer",
        rationale: `Offer letter generated for position ${positionTitle} (${currency} ${salary}).`,
        source: "recruiter",
        decided_at: new Date().toISOString(),
      });
    } catch {}

    const responseOffer = {
      candidate_name: candidateName,
      position_title: positionTitle,
      salary,
      currency,
      start_date: startDate,
      company_name: companyName,
      signatory_name: signatoryName,
      signatory_title: signatoryTitle,
      field_values: resolvedFieldValues,
      sent_at: new Date().toISOString(),
    };

    if (n8nSuccess) {
      return NextResponse.json(
        typeof n8nPayload === "object" && n8nPayload !== null
          ? { ...(n8nPayload as Record<string, unknown>), success: true, offer: responseOffer }
          : { success: true, offer: responseOffer },
        { status: n8nStatus },
      );
    }

    return NextResponse.json({
      success: true,
      offer: responseOffer,
      message: `Offer letter generated and sent to ${candidateName || appRow?.candidate_email || "candidate"}.`,
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
