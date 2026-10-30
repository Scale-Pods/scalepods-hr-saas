import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/env";

const teamMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  role: z.string().optional().default("interviewer"),
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
      {
        auth: { persistSession: false },
      },
    );

    // Authenticate the user from the JWT
    const {
      data: { user },
      error: authError,
    } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = teamMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    // Use service role key from process.env for reliable server-side write
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey
      ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
          auth: { persistSession: false },
        })
      : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

    const { data, error } = await client
      .from("team_members")
      .insert({
        account_id: user.id,
        name: parsed.data.name.trim(),
        email: parsed.data.email.trim().toLowerCase(),
        role: parsed.data.role.trim() || "interviewer",
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint (account_id, email)
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A teammate with this email already exists in your workspace." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, team_member: data });
  } catch (err) {
    console.error("[api/team-members] unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
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
      {
        auth: { persistSession: false },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let memberId = searchParams.get("id");
    if (!memberId) {
      const body = await req.json().catch(() => ({}));
      memberId = body?.id;
    }

    if (!memberId) {
      return NextResponse.json({ error: "Team member ID is required" }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey
      ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
          auth: { persistSession: false },
        })
      : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

    // 1. Verify the team member exists and belongs to this account
    const { data: member, error: findError } = await client
      .from("team_members")
      .select("id, account_id, name, email")
      .eq("id", memberId)
      .eq("account_id", user.id)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }
    if (!member) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }

    // 2. Unassign from any campaign rounds referencing this team member
    await client
      .from("campaign_rounds")
      .update({ assigned_team_member_id: null })
      .eq("assigned_team_member_id", memberId);

    // 3. Clean up any interviewer feedback records referencing this member
    await client.from("interviewer_feedback").delete().eq("team_member_id", memberId);

    // 4. Clean up any calendar integration records for this member
    await client.from("interviewer_feedback_tokens").delete().eq("team_member_id", memberId);

    await client.from("interviewer_calendar_oauth_states").delete().eq("team_member_id", memberId);

    await client.from("interviewer_calendar_credentials").delete().eq("team_member_id", memberId);

    await client.from("interviewer_calendar_connections").delete().eq("team_member_id", memberId);

    // 5. Delete the team member from the team_members table
    const { error: delError } = await client
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("account_id", user.id);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: true,
      id: memberId,
      name: member.name,
    });
  } catch (err) {
    console.error("[api/team-members] delete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
