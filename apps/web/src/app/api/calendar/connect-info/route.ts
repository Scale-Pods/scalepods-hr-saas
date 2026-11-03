import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token || typeof token !== "string" || token.length < 32) {
      return NextResponse.json(
        { valid: false, error: "A valid invitation token is required." },
        { status: 400 },
      );
    }

    const env = getEnv();
    const serviceRoleKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Look up invite token
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("team_member_invites")
      .select("id, team_member_id, account_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (inviteErr || !invite) {
      return NextResponse.json(
        {
          valid: false,
          error: "This calendar invitation link is invalid or has expired.",
        },
        { status: 404 },
      );
    }

    // Check expiration
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        {
          valid: false,
          error: "This calendar invitation link has expired. Please ask your recruiter for a new link.",
        },
        { status: 410 },
      );
    }

    // 2. Fetch team member details
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("id, name, email, role")
      .eq("id", invite.team_member_id)
      .single();

    if (!member) {
      return NextResponse.json(
        { valid: false, error: "Teammate record not found." },
        { status: 404 },
      );
    }

    // 3. Fetch company/workspace name
    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("company_name, name")
      .eq("id", invite.account_id)
      .single();

    // 4. Check calendar connection status
    const { data: connection } = await supabaseAdmin
      .from("interviewer_calendar_connections")
      .select("status, google_email, connected_at")
      .eq("team_member_id", member.id)
      .maybeSingle();

    return NextResponse.json({
      valid: true,
      team_member_id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      company_name: account?.company_name || account?.name || "ScalePods Workspace",
      is_connected: connection?.status === "active" || connection?.status === "connected",
      google_email: connection?.google_email || null,
      status: connection?.status || "disconnected",
    });
  } catch (err) {
    console.error("[api/calendar/connect-info] Unexpected error:", err);
    return NextResponse.json(
      { valid: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
