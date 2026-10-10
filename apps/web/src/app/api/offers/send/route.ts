import { offerRequestSchema } from "@scalepods/core";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";

export const dynamic = "force-dynamic";

function getAuthClient() {
  const env = getEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  const parsed = offerRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    data: { user },
    error,
  } = await getAuthClient().auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { response, payload } = await callN8nGateway("hiring/offer-send", token, parsed.data);
    return NextResponse.json(payload ?? { error: "Offer dispatch returned no response." }, {
      status: response.status,
    });
  } catch (dispatchError) {
    console.error("[api/offers/send] n8n dispatch failed:", dispatchError);
    return NextResponse.json(
      { error: "Offer dispatch is unavailable. No offer was sent." },
      { status: 502 },
    );
  }
}
