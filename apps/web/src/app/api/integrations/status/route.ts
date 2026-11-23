import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { getAccountIntegrationsSummary } from "@/lib/channel-integrations";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  try {
    const summary = await getAccountIntegrationsSummary(user.id);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[api/integrations/status] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load integrations status" },
      { status: 500 },
    );
  }
}
