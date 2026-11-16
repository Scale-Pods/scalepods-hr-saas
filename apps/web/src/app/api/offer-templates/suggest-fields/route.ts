import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { suggestFieldsWithAnthropic } from "@/lib/offers/suggest-fields";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function authenticateUser(req: NextRequest): Promise<User | null> {
  const env = getEnv();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const authClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      },
    );
    const {
      data: { user },
    } = await authClient.auth.getUser(bearer);
    return user;
  }

  try {
    const serverClient = await supabaseServer();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

function getAdminClient() {
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * POST /api/offer-templates/suggest-fields
 *
 * Uses Anthropic Claude API to analyze finished letter text and suggest dynamic placeholders.
 * Note: Zero document text is logged to server output to protect candidate personal data.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { template_id?: string } | null;
    if (!body?.template_id) {
      return NextResponse.json({ error: "template_id is required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Verify tenant settings (feature toggle)
    const { data: accountRow } = await admin
      .from("accounts")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!accountRow) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: tpl, error: tplErr } = await admin
      .from("offer_templates")
      .select("id, account_id, storage_path")
      .eq("id", body.template_id)
      .maybeSingle();

    if (tplErr || !tpl || tpl.account_id !== user.id) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const { data: fileBlob, error: dlErr } = await admin.storage
      .from("offer-templates")
      .download(tpl.storage_path);

    if (dlErr || !fileBlob) {
      return NextResponse.json({ error: "Template file missing from storage" }, { status: 404 });
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const suggestions = await suggestFieldsWithAnthropic(buffer);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error(
      "[api/offer-templates/suggest-fields] Suggestion error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate AI suggestions for this document",
      },
      { status: 500 },
    );
  }
}
