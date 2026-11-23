import { type NextRequest, NextResponse } from "next/server";
import {
  resolveAccountEmailSender,
  resolveAccountWhatsAppSender,
} from "@/lib/channel-integrations";

export const dynamic = "force-dynamic";

/**
 * Resolver endpoint for n8n / backend notification dispatch workers.
 * GET /api/integrations/resolve-sender?account_id=<uuid>&channel=email|whatsapp
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");
  const channel = searchParams.get("channel") || "email";
  const recruiterEmail = searchParams.get("recruiter_email") || undefined;
  const companyName = searchParams.get("company_name") || undefined;

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  try {
    if (channel === "email") {
      const result = await resolveAccountEmailSender(accountId, recruiterEmail, companyName);
      return NextResponse.json(result);
    }

    if (channel === "whatsapp") {
      const result = await resolveAccountWhatsAppSender(accountId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unsupported channel" }, { status: 400 });
  } catch (err) {
    console.error("[api/integrations/resolve-sender] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve channel sender" },
      { status: 500 },
    );
  }
}
