import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RequestedDocItem {
  id?: string;
  name: string;
  status: "pending" | "verified" | "rejected";
  notes?: string | null;
  requested_at?: string;
  verified_at?: string | null;
}

function getAuthClient(accessToken?: string) {
  const env = getEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });
}

function getAdminClient() {
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.application_id || !Array.isArray(body.documents) || body.documents.length === 0) {
      return NextResponse.json(
        { error: "Application ID and at least one document are required." },
        { status: 400 },
      );
    }

    const { application_id, documents, custom_message } = body as {
      application_id: string;
      campaign_id?: string;
      documents: string[];
      custom_message?: string;
    };

    // Authenticate recruiter
    let token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    let user: User | null = null;

    if (token) {
      const authClient = getAuthClient(token);
      const {
        data: { user: tokenUser },
      } = await authClient.auth.getUser(token);
      user = tokenUser;
    } else {
      try {
        const serverClient = await supabaseServer();
        const {
          data: { user: cookieUser },
        } = await serverClient.auth.getUser();
        user = cookieUser;
        if (user) {
          const {
            data: { session },
          } = await serverClient.auth.getSession();
          token = session?.access_token || "";
        }
      } catch {
        // Fallback for non-cookie context
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();

    // 1. Fetch application and campaign details
    const { data: appRow, error: appErr } = await admin
      .from("applications")
      .select("id, candidate_id, campaign_id, candidate_name, candidate_email, requested_documents")
      .eq("id", application_id)
      .maybeSingle();

    if (appErr || !appRow) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const { data: campaignRow } = await admin
      .from("campaigns")
      .select("id, name, account_id")
      .eq("id", appRow.campaign_id)
      .maybeSingle();

    const { data: accountRow } = await admin
      .from("accounts")
      .select("id, company_name")
      .eq("id", user.id)
      .maybeSingle();

    const candidateName = appRow.candidate_name || "Candidate";
    const candidateEmail = appRow.candidate_email;
    const positionTitle = campaignRow?.name || "Open Position";
    const companyName = accountRow?.company_name || "ScalePods Hiring";

    // 2. Prepare structured requested_documents payload
    const existingDocs: RequestedDocItem[] = Array.isArray(appRow.requested_documents)
      ? (appRow.requested_documents as unknown as RequestedDocItem[])
      : [];
    const nowIso = new Date().toISOString();

    const newDocObjects: RequestedDocItem[] = documents.map((docName: string, idx: number) => {
      const trimmed = docName.trim();
      const existing = existingDocs.find((d) => d.name?.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        return existing;
      }
      return {
        id: `doc_${Date.now()}_${idx}`,
        name: trimmed,
        status: "pending",
        requested_at: nowIso,
      };
    });

    // 3. Update application in database
    const { error: updateErr } = await admin
      .from("applications")
      .update({
        current_stage: "document_verification",
        requested_documents: newDocObjects,
        documents_status: "requested",
        documents_requested_at: nowIso,
      })
      .eq("id", application_id);

    if (updateErr) {
      console.error("[api/documents/request] DB update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 4. Log to decision ledger
    try {
      await admin.from("decision_ledger").insert({
        account_id: user.id,
        application_id: appRow.id,
        candidate_id: appRow.candidate_id,
        campaign_id: appRow.campaign_id,
        stage: "document_verification",
        score_type: "manual",
        decision: "documents_requested",
        rationale: `Verification documents requested: ${documents.join(", ")}`,
        decided_at: nowIso,
      });
    } catch (dlErr) {
      console.warn("[api/documents/request] Decision ledger logging warning:", dlErr);
    }

    // 5. Send Email via n8n automation gateway
    const emailPayload = {
      application_id: appRow.id,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      position_title: positionTitle,
      company_name: companyName,
      recruiter_email: user.email,
      documents: documents,
      custom_message: custom_message || null,
      requested_at: nowIso,
    };

    let n8nSuccess = false;
    let n8nResponse: unknown = null;

    try {
      const { response, payload } = await callN8nGateway(
        "hiring/document-request",
        token || "",
        emailPayload,
      );
      if (response.ok) {
        n8nSuccess = true;
        n8nResponse = payload;
      } else {
        console.warn(
          "[api/documents/request] n8n returned non-ok status:",
          response.status,
          payload,
        );
      }
    } catch (n8nErr) {
      console.warn("[api/documents/request] n8n gateway unreachable:", n8nErr);
    }

    // 6. Resilient outbox insertion if outbox table is present
    try {
      await admin.from("application_actions_outbox").insert({
        application_id: appRow.id,
        action_type: "document_request_email",
        payload: emailPayload,
        status: n8nSuccess ? "delivered" : "pending",
      });
    } catch {
      // Outbox optional fallback
    }

    return NextResponse.json({
      success: true,
      requested_documents: newDocObjects,
      documents_status: "requested",
      email_dispatched: n8nSuccess,
      n8n_response: n8nResponse,
    });
  } catch (err: unknown) {
    console.error("[api/documents/request] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
