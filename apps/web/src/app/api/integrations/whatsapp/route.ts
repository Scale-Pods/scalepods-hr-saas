import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  let user: { id: string } | null = null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (token) {
    const env = getEnv();
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const {
      data: { user: tokenUser },
    } = await anon.auth.getUser(token);
    user = tokenUser;
  } else {
    try {
      const server = await supabaseServer();
      const {
        data: { user: cookieUser },
      } = await server.auth.getUser();
      user = cookieUser;
    } catch {}
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const { error } = await adminClient
    .from("account_channel_integrations")
    .delete()
    .eq("account_id", user.id)
    .eq("channel", "whatsapp");

  if (error) {
    console.error("[api/integrations/whatsapp] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message:
      "WhatsApp disconnected. Future messages will automatically send via ScalePods fallback.",
  });
}
