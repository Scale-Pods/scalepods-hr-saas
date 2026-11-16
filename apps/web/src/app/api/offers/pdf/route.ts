import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { convertDocxToPdf } from "@/lib/offers/docx-to-pdf";
import { fillOfferDocx } from "@/lib/offers/fill-docx";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/pdf?preview=true
 * Generates a live preview PDF using the exact DOCX template fill engine.
 * No generic/plain-text fallback is permitted: exact template layout or failure.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      template_id?: string;
      field_values?: Record<string, unknown>;
      send_as_is?: boolean;
      candidate_name?: string;
      dynamic_variables?: Record<string, string>;
    } | null;

    if (!body?.template_id) {
      return new NextResponse(
        "template_id is required: only exact .docx templates are supported (fallbacks disabled)",
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

    const { data: tpl, error: tplErr } = await adminSupabase
      .from("offer_templates")
      .select("id, account_id, file_name, storage_path")
      .eq("id", body.template_id)
      .maybeSingle();

    if (tplErr || !tpl) {
      return new NextResponse("Template not found", { status: 404 });
    }

    if (!tpl.storage_path) {
      return new NextResponse("Template storage path missing", { status: 404 });
    }

    const { data: fileBlob, error: dlErr } = await adminSupabase.storage
      .from("offer-templates")
      .download(tpl.storage_path);

    if (dlErr || !fileBlob) {
      return new NextResponse("Template file missing from storage", { status: 404 });
    }

    const docxBuffer = Buffer.from(await fileBlob.arrayBuffer());

    let pdfBuffer: Buffer;
    if (body.send_as_is) {
      pdfBuffer = await convertDocxToPdf(docxBuffer, { tenantId: tpl.account_id });
    } else {
      const values = body.field_values || body.dynamic_variables || {};
      const filled = fillOfferDocx(docxBuffer, values);
      pdfBuffer = await convertDocxToPdf(filled, { tenantId: tpl.account_id });
    }

    const safeName = (body.candidate_name || "Candidate").replace(/[^a-zA-Z0-9]/g, "_");
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
      `Failed to generate exact PDF from template: ${err instanceof Error ? err.message : String(err)}`,
      { status: 502 },
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

    // 3. Fallback: regenerate PDF directly from stored filled docx or original template docx
    let candidateName = appRow?.candidate_name || "Candidate";
    let pdfBuf: Buffer | null = null;

    if (offerRow?.filled_docx_path) {
      const { data: docxBlob } = await adminSupabase.storage
        .from("offer-templates")
        .download(offerRow.filled_docx_path);
      if (docxBlob) {
        const docxBuf = Buffer.from(await docxBlob.arrayBuffer());
        pdfBuf = await convertDocxToPdf(docxBuf, { tenantId: offerRow.account_id });
      }
    } else if (offerRow?.offer_template_id) {
      const { data: tplRow } = await adminSupabase
        .from("offer_templates")
        .select("id, account_id, storage_path")
        .eq("id", offerRow.offer_template_id)
        .maybeSingle();

      if (tplRow?.storage_path) {
        const { data: tplBlob } = await adminSupabase.storage
          .from("offer-templates")
          .download(tplRow.storage_path);
        if (tplBlob) {
          const tplDocx = Buffer.from(await tplBlob.arrayBuffer());
          const fieldValues = (offerRow.field_values || {}) as Record<string, unknown>;
          candidateName = (fieldValues.candidate_name as string) || candidateName;
          const filled = offerRow.send_as_is ? tplDocx : fillOfferDocx(tplDocx, fieldValues);
          pdfBuf = await convertDocxToPdf(filled, { tenantId: tplRow.account_id });
        }
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
