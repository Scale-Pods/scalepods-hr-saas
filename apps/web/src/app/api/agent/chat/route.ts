import { type NextRequest, NextResponse } from "next/server";
import {
  getScalePodsAnswer,
  SCALEPODS_COMPANY,
  SCALEPODS_HR_TOOL,
} from "@/features/agent/scalepodsKnowledge";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    // Check if an OpenAI key is configured for dynamic LLM generation
    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      try {
        const systemPrompt = `You are the ScalePods AI Assistant, a friendly, authoritative, and helpful product expert on the ScalePods website (https://www.scalepods.co) and this ScalePods HR SaaS Talent Intelligence Tool.

Company Profile:
- Name: ScalePods ("Growth, Automated.")
- Mission: ${SCALEPODS_COMPANY.mission}
- Official Claude Partner Network Services Track Partner (by Anthropic): Helps enterprise clients design, deploy, and scale Claude-powered intelligent workflows.
- Modular Pods: HR/Hiring Automation, Sales Automation, Ops & Customer Care Automation, Real Estate AI, Manufacturing & Procurement AI.
- Global Presence: Serving clients across India, Dubai / GCC, and globally.
- Official Website: https://www.scalepods.co | WhatsApp: +91 98672 71848 | Email: info@scalepods.co
- Trusted By: ${SCALEPODS_COMPANY.trustedBrands.slice(0, 10).join(", ")}.

This Tool (ScalePods HR SaaS & Talent Intelligence Platform):
- Description: ${SCALEPODS_HR_TOOL.description}
- Plans (STRICT PRODUCTION PRICING ONLY - NEVER mention test mode, test prices, or INR test amounts like ₹1/₹2/₹3):
  1. 🆓 Free Tier: $0/month - 10 resume screens/month, 1 active campaign, standard candidate tracking.
  2. 🥉 Basic Plan: $149/month - 250 resume screens, 50 AI interviews, WhatsApp notifications, AI voice phone screening, 2 interview stages.
  3. 🥈 Growth Plan: $299/month - 1,000 resume screens, 200 AI interviews, take-home assignments, Google Calendar sync, up to 4 interview stages.
  4. 🥇 Enterprise Plan: $599/month or custom - Unlimited resume screens, 6+ custom stages, dedicated RBAC workspaces, custom scoring rubrics, priority 24/7 SLA.
- Core Features: AI Resume Screening (PDF/Word extraction, 0-100% JD alignment score), AI Voice Phone Screening (conversational pre-screening calls via proprietary Voice AI engine), Interactive Live Video Assessments (Vision AI Proctoring), Self-Serve Google Calendar Booking, Automated WhatsApp reach-out, Decision Ledger.
- Security: SOC-2 protocols, TLS 1.3, AES-256, strict Zero Data Training policy on candidate resumes.

CRITICAL RULES:
1. STRICT PRODUCTION PRICING ONLY: NEVER EVER mention "test mode", "₹1", "₹2", "₹3", or test INR amounts in any pricing response. Always present only the official USD pricing ($0, $149/mo, $299/mo, $599/mo or custom).
2. INTERNAL SECRETS & VENDOR ABSTRACTION: NEVER mention internal sub-processors, libraries, or vendor infrastructure (e.g. Vapi, Deepgram, MediaPipe, Supabase, n8n, Razorpay). Always attribute capabilities strictly to ScalePods' proprietary AI engines (e.g. "ScalePods Voice AI Engine", "ScalePods Vision AI Proctoring").
3. ZERO EMOJIS: Do NOT use ANY emojis in your responses (no 👋, 🚀, 📄, 📞, 🤖, 💼, 🏆, etc.). Keep all headings, bullet points, and text sleek, professional, and completely emoji-free.

Tone: Professional, executive, concise, structured with standard bullet points. Always encourage the visitor to try the platform or sign up.
Format: Clean markdown.`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...(Array.isArray(body.history)
                ? body.history.slice(-6).map((h: { sender: string; text: string }) => ({
                    role: h.sender === "user" ? "user" : "assistant",
                    content: h.text,
                  }))
                : []),
              { role: "user", content: message },
            ],
            max_tokens: 450,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let reply = data.choices?.[0]?.message?.content;
          if (reply) {
            // Guarantee no test-mode tokens leak into user responses
            reply = reply
              .replace(/\s*([•·\-|]\s*)?₹\s*\d+\s*(in test mode)?/gi, "")
              .replace(/\s*\(\s*₹\s*\d+\s*(in test mode)?\s*\)/gi, "")
              .replace(/\s*in test mode/gi, "");

            const fallbackMeta = getScalePodsAnswer(message);
            return NextResponse.json({
              reply,
              suggestions: fallbackMeta.suggestions,
              actionButtons: fallbackMeta.actionButtons,
            });
          }
        }
      } catch {
        // Fall back gracefully to internal knowledge engine
      }
    }

    // Always reliable fallback to built-in ScalePods intelligence engine
    const answer = getScalePodsAnswer(message);
    return NextResponse.json(answer);
  } catch (error) {
    return NextResponse.json(
      {
        reply:
          "I'm sorry, I encountered a temporary hiccup. How can I help you explore ScalePods or answer questions about our hiring automation tools?",
        suggestions: ["What is ScalePods?", "What are the pricing plans?"],
      },
      { status: 200 }
    );
  }
}
