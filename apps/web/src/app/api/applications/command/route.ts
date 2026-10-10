import { applicationDecisionSchema, updateApplicationContactSchema } from "@scalepods/core";
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
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || !("operation" in body)) {
      return NextResponse.json({ error: "An application command is required." }, { status: 400 });
    }

    const command = body as Record<string, unknown>;
    let payload: Record<string, unknown>;
    if (command.operation === "decision") {
      const parsed = applicationDecisionSchema.safeParse(command);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      payload = { operation: "decision", ...parsed.data };
    } else if (command.operation === "update_contact") {
      const parsed = updateApplicationContactSchema.safeParse(command);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      payload = { operation: "update_contact", ...parsed.data };
    } else {
      return NextResponse.json({ error: "Unsupported application command." }, { status: 400 });
    }

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      data: { user },
      error: authError,
    } = await getAuthClient().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { response, payload: result } = await callN8nGateway(
      "hiring/application-command",
      token,
      payload,
    );
    if (!response.ok) {
      const details =
        result && typeof result === "object" ? result : { error: "Application command failed" };
      return NextResponse.json(details, { status: response.status });
    }
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error("[api/applications/command] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Application command failed" },
      { status: 502 },
    );
  }
}
