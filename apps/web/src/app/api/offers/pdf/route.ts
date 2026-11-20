import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import {
  generateStyledOfferPdf,
  getDefaultLetterheadBuffer,
  numberToWords,
} from "@/lib/generate-styled-offer-pdf";
import {
  cleanOfferTemplateDirectives,
  generateStandardOfferLetterText,
  isOfferTemplatePlaceholder,
  renderOfferTemplateText,
} from "@/lib/offer-template-utils";
import {
  type DocumentLogoInfo,
  extractDocumentImageFromDocxBuffer,
  extractDocumentLogoInfoFromDocxBuffer,
  extractDocumentTextFromDocxBuffer,
} from "@/lib/offers/prune-docx-xml";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/pdf?preview=true
 * Generates a live preview PDF using the built-in native PDF engine.
 * No Gotenberg or third-party tools required.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      template_id?: string;
      field_values?: Record<string, unknown>;
      send_as_is?: boolean;
      letter_type?: string;
      candidate_name?: string;
      position_title?: string;
      salary?: string;
      currency?: string;
      start_date?: string;
      company_name?: string;
      signatory_name?: string;
      signatory_title?: string;
      signatory_date?: string;
      signature_base64?: string;
      dynamic_variables?: Record<string, string>;
      rendered_text?: string;
    } | null;

    if (!body || (!body.template_id && !body.rendered_text)) {
      return new NextResponse("Invalid request: template_id or rendered_text required", {
        status: 400,
      });
    }

    const env = getEnv();
    const serviceKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    });

    let values = { ...(body.field_values || body.dynamic_variables || {}) } as Record<
      string,
      string
    >;

    const rawType = String(values.letter_type || values.LETTER_TYPE || body.letter_type || "")
      .toLowerCase()
      .trim();
    const positionTitleStr = String(
      body?.position_title || values.position_title || values.role || "",
    ).toLowerCase();

    let isIntern = false;
    if (rawType === "intern") {
      isIntern = true;
    } else if (rawType === "fulltime") {
      isIntern = false;
    } else {
      isIntern = /\bintern(?:ship)?\b/i.test(positionTitleStr);
    }

    values.letter_type = isIntern ? "intern" : "fulltime";
    values.LETTER_TYPE = isIntern ? "intern" : "fulltime";

    if (isIntern) {
      let dur = String(values.duration || values.DURATION || "3 Months").trim();
      if (!dur || dur.toLowerCase().includes("full-time")) {
        dur = "3 Months";
      }
      values.duration = dur;
      values.DURATION = dur;

      const stipendAmount = String(values.stipend_amount || values.salary || "5000");
      const rawStipendWords = String(values.stipend_words || values.STIPEND_WORDS || "").trim();
      values.stipend_amount = stipendAmount;
      values.STIPEND_AMOUNT = stipendAmount;
      values.stipend_words =
        !rawStipendWords || rawStipendWords === "0" || rawStipendWords === "(0)"
          ? numberToWords(stipendAmount)
          : rawStipendWords;
      values.STIPEND_WORDS = values.stipend_words;

      // Clean full-time compensation fields so they don't leak into intern letters
      delete values.gross_annual;
      delete values.GROSS_ANNUAL;
      delete values.gross_annual_words;
      delete values.GROSS_ANNUAL_WORDS;
      delete values.gross_monthly;
      delete values.GROSS_MONTHLY;
      delete values.basic_salary;
      delete values.BASIC_SALARY;
      delete values.basic_salary_annual;
      delete values.BASIC_SALARY_ANNUAL;
      delete values.hra;
      delete values.HRA;
      delete values.hra_annual;
      delete values.HRA_ANNUAL;
      delete values.special_allowance;
      delete values.SPECIAL_ALLOWANCE;
      delete values.special_allowance_annual;
      delete values.SPECIAL_ALLOWANCE_ANNUAL;
    } else {
      values.duration = "Full-time";
      values.DURATION = "Full-time";

      const grossAnnual = String(values.gross_annual || values.salary || "600000");
      const rawGrossWords = String(
        values.gross_annual_words || values.GROSS_ANNUAL_WORDS || "",
      ).trim();
      values.gross_annual = grossAnnual;
      values.GROSS_ANNUAL = grossAnnual;
      values.gross_annual_words =
        !rawGrossWords || rawGrossWords === "0" ? numberToWords(grossAnnual) : rawGrossWords;
      values.GROSS_ANNUAL_WORDS = values.gross_annual_words;

      const grossNum = Number(grossAnnual.replace(/,/g, "")) || 0;
      const grossMonthly = grossNum > 0 ? Math.round(grossNum / 12) : 0;
      const basicMonthly = grossMonthly > 0 ? Math.round(grossMonthly * 0.5) : 0;
      const basicAnnual = basicMonthly * 12;
      const hraMonthly = grossMonthly > 0 ? Math.round(grossMonthly * 0.3) : 0;
      const hraAnnual = hraMonthly * 12;
      const specialMonthly =
        grossMonthly > 0 ? Math.max(0, grossMonthly - basicMonthly - hraMonthly) : 0;
      const specialAnnual = specialMonthly * 12;

      values.gross_monthly = values.gross_monthly || String(grossMonthly);
      values.GROSS_MONTHLY = values.GROSS_MONTHLY || String(grossMonthly);
      values.basic_salary = values.basic_salary || String(basicMonthly);
      values.BASIC_SALARY = values.BASIC_SALARY || String(basicMonthly);
      values.basic_salary_annual = values.basic_salary_annual || String(basicAnnual);
      values.BASIC_SALARY_ANNUAL = values.BASIC_SALARY_ANNUAL || String(basicAnnual);
      values.hra = values.hra || String(hraMonthly);
      values.HRA = values.HRA || String(hraMonthly);
      values.hra_annual = values.hra_annual || String(hraAnnual);
      values.HRA_ANNUAL = values.HRA_ANNUAL || String(hraAnnual);
      values.special_allowance = values.special_allowance || String(specialMonthly);
      values.SPECIAL_ALLOWANCE = values.SPECIAL_ALLOWANCE || String(specialMonthly);
      values.special_allowance_annual = values.special_allowance_annual || String(specialAnnual);
      values.SPECIAL_ALLOWANCE_ANNUAL = values.SPECIAL_ALLOWANCE_ANNUAL || String(specialAnnual);

      // Clean intern stipend fields so they NEVER trigger intern clauses in template
      delete values.stipend_amount;
      delete values.STIPEND_AMOUNT;
      delete values.stipend_words;
      delete values.STIPEND_WORDS;
    }
    let textToRender = "";
    let templateBgImage: Buffer | null = null;
    let tpl: {
      id: string;
      account_id?: string;
      file_name?: string;
      storage_path?: string;
      raw_text?: string;
    } | null = null;

    let templateLogoInfo: DocumentLogoInfo | null = null;

    const signatoryDate = String(
      body?.signatory_date ||
        values.signatory_date ||
        values.SIGNATORY_DATE ||
        values.company_sign_date ||
        values.COMPANY_SIGN_DATE ||
        new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
    );

    const smartDefaults: Record<string, string> = {
      EMPLOYMENT_TYPE: isIntern ? "Internship" : "Full-Time",
      OFFICE_LOCATION: "Headquarters",
      DEPARTMENT: "Engineering",
      TRAINING_DURATION: "3 Months",
      INTERNSHIP_DURATION: "3 Months",
      EXTENSION_PERIOD: "1 Month",
      MIN_ATTENDANCE: "85%",
      CANDIDATE_FULL_NAME:
        (values.candidate_name as string) || (body?.candidate_name as string) || "Candidate",
      ACCEPTANCE_DATE: signatoryDate,
      SIGNATORY_TITLE: "Authorized Signatory",
      CC_DEPARTMENT: "Engineering",
      REF_NO: `SP/${new Date().getFullYear()}/OFFER/${Math.floor(1000 + Math.random() * 9000)}`,
      ISSUE_DATE: signatoryDate,
    };
    values = { ...smartDefaults, ...values };

    // 1. If template_id is provided, extract real text directly from the stored .docx template
    if (body.template_id) {
      const { data } = await adminSupabase
        .from("offer_templates")
        .select("id, account_id, file_name, storage_path, raw_text")
        .eq("id", body.template_id)
        .maybeSingle();
      tpl = data;

      if (tpl?.storage_path) {
        const { data: fileBlob } = await adminSupabase.storage
          .from("offer-templates")
          .download(tpl.storage_path);
        if (fileBlob) {
          const docxBuffer = Buffer.from(await fileBlob.arrayBuffer());
          templateLogoInfo = extractDocumentLogoInfoFromDocxBuffer(docxBuffer);
          templateBgImage = extractDocumentImageFromDocxBuffer(docxBuffer);
          textToRender = await extractDocumentTextFromDocxBuffer(docxBuffer, values);
          if (textToRender && tpl?.raw_text === "[Raw DOCX Template]") {
            const currentTplId = tpl.id;
            extractDocumentTextFromDocxBuffer(docxBuffer).then((rawBase) => {
              if (rawBase && currentTplId) {
                adminSupabase
                  .from("offer_templates")
                  .update({ raw_text: rawBase })
                  .eq("id", currentTplId);
              }
            });
          }
        }
      }

      if (!textToRender || isOfferTemplatePlaceholder(textToRender)) {
        if (tpl?.raw_text && !isOfferTemplatePlaceholder(tpl.raw_text)) {
          const cleanedTpl = cleanOfferTemplateDirectives(tpl.raw_text, {
            letterType: isIntern ? "intern" : "fulltime",
            isIntern,
          });
          textToRender = renderOfferTemplateText(cleanedTpl, values);
        }
      }
    }

    // 2. Fall back to client rendered_text if valid and not the placeholder
    if (
      (!textToRender || isOfferTemplatePlaceholder(textToRender)) &&
      body?.rendered_text?.trim() &&
      !isOfferTemplatePlaceholder(body.rendered_text)
    ) {
      textToRender = cleanOfferTemplateDirectives(body.rendered_text.trim(), {
        letterType: isIntern ? "intern" : "fulltime",
        isIntern,
      });
    }

    if (!textToRender || isOfferTemplatePlaceholder(textToRender)) {
      textToRender = generateStandardOfferLetterText({
        isIntern,
        candidateName: (values.candidate_name as string) || (body?.candidate_name as string) || "Candidate",
        positionTitle: (values.position_title as string) || (body?.position_title as string) || "Team Member",
        companyName: (values.company_name as string) || (body?.company_name as string) || "ScalePods Partner",
        salary: (values.salary as string) || (body?.salary as string) || (isIntern ? "5000" : "600000"),
        currency: (values.currency as string) || (body?.currency as string) || "INR",
        stipendAmount: values.stipend_amount,
        stipendWords: values.stipend_words,
        duration: values.duration,
        refNo: String(values.REF_NO || values.ref_no || `SP/${new Date().getFullYear()}/OFFER/101`),
        issueDate: String(values.ISSUE_DATE || values.issue_date || signatoryDate),
        joiningDate: String(
          values.start_date ||
            values.START_DATE ||
            values.joining_date ||
            values.JOINING_DATE ||
            (body?.start_date as string) ||
            "09 November 2026",
        ),
        signatoryName: (values.signatory_name as string) || (body?.signatory_name as string) || "Manish",
        signatoryTitle: (values.signatory_title as string) || (body?.signatory_title as string) || "Talent Acquisition Lead",
        signatoryDate,
      });
    }

    const isDefaultTemplate = Boolean(
      tpl?.file_name?.toLowerCase().includes("scalepods") || tpl?.raw_text?.includes("ScalePods"),
    );
    const companyName = (values.company_name as string) || "Company";
    // Full-page background letterhead is ONLY for the built-in ScalePods template.
    // Custom uploaded templates (e.g. Ziegler Aerospace) use top logo placement instead of full-page wallpaper.
    const bgToUse = isDefaultTemplate ? templateBgImage || getDefaultLetterheadBuffer() : undefined;
    const logoToUse = !isDefaultTemplate && templateLogoInfo ? templateLogoInfo : undefined;

    const signatureBase64 = String(
      body?.signature_base64 ||
        values.signature_base64 ||
        values.signatory_signature ||
        values.SIGNATORY_SIGNATURE ||
        "",
    );

    const pdfBuffer = generateStyledOfferPdf(textToRender, {
      companyName,
      backgroundImageBuffer: bgToUse,
      logoImage: logoToUse,
      logoAlignment: logoToUse?.alignment,
      isDefaultTemplate,
      companyWebsite: isDefaultTemplate
        ? values.company_website || values.COMPANY_WEBSITE || ""
        : "",
      companyEmail: isDefaultTemplate ? values.company_email || values.COMPANY_EMAIL || "" : "",
      signatoryDate,
      signatureBase64,
    });

    const safeName = (body?.candidate_name || "Candidate").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Offer_Letter_Preview_${safeName}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("[api/offers/pdf POST] Preview PDF generation error:", err);
    return new NextResponse(
      `Failed to generate preview PDF: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 },
    );
  }
}

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
      account_id?: string;
      application_id?: string;
      field_values?: Record<string, unknown>;
      pdf_url?: string;
      pdf_base64?: string;
      rendered_text?: string | null;
      rendered_html?: string | null;
      offer_template_id?: string | null;
      generated_pdf_path?: string | null;
      filled_docx_path?: string | null;
      send_as_is?: boolean;
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

    // Direct audit PDF retrieval: If the generated PDF is already stored in Supabase Storage, stream it directly
    if (offerRow?.generated_pdf_path) {
      const { data: pdfBlob } = await adminSupabase.storage
        .from("offer-templates")
        .download(offerRow.generated_pdf_path);
      if (pdfBlob) {
        const pdfBuf = Buffer.from(await pdfBlob.arrayBuffer());
        const safeName = (appRow?.candidate_name || "Candidate").replace(/[^a-zA-Z0-9]/g, "_");
        const filename = `Offer_Letter_${safeName}.pdf`;
        return new NextResponse(new Uint8Array(pdfBuf), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": download
              ? `attachment; filename="${filename}"`
              : `inline; filename="${filename}"`,
            "Content-Length": String(pdfBuf.length),
          },
        });
      }
    }

    // 3. Resolve candidate, campaign, and template data for dynamic high-fidelity generation
    let campRow: { name?: string; salary_min?: number; salary_currency?: string } | null = null;
    if (resolvedCampaignId) {
      const { data } = await adminSupabase
        .from("campaigns")
        .select("name, salary_min, salary_currency")
        .eq("id", resolvedCampaignId)
        .maybeSingle();
      campRow = data;
    }

    let candRow: { full_name?: string; name?: string; email?: string } | null = null;
    if (resolvedCandidateId && resolvedCandidateId !== "undefined") {
      const { data } = await adminSupabase
        .from("candidates")
        .select("full_name, name, email")
        .eq("id", resolvedCandidateId)
        .maybeSingle();
      candRow = data;
    }

    const fieldValues = (offerRow?.field_values || {}) as Record<string, string>;
    const candidateName =
      fieldValues.candidate_name ||
      fieldValues.CANDIDATE_NAME ||
      appRow?.candidate_name ||
      candRow?.full_name ||
      candRow?.name ||
      "Candidate";

    const positionTitle =
      fieldValues.position_title ||
      fieldValues.POSITION_TITLE ||
      fieldValues.role ||
      fieldValues.ROLE ||
      campRow?.name ||
      "Open Position";

    const isIntern =
      String(fieldValues.letter_type || fieldValues.LETTER_TYPE || "").toLowerCase() === "intern" ||
      positionTitle.toLowerCase().includes("intern");

    const salary = String(
      fieldValues.salary ||
        fieldValues.SALARY ||
        campRow?.salary_min ||
        (isIntern ? "5000" : "1200000"),
    );

    const stipendAmount = String(
      fieldValues.stipend_amount || fieldValues.STIPEND_AMOUNT || salary || "5000",
    );
    const rawStipendWords = String(
      fieldValues.stipend_words || fieldValues.STIPEND_WORDS || "",
    ).trim();
    const stipendWords =
      rawStipendWords && rawStipendWords !== "0" && rawStipendWords !== "(0)"
        ? rawStipendWords
        : numberToWords(stipendAmount);

    const duration = isIntern
      ? String(fieldValues.duration || fieldValues.DURATION || "3 Months")
      : "Full-time";

    const companyName = fieldValues.company_name || fieldValues.COMPANY_NAME || "ScalePods Partner";

    const companyWebsite =
      fieldValues.company_website || fieldValues.COMPANY_WEBSITE || "www.scalepods.com";

    const companyEmail =
      fieldValues.company_email || fieldValues.COMPANY_EMAIL || "contact@scalepods.com";

    const signatoryName = fieldValues.signatory_name || fieldValues.SIGNATORY_NAME || "Manish";

    const signatoryTitle =
      fieldValues.signatory_title || fieldValues.SIGNATORY_TITLE || "Talent Acquisition Lead";

    const todayFormatted = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const year = new Date().getFullYear();
    const refNo = String(fieldValues.REF_NO || fieldValues.ref_no || `SP/${year}/OFFER/101`);
    const joiningDate = String(
      fieldValues.start_date ||
        fieldValues.START_DATE ||
        fieldValues.joining_date ||
        fieldValues.JOINING_DATE ||
        "09 November 2026",
    );

    const resolvedVariables: Record<string, string> = {
      ...fieldValues,
      candidate_name: candidateName,
      CANDIDATE_NAME: candidateName,
      position_title: positionTitle,
      POSITION_TITLE: positionTitle,
      role: positionTitle,
      ROLE: positionTitle,
      letter_type: isIntern ? "intern" : "fulltime",
      LETTER_TYPE: isIntern ? "intern" : "fulltime",
      duration,
      DURATION: duration,
      salary,
      SALARY: salary,
      stipend_amount: stipendAmount,
      STIPEND_AMOUNT: stipendAmount,
      stipend_words: stipendWords,
      STIPEND_WORDS: stipendWords,
      company_name: companyName,
      COMPANY_NAME: companyName,
      company_website: companyWebsite,
      COMPANY_WEBSITE: companyWebsite,
      company_email: companyEmail,
      COMPANY_EMAIL: companyEmail,
      signatory_name: signatoryName,
      SIGNATORY_NAME: signatoryName,
      signatory_title: signatoryTitle,
      SIGNATORY_TITLE: signatoryTitle,
      ref_no: refNo,
      REF_NO: refNo,
      issue_date: todayFormatted,
      ISSUE_DATE: todayFormatted,
      start_date: joiningDate,
      START_DATE: joiningDate,
      joining_date: joiningDate,
      JOINING_DATE: joiningDate,
    };

    const signatoryDate = String(
      fieldValues.signatory_date ||
        fieldValues.SIGNATORY_DATE ||
        fieldValues.company_sign_date ||
        fieldValues.COMPANY_SIGN_DATE ||
        todayFormatted,
    );

    const signatureBase64 = String(
      fieldValues.signature_base64 ||
        fieldValues.signatory_signature ||
        fieldValues.SIGNATORY_SIGNATURE ||
        "",
    );

    let pdfBuf: Buffer | null = null;

    // A. Render from stored rendered text
    if (offerRow?.rendered_text && !isOfferTemplatePlaceholder(offerRow.rendered_text)) {
      const isDefault = offerRow.rendered_text.includes("ScalePods");
      pdfBuf = generateStyledOfferPdf(offerRow.rendered_text, {
        companyName,
        backgroundImageBuffer: isDefault ? getDefaultLetterheadBuffer() : undefined,
        companyWebsite,
        companyEmail,
        signatoryDate,
        signatureBase64,
      });
    }

    // B. Render from template if available
    if (!pdfBuf && offerRow?.offer_template_id) {
      const { data: tplRow } = await adminSupabase
        .from("offer_templates")
        .select("id, account_id, storage_path, raw_text, file_name")
        .eq("id", offerRow.offer_template_id)
        .maybeSingle();

      const isDefault = Boolean(
        tplRow?.file_name?.toLowerCase().includes("scalepods") ||
          tplRow?.raw_text?.includes("ScalePods"),
      );

      if (tplRow?.storage_path) {
        const { data: fileBlob } = await adminSupabase.storage
          .from("offer-templates")
          .download(tplRow.storage_path);
        if (fileBlob) {
          const docxBuffer = Buffer.from(await fileBlob.arrayBuffer());
          const templateBg =
            extractDocumentImageFromDocxBuffer(docxBuffer) ||
            (isDefault ? getDefaultLetterheadBuffer() : undefined);
          const rendered = await extractDocumentTextFromDocxBuffer(docxBuffer, resolvedVariables);
          if (rendered) {
            pdfBuf = generateStyledOfferPdf(rendered, {
              companyName,
              backgroundImageBuffer: templateBg,
              companyWebsite,
              companyEmail,
              signatoryDate,
              signatureBase64,
            });
          }
        }
      }

      if (!pdfBuf && tplRow?.raw_text && !isOfferTemplatePlaceholder(tplRow.raw_text)) {
        const rendered = renderOfferTemplateText(tplRow.raw_text, resolvedVariables);
        pdfBuf = generateStyledOfferPdf(rendered, {
          companyName,
          backgroundImageBuffer: isDefault ? getDefaultLetterheadBuffer() : undefined,
          companyWebsite,
          companyEmail,
          signatoryDate,
          signatureBase64,
        });
      }
    }

    // C. Check latest offer template in database
    if (!pdfBuf) {
      const { data: latestTpl } = await adminSupabase
        .from("offer_templates")
        .select("id, account_id, storage_path, raw_text, file_name")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isDefault = Boolean(
        latestTpl?.file_name?.toLowerCase().includes("scalepods") ||
          latestTpl?.raw_text?.includes("ScalePods"),
      );

      if (latestTpl?.storage_path) {
        const { data: fileBlob } = await adminSupabase.storage
          .from("offer-templates")
          .download(latestTpl.storage_path);
        if (fileBlob) {
          const docxBuffer = Buffer.from(await fileBlob.arrayBuffer());
          const templateBg =
            extractDocumentImageFromDocxBuffer(docxBuffer) ||
            (isDefault ? getDefaultLetterheadBuffer() : undefined);
          const rendered = await extractDocumentTextFromDocxBuffer(docxBuffer, resolvedVariables);
          if (rendered) {
            pdfBuf = generateStyledOfferPdf(rendered, {
              companyName,
              backgroundImageBuffer: templateBg,
              companyWebsite,
              companyEmail,
              signatoryDate,
              signatureBase64,
            });
          }
        }
      }

      if (!pdfBuf && latestTpl?.raw_text && !isOfferTemplatePlaceholder(latestTpl.raw_text)) {
        const rendered = renderOfferTemplateText(latestTpl.raw_text, resolvedVariables);
        pdfBuf = generateStyledOfferPdf(rendered, {
          companyName,
          backgroundImageBuffer: isDefault ? getDefaultLetterheadBuffer() : undefined,
          companyWebsite,
          companyEmail,
          signatoryDate,
          signatureBase64,
        });
      }
    }

    // D. Guaranteed fallback: Generate structured styled PDF matching ScalePods Word Template
    if (!pdfBuf) {
      const textToRender = generateStandardOfferLetterText({
        isIntern,
        candidateName,
        positionTitle,
        companyName,
        salary,
        currency: (fieldValues.currency as string) || "INR",
        stipendAmount,
        stipendWords,
        duration,
        refNo,
        issueDate: todayFormatted,
        joiningDate,
        signatoryName,
        signatoryTitle,
        signatoryDate,
      });

      pdfBuf = generateStyledOfferPdf(textToRender, {
        companyName,
        backgroundImageBuffer: getDefaultLetterheadBuffer(),
        companyWebsite,
        companyEmail,
        signatoryDate,
        signatureBase64,
      });
    }

    const safeName = candidateName.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Offer_Letter_${safeName}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": download
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        "Content-Length": String(pdfBuf.length),
      },
    });
  } catch (err) {
    console.error("[api/offers/pdf GET] PDF retrieval error:", err);
    return new NextResponse("Failed to load offer PDF", { status: 500 });
  }
}
