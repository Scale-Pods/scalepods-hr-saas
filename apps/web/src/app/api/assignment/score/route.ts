import { type NextRequest, NextResponse } from "next/server";

function getN8nBase(): string {
  return (
    process.env.NEXT_PUBLIC_N8N_BASE_URL?.replace(/\/+$/, "") ||
    "https://n8n.srv1711190.hstgr.cloud"
  );
}

/**
 * Same-origin proxy to trigger assignment scoring on n8n without browser CORS preflight issues.
 */
export async function POST(request: NextRequest) {
  let body: { round_instance_id?: string; submission_id?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { round_instance_id, submission_id, token } = body ?? {};
  if (!round_instance_id || !submission_id || !token) {
    return NextResponse.json(
      { error: "round_instance_id, submission_id, and token are required." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${getN8nBase()}/webhook/hiring/assignment-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ round_instance_id, submission_id, token }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text().catch(() => "");
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { ok: res.ok };
    }
    if (!res.ok) {
      console.warn(`[api/assignment/score] n8n webhook returned ${res.status}`);
      return NextResponse.json({ accepted: true, evaluated: false }, { status: 202 });
    }
    return NextResponse.json(payload ?? { accepted: true, evaluated: true }, { status: 200 });
  } catch (err) {
    console.warn("[api/assignment/score] n8n dispatch note:", err);
    return NextResponse.json({ accepted: true, evaluated: false }, { status: 202 });
  }
}
