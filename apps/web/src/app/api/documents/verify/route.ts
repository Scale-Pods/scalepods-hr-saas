import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
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
    if (!body?.application_id || !body.document_name) {
      return NextResponse.json(
        { error: "application_id and document_name are required." },
        { status: 400 },
      );
    }

    const { application_id, document_name, status, notes } = body as {
      application_id: string;
      document_name: string;
      status: "verified" | "pending" | "rejected";
      notes?: string;
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

    // Fetch existing application
    const { data: appRow, error: appErr } = await admin
      .from("applications")
      .select("id, candidate_id, campaign_id, requested_documents")
      .eq("id", application_id)
      .maybeSingle();

    if (appErr || !appRow) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const existingDocs: RequestedDocItem[] = Array.isArray(appRow.requested_documents)
      ? (appRow.requested_documents as unknown as RequestedDocItem[])
      : [];

    const nowIso = new Date().toISOString();
    let found = false;

    const updatedDocs: RequestedDocItem[] = existingDocs.map((doc) => {
      if (doc.name?.toLowerCase() === document_name.toLowerCase()) {
        found = true;
        return {
          ...doc,
          status: status || "verified",
          notes: notes !== undefined ? notes : doc.notes,
          verified_at: status === "verified" ? nowIso : null,
        };
      }
      return doc;
    });

    if (!found) {
      // If document was not in the existing array, append it
      updatedDocs.push({
        id: `doc_${Date.now()}`,
        name: document_name,
        status: status || "verified",
        notes: notes || null,
        requested_at: nowIso,
        verified_at: status === "verified" ? nowIso : null,
      });
    }

    // Determine overall document status
    const allVerified = updatedDocs.length > 0 && updatedDocs.every((d) => d.status === "verified");
    const anyRejected = updatedDocs.some((d) => d.status === "rejected");
    const someVerified = updatedDocs.some((d) => d.status === "verified");

    let overallStatus: "requested" | "partially_verified" | "verified" | "rejected" = "requested";
    if (allVerified) {
      overallStatus = "verified";
    } else if (anyRejected) {
      overallStatus = "rejected";
    } else if (someVerified) {
      overallStatus = "partially_verified";
    }

    const updatePayload: {
      requested_documents: RequestedDocItem[];
      documents_status: string;
      documents_verified_at?: string;
    } = {
      requested_documents: updatedDocs,
      documents_status: overallStatus,
    };

    if (allVerified) {
      updatePayload.documents_verified_at = nowIso;
    }

    const { error: updateErr } = await admin
      .from("applications")
      .update(updatePayload)
      .eq("id", application_id);

    if (updateErr) {
      console.error("[api/documents/verify] Update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Log manual verification event to decision ledger
    try {
      await admin.from("decision_ledger").insert({
        account_id: user.id,
        application_id: appRow.id,
        candidate_id: appRow.candidate_id,
        campaign_id: appRow.campaign_id,
        stage: "document_verification",
        score_type: "manual",
        decision: `document_${status}`,
        rationale: `Manual verification for "${document_name}": ${status}${notes ? ` (${notes})` : ""}`,
        decided_at: nowIso,
      });
    } catch {
      // Ledger logging fallback
    }

    return NextResponse.json({
      success: true,
      requested_documents: updatedDocs,
      documents_status: overallStatus,
    });
  } catch (err: unknown) {
    console.error("[api/documents/verify] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
