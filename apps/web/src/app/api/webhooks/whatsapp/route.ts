import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

// GET: Meta WhatsApp Webhook Verification Challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken =
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    "scalepods_whatsapp_verify_token";

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[api/webhooks/whatsapp] Webhook verified successfully.");
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  console.warn("[api/webhooks/whatsapp] Verification failed for token:", token);
  return NextResponse.json({ error: "Forbidden: verification token mismatch" }, { status: 403 });
}

// POST: Meta WhatsApp Statuses (delivered, read, sent, failed) & Inbound Messages
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ status: "ignored_empty_payload" }, { status: 200 });
    }

    const env = getEnv();
    const serviceRoleKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check for Meta structure: entry[].changes[].value
    const entries = Array.isArray(body.entry) ? (body.entry as Array<Record<string, unknown>>) : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes)
        ? (entry.changes as Array<Record<string, unknown>>)
        : [];
      for (const change of changes) {
        const val = change.value as Record<string, unknown> | undefined;
        if (!val) continue;

        // 1. Process Status Updates (delivered, read, sent, failed)
        if (Array.isArray(val.statuses)) {
          for (const statusObj of val.statuses as Array<Record<string, unknown>>) {
            const wamid = String(statusObj.id || "");
            const status = String(statusObj.status || "").toLowerCase().trim();
            const recipient = String(statusObj.recipient_id || "").replace(/\D/g, "");

            if (!status) continue;

            console.log(
              `[api/webhooks/whatsapp] Processing status event: "${status}" for message: ${wamid}, recipient: ${recipient}`,
            );

            // Attempt 1: Match exactly by provider_message_id
            if (wamid) {
              const { data: updatedByMsgId } = await supabaseAdmin
                .from("outreach_log")
                .update({
                  delivery_state: status,
                })
                .eq("provider_message_id", wamid)
                .select("id");

              if (updatedByMsgId && updatedByMsgId.length > 0) {
                console.log(
                  `[api/webhooks/whatsapp] Successfully updated ${updatedByMsgId.length} outreach_log row(s) to "${status}" via message ID.`,
                );
                continue;
              }
            }

            // Attempt 2: Fallback to matching by candidate recipient phone
            if (recipient) {
              const cleanedPhone = recipient.slice(-10); // match last 10 digits
              const { data: candidates } = await supabaseAdmin
                .from("candidates")
                .select("id")
                .ilike("phone", `%${cleanedPhone}%`)
                .limit(5);

              if (candidates && candidates.length > 0) {
                const candIds = candidates.map((c) => c.id);
                // Update latest whatsapp dispatch for this candidate
                const { data: latestOutreach } = await supabaseAdmin
                  .from("outreach_log")
                  .select("id")
                  .in("candidate_id", candIds)
                  .eq("channel", "whatsapp")
                  .order("sent_at", { ascending: false })
                  .limit(1);

                if (latestOutreach && latestOutreach.length > 0) {
                  await supabaseAdmin
                    .from("outreach_log")
                    .update({
                      delivery_state: status,
                      provider_message_id: wamid || undefined,
                    })
                    .eq("id", latestOutreach[0].id);

                  console.log(
                    `[api/webhooks/whatsapp] Successfully updated latest candidate outreach (${latestOutreach[0].id}) to "${status}".`,
                  );
                }
              }
            }
          }
        }
      }
    }

    // Always respond 200 OK to Meta to acknowledge receipt promptly
    return NextResponse.json({ success: true, processed: true }, { status: 200 });
  } catch (err) {
    console.error("[api/webhooks/whatsapp] Error handling webhook:", err);
    // Respond 200 to prevent Meta from disabling the webhook endpoint on transient error
    return NextResponse.json({ success: false, error: "Internal processing error" }, { status: 200 });
  }
}

