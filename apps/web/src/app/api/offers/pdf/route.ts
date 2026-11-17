import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { generateTextOfferPdf } from "@/lib/generate-text-offer-pdf";
import { renderOfferTemplateText } from "@/lib/offer-template-utils";
import { extractDocumentTextFromDocxBuffer } from "@/lib/offers/prune-docx-xml";

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
      candidate_name?: string;
      position_title?: string;
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

    const values = (body.field_values || body.dynamic_variables || {}) as Record<string, string>;
    let textToRender = "";

    // 1. If template_id is provided, extract real text directly from the stored .docx template
    if (body.template_id) {
      const { data: tpl } = await adminSupabase
        .from("offer_templates")
        .select("id, account_id, file_name, storage_path, raw_text")
        .eq("id", body.template_id)
        .maybeSingle();

      if (tpl?.storage_path) {
        const { data: fileBlob } = await adminSupabase.storage
          .from("offer-templates")
          .download(tpl.storage_path);
        if (fileBlob) {
          const docxBuffer = Buffer.from(await fileBlob.arrayBuffer());
          textToRender = await extractDocumentTextFromDocxBuffer(docxBuffer, values);
          if (textToRender && tpl?.raw_text === "[Raw DOCX Template]") {
            extractDocumentTextFromDocxBuffer(docxBuffer).then((rawBase) => {
              if (rawBase) {
                adminSupabase
                  .from("offer_templates")
                  .update({ raw_text: rawBase })
                  .eq("id", tpl.id);
              }
            });
          }
        }
      }

      if (!textToRender || textToRender === "[Raw DOCX Template]") {
        if (tpl?.raw_text && tpl.raw_text !== "[Raw DOCX Template]") {
          textToRender = renderOfferTemplateText(tpl.raw_text, values);
        }
      }
    }

    // 2. Fall back to client rendered_text if valid and not the placeholder
    if (
      (!textToRender || textToRender === "[Raw DOCX Template]") &&
      body?.rendered_text?.trim() &&
      body.rendered_text.trim() !== "[Raw DOCX Template]"
    ) {
      textToRender = body.rendered_text.trim();
    }

    if (!textToRender || textToRender === "[Raw DOCX Template]") {
      textToRender = `Employment Offer & Agreement\n\nDear ${body?.candidate_name || "Candidate"},\n\nWe are pleased to extend this offer of employment for the position of ${body?.position_title || "Team Member"}.`;
    }

    const pdfBuffer = generateTextOfferPdf(textToRender);

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

    // 3. Native regeneration directly from stored rendered text or template
    let candidateName = appRow?.candidate_name || "Candidate";
    let pdfBuf: Buffer | null = null;

    if (offerRow?.rendered_text) {
      pdfBuf = generateTextOfferPdf(offerRow.rendered_text);
    } else if (offerRow?.offer_template_id) {
      const { data: tplRow } = await adminSupabase
        .from("offer_templates")
        .select("id, account_id, storage_path, raw_text")
        .eq("id", offerRow.offer_template_id)
        .maybeSingle();

      if (tplRow?.raw_text) {
        const fieldValues = (offerRow.field_values || {}) as Record<string, string>;
        candidateName = fieldValues.candidate_name || candidateName;
        const rendered = renderOfferTemplateText(tplRow.raw_text, fieldValues);
        pdfBuf = generateTextOfferPdf(rendered);
      }
    }

    if (pdfBuf) {
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
    }

    return new NextResponse(
      "Exact offer letter PDF not found. Generic plain-text fallbacks have been removed.",
      { status: 404 },
    );
  } catch (err) {
    console.error("[api/offers/pdf GET] PDF retrieval error:", err);
    return new NextResponse("Failed to load offer PDF", { status: 500 });
  }
}
