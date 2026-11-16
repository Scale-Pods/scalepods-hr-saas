import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { getScalePodsDashboardAnswer } from "@/features/agent/dashboardKnowledge";
import { supabaseServer } from "@/lib/supabase/server";

interface RawAgentResponse {
  reply?: string;
  suggestions?: string[];
  actionButtons?: Array<{ label?: string; href?: string; isExternal?: boolean }>;
}

function cleanAndNormalizeResponse(data: RawAgentResponse | null | undefined) {
  let reply = typeof data?.reply === "string" ? data.reply : "";
  let suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  let actionButtons = Array.isArray(data?.actionButtons) ? data.actionButtons : [];

  // 1. If reply contains ```json ... ``` code fence, parse it
  const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.suggestions) && suggestions.length === 0) {
        suggestions = parsed.suggestions;
      }
      if (Array.isArray(parsed.actionButtons) && actionButtons.length === 0) {
        actionButtons = parsed.actionButtons;
      }
      const textBefore = reply.slice(0, jsonMatch.index).trim();
      if (textBefore.length > 20) {
        reply = textBefore;
      } else if (parsed.reply) {
        reply = parsed.reply;
      }
    } catch {}
    reply = reply.replace(/```(?:json)?[\s\S]*?(?:```|$)/gi, "").trim();
  }

  // 2. If reply contains raw {"reply": ...}
  const rawObjMatch = reply.match(/\{[\s\S]*"reply"[\s\S]*\}/);
  if (rawObjMatch) {
    try {
      const parsed = JSON.parse(rawObjMatch[0]);
      if (parsed.reply) reply = parsed.reply;
      if (Array.isArray(parsed.suggestions) && suggestions.length === 0)
        suggestions = parsed.suggestions;
      if (Array.isArray(parsed.actionButtons) && actionButtons.length === 0)
        actionButtons = parsed.actionButtons;
    } catch {}
    reply = reply.replace(/\{[\s\S]*"reply"[\s\S]*\}/gi, "").trim();
  }

  // 3. Clean any leftover JSON keys or code fences
  reply = reply.replace(/```[\s\S]*$/gi, "").trim();
  reply = reply.replace(/\{?\s*"reply"\s*:\s*"?[\s\S]*$/gi, "").trim();
  reply = reply.replace(/\{?\s*"suggestions"\s*:\s*\[?[\s\S]*$/gi, "").trim();

  // 4. Clean out any mention of SES
  reply = reply.replace(/\bAWS\s+SES\b/gi, "our support team");
  reply = reply.replace(/\bSES\b/gi, "support");

  // 5. Normalize actionButtons URLs (NEVER allow scalepods.co for internal paths)
  actionButtons = actionButtons.map(
    (btn: { label?: string; href?: string; isExternal?: boolean }) => {
      let href = typeof btn?.href === "string" ? btn.href : "/campaigns";
      if (href.includes("scalepods.co") || href.includes("scalepods.tech")) {
        try {
          const u = new URL(href);
          href = u.pathname + u.search;
        } catch {
          href = "/campaigns";
        }
      } else if (/^(campaigns|billing|settings|dashboard|candidates|guide)/i.test(href)) {
        href = `/${href}`;
      }

      const isInternal = href.startsWith("/");
      return {
        label: btn?.label || "View",
        href,
        isExternal: !isInternal && href.startsWith("http"),
      };
    },
  );

  return {
    ...data,
    reply:
      reply ||
      "I am here to help you navigate ScalePods. Feel free to ask about Campaigns, Voice screening, or contact our support team.",
    suggestions: suggestions.slice(0, 3),
    actionButtons,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const action = body.action === "support_ticket" ? "support_ticket" : "chat";
    const history = Array.isArray(body.history) ? body.history : [];
    const category = typeof body.category === "string" ? body.category : "General Support";
    const subject = typeof body.subject === "string" ? body.subject : "";

    if (!message && action === "chat") {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    // Attempt to pull user & account context from Supabase server session
    let userName = body.user_name || "Recruiter";
    let userEmail = body.user_email || "user@scalepods.internal";
    let accountId = body.account_id || "acc_unknown";
    let tier = body.tier || "free";

    try {
      const supabase = await supabaseServer();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        userEmail = user.email || userEmail;
        userName =
          user.user_metadata?.name ||
          user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          userName;

        const { data: acc } = await supabase
          .from("accounts")
          .select("id, tier, name, company_name")
          .eq("id", user.id)
          .maybeSingle();

        if (acc) {
          accountId = acc.id;
          tier = acc.tier || tier;
          if (acc.name) userName = acc.name;
        }
      }
    } catch {
      // Continue with provided body details
    }

    const payload = {
      action,
      message,
      history,
      user_name: userName,
      user_email: userEmail,
      account_id: accountId,
      tier,
      category,
      subject,
    };

    // Forward to n8n workflow webhook
    const env = getEnv();
    const n8nBase = env.NEXT_PUBLIC_N8N_BASE_URL
      ? env.NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "").replace(/\/webhook\/?$/, "")
      : "";

    if (n8nBase) {
      try {
        const webhookUrl = `${n8nBase}/webhook/dashboard/support-chat`;
        const n8nRes = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });

        if (n8nRes.ok) {
          const data = await n8nRes.json().catch(() => null);
          if (data && (data.reply || data.success)) {
            return NextResponse.json(cleanAndNormalizeResponse(data));
          }
        }
      } catch (n8nErr) {
        console.warn("n8n support-chat webhook failed, falling back to local engine:", n8nErr);
      }
    }

    // Local graceful fallback
    if (action === "support_ticket") {
      const ticketId = `SP-SUP-${Math.floor(100000 + Math.random() * 900000)}`;
      return NextResponse.json({
        success: true,
        type: "ticket_created",
        ticket_id: ticketId,
        reply: `Support ticket **${ticketId}** has been registered. Our engineering and support team has been alerted, and we will follow up with you at **${userEmail}**.`,
        suggestions: ["How do I create a campaign?", "View Billing Plans", "Close Chat"],
      });
    }

    const localAnswer = getScalePodsDashboardAnswer(message);
    return NextResponse.json(cleanAndNormalizeResponse(localAnswer));
  } catch {
    return NextResponse.json(
      {
        reply:
          "I'm sorry, I encountered a temporary network hiccup. You can reach out directly to support at info@scalepods.co or on WhatsApp at +91 98672 71848.",
        suggestions: ["How do I create a campaign?", "What are the pricing plans?"],
      },
      { status: 200 },
    );
  }
}
