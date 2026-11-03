import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/env";

const inviteSchema = z.object({
  team_member_id: z.string().uuid("A valid team member ID is required"),
});

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getEnv();
    const supabaseAnon = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const serviceRoleKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Verify teammate belongs to this recruiter's account
    const { data: member, error: memberErr } = await adminSupabase
      .from("team_members")
      .select("id, name, email, account_id, role")
      .eq("id", parsed.data.team_member_id)
      .eq("account_id", user.id)
      .single();

    if (memberErr || !member) {
      return NextResponse.json({ error: "Teammate not found in your workspace." }, { status: 404 });
    }

    // 2. Fetch company name for branding
    const { data: accountRow } = await adminSupabase
      .from("accounts")
      .select("company_name, name")
      .eq("id", user.id)
      .single();

    const companyName = accountRow?.company_name || accountRow?.name || "ScalePods Workspace";
    const recruiterName = accountRow?.name || "Your team lead";

    // 3. Generate cryptographic token (32 bytes = 64 hex chars)
    const inviteToken = crypto.randomBytes(32).toString("hex");

    // Remove any previous active invite token for this team member
    await adminSupabase.from("team_member_invites").delete().eq("team_member_id", member.id);

    // Save invite token valid for 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: insertErr } = await adminSupabase.from("team_member_invites").insert({
      account_id: user.id,
      team_member_id: member.id,
      token: inviteToken,
      expires_at: expiresAt,
    });

    if (insertErr) {
      console.error("[api/team-members/invite] Failed to store invite token:", insertErr);
      return NextResponse.json({ error: "Failed to generate invitation token." }, { status: 500 });
    }

    // 4. Construct secure invite link
    const appBase = (
      env.NEXT_PUBLIC_FRONTEND_URL ||
      process.env.NEXT_PUBLIC_FRONTEND_URL ||
      "https://scalepods.tech"
    ).replace(/\/+$/, "");

    const inviteLink = `${appBase}/calendar/connect?token=${inviteToken}`;

    // 5. Send invitation email via n8n / notification pipeline
    let emailSent = false;
    try {
      const n8nBase = env.NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "").replace(/\/webhook\/?$/, "");
      const emailPayload = {
        action: "invite_team_member",
        email: member.email,
        name: member.name,
        company_name: companyName,
        recruiter_name: recruiterName,
        invite_link: inviteLink,
        subject: `[Action Required] Connect your Google Calendar for ${companyName} on ScalePods`,
      };

      const res = await fetch(`${n8nBase}/webhook/interviewers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(emailPayload),
      });

      if (res.ok) {
        emailSent = true;
      }
    } catch (dispatchErr) {
      console.warn("[api/team-members/invite] Warning dispatching email via n8n:", dispatchErr);
    }

    return NextResponse.json({
      success: true,
      email_sent: emailSent,
      invite_link: inviteLink,
      teammate_email: member.email,
      teammate_name: member.name,
    });
  } catch (err) {
    console.error("[api/team-members/invite] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

