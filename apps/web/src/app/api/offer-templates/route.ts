import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { extractCustomOfferVariables } from "@/lib/offer-template-utils";
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

/** GET /api/offer-templates — list account's templates */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("offer_templates")
      .select(
        "id, name, file_name, storage_path, raw_text, html_content, variables, is_default, created_at",
      )
      .eq("account_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ templates: data ?? [] });
  } catch (err) {
    console.error("[api/offer-templates GET]", err);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

/**
 * POST /api/offer-templates — save a new template.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      name?: string;
      file_name?: string;
      storage_path?: string;
      raw_text?: string;
      html_content?: string;
      is_default?: boolean;
    };

    const { name, file_name, storage_path, raw_text, html_content, is_default = false } = body;
    if (!name?.trim() || !file_name?.trim() || !storage_path?.trim() || !raw_text?.trim()) {
      return NextResponse.json(
        { error: "name, file_name, storage_path, and raw_text are required" },
        { status: 400 },
      );
    }

    const variables = extractCustomOfferVariables(html_content || raw_text);
    const admin = getAdminClient();

    if (is_default) {
      await admin
        .from("offer_templates")
        .update({ is_default: false })
        .eq("account_id", user.id)
        .eq("is_default", true);
    }

    const { data, error } = await admin
      .from("offer_templates")
      .insert({
        account_id: user.id,
        name: name.trim(),
        file_name: file_name.trim(),
        storage_path: storage_path.trim(),
        raw_text: raw_text.trim(),
        html_content: html_content?.trim() || null,
        variables,
        is_default,
        created_by: user.id,
      })
      .select(
        "id, name, file_name, storage_path, raw_text, html_content, variables, is_default, created_at",
      )
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    console.error("[api/offer-templates POST]", err);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}

/**
 * PATCH /api/offer-templates — update template name, raw_text, or is_default.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      id?: string;
      name?: string;
      raw_text?: string;
      html_content?: string;
      is_default?: boolean;
    };

    const { id, name, raw_text, html_content, is_default } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const admin = getAdminClient();

    const { data: existing } = await admin
      .from("offer_templates")
      .select("id, account_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing || existing.account_id !== user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (name?.trim()) updates.name = name.trim();
    if (raw_text?.trim()) {
      updates.raw_text = raw_text.trim();
      updates.variables = extractCustomOfferVariables(html_content?.trim() || raw_text);
    }
    if (html_content?.trim()) {
      updates.html_content = html_content.trim();
      updates.variables = extractCustomOfferVariables(html_content.trim());
    }
    if (is_default !== undefined) {
      if (is_default) {
        await admin
          .from("offer_templates")
          .update({ is_default: false })
          .eq("account_id", user.id)
          .eq("is_default", true);
      }
      updates.is_default = is_default;
    }

    const { data, error } = await admin
      .from("offer_templates")
      .update(updates)
      .eq("id", id)
      .select(
        "id, name, file_name, storage_path, raw_text, html_content, variables, is_default, created_at",
      )
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (err) {
    console.error("[api/offer-templates PATCH]", err);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

/** DELETE /api/offer-templates?id=<uuid> — remove a template (admin only) */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const user = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();

    const { data: existing } = await admin
      .from("offer_templates")
      .select("id, account_id, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (!existing || existing.account_id !== user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.storage_path) {
      await admin.storage.from("offer-templates").remove([existing.storage_path]);
    }

    const { error } = await admin.from("offer_templates").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/offer-templates DELETE]", err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
