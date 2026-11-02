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
    const rawMsg =
      (typeof obj.errorMessage === "string" && obj.errorMessage) ||
      (typeof obj.error === "string" && obj.error) ||
      (typeof obj.message === "string" && obj.message);
    if (rawMsg && /error in the workflow|error in workflow/i.test(rawMsg)) {
      payload = {
        ...obj,
        error: "Workflow execution failed. Please check your inputs and try again.",
        message: "Workflow execution failed. Please check your inputs and try again.",
      };
    }
  }

  return { response, payload };
}
