import { getEnv } from "@/env";

type GatewayResult = {
  response: Response;
  payload: unknown;
};

/**
 * The recruiter JWT is forwarded so Supabase RPCs invoked by n8n retain the
 * authenticated user's RLS context. Supabase remains the authorization boundary.
 */
export async function callN8nGateway(
  path: string,
  accessToken: string,
  body: unknown,
): Promise<GatewayResult> {
  const base = getEnv()
    .NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "")
    .replace(/\/webhook\/?$/, "");
  const response = await fetch(`${base}/webhook/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text.slice(0, 500) };
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    const combinedStr = [obj.errorMessage, obj.error, obj.message, obj.code, obj.details, obj.hint]
      .filter((v): v is string => typeof v === "string")
      .join(" ");

    if (
      /candidate_already_uploaded|already uploaded|already added|23505|unique constraint/i.test(
        combinedStr,
      )
    ) {
      payload = {
        ...obj,
        error: "Candidate already added to this campaign",
        message: "Candidate already added to this campaign",
        code: "candidate_already_uploaded",
      };
    } else if (/phone_required|phone.*required/i.test(combinedStr)) {
      payload = {
        ...obj,
        error: "Phone number is required for campaigns with AI voice screening rounds",
        message: "Phone number is required for campaigns with AI voice screening rounds",
        code: "phone_required",
      };
    } else if (/campaign_has_no_rounds/i.test(combinedStr)) {
      payload = {
        ...obj,
        error: "Campaign has no interview rounds configured",
        message: "Campaign has no interview rounds configured",
        code: "campaign_has_no_rounds",
      };
    } else if (/campaign_closed/i.test(combinedStr)) {
      payload = {
        ...obj,
        error: "This campaign is closed and cannot accept new candidates",
        message: "This campaign is closed and cannot accept new candidates",
        code: "campaign_closed",
      };
    } else if (
      /candidate_name_email_and_resume_required|candidate_fields_required/i.test(combinedStr)
    ) {
      payload = {
        ...obj,
        error: "Candidate name, email, and resume are required",
        message: "Candidate name, email, and resume are required",
        code: "candidate_fields_required",
      };
    } else if (/resume_path_required/i.test(combinedStr)) {
      payload = {
        ...obj,
        error: "Resume file is required",
        message: "Resume file is required",
        code: "resume_path_required",
      };
    } else if (
      /insufficient_quota|quota_exceeded|rate_limit_exceeded|exceeded your current quota/i.test(
        combinedStr,
      )
    ) {
      payload = {
        ...obj,
        error: "AI service quota exceeded. Please check your API credits or try again later",
        message: "AI service quota exceeded. Please check your API credits or try again later",
        code: "quota_exceeded",
      };
    } else if (/resumes_screened_limit|plan_limit_reached/i.test(combinedStr)) {
      payload = {
        ...obj,
        error: "Monthly resume screening limit reached. Please upgrade your plan in Billing",
        message: "Monthly resume screening limit reached. Please upgrade your plan in Billing",
        code: "plan_limit",
      };
    } else if (/not_authenticated|authentication_required/i.test(combinedStr)) {
      payload = {
        ...obj,
        error: "Authentication session expired. Please sign in again",
        message: "Authentication session expired. Please sign in again",
        code: "not_authenticated",
      };
    } else if (/error in the workflow|error in workflow/i.test(combinedStr)) {
      const nodeErrorMatch = combinedStr.match(/error occurred in node '[^']+'[:\s]*(.*)/i);
      const specificMsg = nodeErrorMatch?.[1]?.trim()?.replace(/^[":\s]+|[":\s]+$/g, "");

      const friendlyMessage =
        specificMsg &&
        specificMsg.length > 3 &&
        !/error in the workflow|workflow execution/i.test(specificMsg)
          ? specificMsg
          : "Workflow execution failed. Please check your inputs and try again.";

      payload = {
        ...obj,
        error: friendlyMessage,
        message: friendlyMessage,
      };
    }
  }

  return { response, payload };
}
