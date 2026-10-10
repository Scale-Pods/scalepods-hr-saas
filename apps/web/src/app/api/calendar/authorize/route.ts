import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";

const requestSchema = z.object({ team_member_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Select a valid interviewer." }, { status: 400 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const env = getEnv();
  const {
    data: { user },
    error,
  } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  }).auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { response, payload } = await callN8nGateway("calendar/authorize", token, parsed.data);
    return NextResponse.json(payload ?? { error: "Calendar authorization returned no response." }, {
      status: response.status,
    });
  } catch (dispatchError) {
    console.error("[api/calendar/authorize] n8n dispatch failed:", dispatchError);
    return NextResponse.json({ error: "Calendar authorization is unavailable." }, { status: 502 });
  }
}
