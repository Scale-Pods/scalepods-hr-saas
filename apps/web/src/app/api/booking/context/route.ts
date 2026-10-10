import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const roundInstanceId = params.get("riId") || "";
  const token = params.get("tok") || "";
  if (!roundInstanceId || !token) {
    return NextResponse.json({ error: "A valid booking link is required." }, { status: 400 });
  }
  const env = getEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_booking_context", {
    p_round_instance_id: roundInstanceId,
    p_token: token,
    p_tz_offset_minutes: new Date().getTimezoneOffset(),
  });
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Booking link is invalid or expired." },
      { status: 404 },
    );
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
