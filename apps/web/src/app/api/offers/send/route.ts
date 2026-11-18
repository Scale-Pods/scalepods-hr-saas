import { offerRequestSchema } from "@scalepods/core";
import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import {
  generateStyledOfferPdf,
  getDefaultLetterheadBuffer,
  numberToWords,
} from "@/lib/generate-styled-offer-pdf";
import { callN8nGateway } from "@/lib/n8n-gateway";
import { cleanOfferTemplateDirectives, renderOfferTemplateText } from "@/lib/offer-template-utils";
import { fillOfferDocx } from "@/lib/offers/fill-docx";
import {
  extractDocumentImageFromDocxBuffer,
  extractDocumentTextFromDocxBuffer,
} from "@/lib/offers/prune-docx-xml";
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

    const renderedText = parsed.data.rendered_text?.trim() || "";
    const renderedHtml = parsed.data.rendered_html?.trim() || "";
    const offerTemplateId = parsed.data.offer_template_id || null;
    const sendAsIs = Boolean(parsed.data.send_as_is);

    let pdfBase64: string | undefined;
    let pdfFilename: string | undefined;
    let filledDocxPath: string | null = null;
    let generatedPdfPath: string | null = null;

    const dynamicVars = (fieldValues.dynamic_variables || fieldValues) as Record<string, string>;

    const rawLetterType = String(
      fieldValues.letter_type ||
        fieldValues.LETTER_TYPE ||
        dynamicVars.letter_type ||
        dynamicVars.LETTER_TYPE ||
        "",
    )
      .toLowerCase()
      .trim();

    const campaignName = (appRow?.campaigns as { name?: string } | undefined)?.name || "";
    let isIntern = false;
    if (rawLetterType === "intern") {
      isIntern = true;
    } else if (rawLetterType === "fulltime") {
      isIntern = false;
    } else {
      isIntern =
        /\bintern(?:ship)?\b/i.test(positionTitle) || /\bintern(?:ship)?\b/i.test(campaignName);
    }

    let duration = String(
      fieldValues.duration || fieldValues.DURATION || (isIntern ? "3 Months" : "Full-time"),
    ).trim();
    if (isIntern && (!duration || duration.toLowerCase().includes("full-time"))) {
      duration = "3 Months";
    }

    const resolvedFieldValues: Record<string, unknown> = {
      ...fieldValues,
      ...dynamicVars,
      letter_type: isIntern ? "intern" : "fulltime",
      LETTER_TYPE: isIntern ? "intern" : "fulltime",
      duration,
      DURATION: duration,
      candidate_name: candidateName,
      CANDIDATE_NAME: candidateName,
      position_title: positionTitle,
      POSITION_TITLE: positionTitle,
      role: positionTitle,
      ROLE: positionTitle,
      salary,
      SALARY: salary,
      currency,
      CURRENCY: currency,
      start_date: startDate,
      START_DATE: startDate,
      joining_date: startDate,
      JOINING_DATE: startDate,
      company_name: companyName,
      COMPANY_NAME: companyName,
      signatory_name: signatoryName,
      SIGNATORY_NAME: signatoryName,
      signatory_title: signatoryTitle,
      SIGNATORY_TITLE: signatoryTitle,
    };

    if (isIntern) {
      const stipendAmount = String(fieldValues.stipend_amount || salary || "5000");
      const rawStipendWords = String(
        fieldValues.stipend_words || fieldValues.STIPEND_WORDS || "",
      ).trim();
      const stipendWords =
        rawStipendWords && rawStipendWords !== "0" && rawStipendWords !== "(0)"
          ? rawStipendWords
          : numberToWords(stipendAmount);

      resolvedFieldValues.stipend_amount = stipendAmount;
      resolvedFieldValues.STIPEND_AMOUNT = stipendAmount;
      resolvedFieldValues.stipend_words = stipendWords;
      resolvedFieldValues.STIPEND_WORDS = stipendWords;

      delete resolvedFieldValues.gross_annual;
      delete resolvedFieldValues.GROSS_ANNUAL;
      delete resolvedFieldValues.gross_annual_words;
      delete resolvedFieldValues.GROSS_ANNUAL_WORDS;
      delete resolvedFieldValues.basic_salary;
      delete resolvedFieldValues.BASIC_SALARY;
      delete resolvedFieldValues.hra;
      delete resolvedFieldValues.HRA;
      delete resolvedFieldValues.special_allowance;
      delete resolvedFieldValues.SPECIAL_ALLOWANCE;
    } else {
      const grossAnnual = String(fieldValues.gross_annual || salary || "600000");
      const rawGrossWords = String(
        fieldValues.gross_annual_words || fieldValues.GROSS_ANNUAL_WORDS || "",
      ).trim();
      const grossAnnualWords =
        rawGrossWords && rawGrossWords !== "0" ? rawGrossWords : numberToWords(grossAnnual);

      const grossNum = Number(grossAnnual.replace(/,/g, "")) || 0;
      const grossMonthly = grossNum > 0 ? Math.round(grossNum / 12) : 0;
      const basicMonthly = grossMonthly > 0 ? Math.round(grossMonthly * 0.5) : 0;
      const basicAnnual = basicMonthly * 12;
      const hraMonthly = grossMonthly > 0 ? Math.round(grossMonthly * 0.3) : 0;
      const hraAnnual = hraMonthly * 12;
      const specialMonthly =
        grossMonthly > 0 ? Math.max(0, grossMonthly - basicMonthly - hraMonthly) : 0;
      const specialAnnual = specialMonthly * 12;

      resolvedFieldValues.gross_annual = grossAnnual;
      resolvedFieldValues.GROSS_ANNUAL = grossAnnual;
      resolvedFieldValues.gross_annual_words = grossAnnualWords;
      resolvedFieldValues.GROSS_ANNUAL_WORDS = grossAnnualWords;
      resolvedFieldValues.gross_monthly = resolvedFieldValues.gross_monthly || String(grossMonthly);
      resolvedFieldValues.GROSS_MONTHLY = resolvedFieldValues.GROSS_MONTHLY || String(grossMonthly);
      resolvedFieldValues.basic_salary = resolvedFieldValues.basic_salary || String(basicMonthly);
      resolvedFieldValues.BASIC_SALARY = resolvedFieldValues.BASIC_SALARY || String(basicMonthly);
      resolvedFieldValues.basic_salary_annual =
        resolvedFieldValues.basic_salary_annual || String(basicAnnual);
      resolvedFieldValues.BASIC_SALARY_ANNUAL =
        resolvedFieldValues.BASIC_SALARY_ANNUAL || String(basicAnnual);
      resolvedFieldValues.hra = resolvedFieldValues.hra || String(hraMonthly);
      resolvedFieldValues.HRA = resolvedFieldValues.HRA || String(hraMonthly);
      resolvedFieldValues.hra_annual = resolvedFieldValues.hra_annual || String(hraAnnual);
      resolvedFieldValues.HRA_ANNUAL = resolvedFieldValues.HRA_ANNUAL || String(hraAnnual);
      resolvedFieldValues.special_allowance =
        resolvedFieldValues.special_allowance || String(specialMonthly);
      resolvedFieldValues.SPECIAL_ALLOWANCE =
        resolvedFieldValues.SPECIAL_ALLOWANCE || String(specialMonthly);
      resolvedFieldValues.special_allowance_annual =
        resolvedFieldValues.special_allowance_annual || String(specialAnnual);
      resolvedFieldValues.SPECIAL_ALLOWANCE_ANNUAL =
        resolvedFieldValues.SPECIAL_ALLOWANCE_ANNUAL || String(specialAnnual);

      delete resolvedFieldValues.stipend_amount;
      delete resolvedFieldValues.STIPEND_AMOUNT;
      delete resolvedFieldValues.stipend_words;
      delete resolvedFieldValues.STIPEND_WORDS;
    }

    try {
      if (!offerTemplateId) {
        return NextResponse.json(
          {
            error: "Template required",
            detail:
              "An offer template (.docx) is required to generate and send an offer letter. Generic text fallbacks have been removed.",
          },
          { status: 400 },
        );
      }

      const { data: tplRow } = await adminSupabase
        .from("offer_templates")
        .select("id, account_id, file_name, storage_path, raw_text")
        .eq("id", offerTemplateId)
        .maybeSingle();

      let filledBuffer: Buffer | null = null;
      let textToRender: string | null = null;
      let templateBgImage: Buffer | null = null;
      if (tplRow?.storage_path) {
        const { data: fileBlob } = await adminSupabase.storage
          .from("offer-templates")
          .download(tplRow.storage_path);

        if (fileBlob) {
          const docxBuffer = Buffer.from(await fileBlob.arrayBuffer());
          templateBgImage = extractDocumentImageFromDocxBuffer(docxBuffer);
          filledBuffer = sendAsIs ? docxBuffer : fillOfferDocx(docxBuffer, resolvedFieldValues);
          textToRender = await extractDocumentTextFromDocxBuffer(docxBuffer, resolvedFieldValues);
          if (textToRender && tplRow?.raw_text === "[Raw DOCX Template]") {
            extractDocumentTextFromDocxBuffer(docxBuffer).then((rawBase) => {
              if (rawBase) {
                adminSupabase
                  .from("offer_templates")
                  .update({ raw_text: rawBase })
                  .eq("id", tplRow.id);
              }
            });
          }
        }
      }

      if (!textToRender || textToRender === "[Raw DOCX Template]") {
        if (renderedText?.trim() && renderedText.trim() !== "[Raw DOCX Template]") {
          textToRender = cleanOfferTemplateDirectives(renderedText.trim(), {
            letterType: isIntern ? "intern" : "fulltime",
            isIntern,
          });
        } else if (tplRow?.raw_text && tplRow.raw_text !== "[Raw DOCX Template]") {
          const cleanedTpl = cleanOfferTemplateDirectives(tplRow.raw_text, {
            letterType: isIntern ? "intern" : "fulltime",
            isIntern,
          });
          textToRender = renderOfferTemplateText(
            cleanedTpl,
            resolvedFieldValues as Record<string, string>,
          );
        } else {
          textToRender = `Employment Offer & Agreement\n\nDear ${candidateName},\n\nWe are pleased to extend this offer of employment for the position of ${parsed.data.field_values?.position_title || "Team Member"}.`;
        }
      }

      // Native high-fidelity styled PDF generation — matching exact Word template branding
      const isDefaultTemplate = Boolean(
        tplRow?.file_name?.toLowerCase().includes("scalepods") ||
          tplRow?.raw_text?.includes("ScalePods"),
      );
      // Full-page background letterhead is ONLY for the built-in ScalePods template.
      // Custom uploaded templates (e.g. Ziegler Aerospace) must NEVER stretch small embedded stamps/logos to full-page A4 wallpapers.
      const bgToUse = isDefaultTemplate
        ? templateBgImage || getDefaultLetterheadBuffer()
        : undefined;

      const signatoryDate = String(
        resolvedFieldValues.signatory_date ||
          resolvedFieldValues.SIGNATORY_DATE ||
          resolvedFieldValues.company_sign_date ||
          resolvedFieldValues.COMPANY_SIGN_DATE ||
          new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
      );

      const signatureBase64 = String(
        resolvedFieldValues.signature_base64 ||
          resolvedFieldValues.signatory_signature ||
          resolvedFieldValues.SIGNATORY_SIGNATURE ||
          "",
      );

      const pdfBuffer = generateStyledOfferPdf(textToRender, {
        companyName: companyName || "Company",
        backgroundImageBuffer: bgToUse,
        isDefaultTemplate,
        companyWebsite: isDefaultTemplate
          ? (resolvedFieldValues.company_website as string) ||
            (resolvedFieldValues.COMPANY_WEBSITE as string) ||
            ""
          : "",
        companyEmail: isDefaultTemplate
          ? (resolvedFieldValues.company_email as string) ||
            (resolvedFieldValues.COMPANY_EMAIL as string) ||
            ""
          : "",
        signatoryDate,
        signatureBase64,
      });

      // Store filled docx and generated pdf in Supabase Storage for audit trail
      const timestamp = Date.now();
      const auditDocxPath = `${user.id}/offers/${parsed.data.application_id}/${timestamp}_filled.docx`;
      const auditPdfPath = `${user.id}/offers/${parsed.data.application_id}/${timestamp}_offer.pdf`;

      const uploadPromises: Promise<unknown>[] = [
        adminSupabase.storage.from("offer-templates").upload(auditPdfPath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        }),
      ];

      if (filledBuffer) {
        uploadPromises.push(
          adminSupabase.storage.from("offer-templates").upload(auditDocxPath, filledBuffer, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: true,
          }),
        );
        filledDocxPath = auditDocxPath;
      }

      await Promise.all(uploadPromises);

      generatedPdfPath = auditPdfPath;
      pdfBase64 = pdfBuffer.toString("base64");
      pdfFilename = `Offer_Letter_${candidateName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    } catch (pdfErr) {
      console.error("[api/offers/send] Offer PDF generation error:", pdfErr);
      return NextResponse.json(
        {
          error: "Failed to generate offer PDF",
          detail: pdfErr instanceof Error ? pdfErr.message : "PDF generation failed.",
        },
        { status: 500 },
      );
    }

    if (!pdfBase64) {
      return NextResponse.json(
        {
          error: "Offer letter PDF was not generated",
          detail: "Cannot dispatch offer letter without the exact template PDF.",
        },
        { status: 502 },
      );
    }

    let n8nSuccess = false;
    let n8nPayload: unknown = null;
    let n8nStatus = 200;
    let n8nErrorDetail: string | null = null;

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
        n8nErrorDetail = `n8n returned HTTP ${response.status}`;
        console.warn("[api/offers/send] n8n returned non-ok status:", response.status, payload);
      }
    } catch (n8nErr) {
      n8nErrorDetail = n8nErr instanceof Error ? n8nErr.message : "n8n gateway unreachable";
      console.warn("[api/offers/send] n8n gateway unreachable:", n8nErr);
    }

    // Guaranteed persistence: Update applications table
    await adminSupabase
      .from("applications")
      .update({ status: "offer_sent", current_stage: "offer" })
      .eq("id", parsed.data.application_id);

    // Guaranteed persistence: Upsert into offers table
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
        offer_template_id: offerTemplateId,
        rendered_text: renderedText || null,
        rendered_html: renderedHtml || null,
        filled_docx_path: filledDocxPath,
        generated_pdf_path: generatedPdfPath,
        send_as_is: sendAsIs,
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
      rendered_text: renderedText || null,
      sent_at: new Date().toISOString(),
    };

    if (n8nSuccess) {
      return NextResponse.json(
        typeof n8nPayload === "object" && n8nPayload !== null
          ? {
              ...(n8nPayload as Record<string, unknown>),
              success: true,
              email_dispatched: true,
              offer: responseOffer,
            }
          : { success: true, email_dispatched: true, offer: responseOffer },
        { status: n8nStatus },
      );
    }

    return NextResponse.json({
      success: true,
      email_dispatched: false,
      email_warning: n8nErrorDetail || "n8n webhook did not respond with 2xx",
      offer: responseOffer,
      message: `Offer letter saved for ${candidateName || appRow?.candidate_email || "candidate"}, but email dispatch via n8n failed (${n8nErrorDetail || "unknown error"}).`,
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
