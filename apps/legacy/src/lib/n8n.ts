import { N8nError, TierLimitError } from "@scalepods/core";
export { N8nError, TierLimitError };

export interface WebhookRequest {
  method?: "GET" | "POST";
  /** Bearer session JWT - sent on every recruiter webhook so RLS + n8n can
   *  identify the caller. Candidate-facing calls omit this. */
  accessToken?: string;
  /** JSON body. For multipart uploads pass `formData` instead. */
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string>;
  signal?: AbortSignal;
}

export type WebhookResponse<T> = T & { _httpStatus: number };

function baseUrl(): string {
  const base = import.meta.env.VITE_N8N_BASE_URL as string | undefined;
  if (!base) {
    throw new N8nError("N8N_BASE_URL is not configured", {
      status: 0,
      path: "",
    });
  }
  // Strip any trailing slash and a trailing `/webhook` segment: the request
  // helpers append `/webhook/<path>` themselves, so the env must be the bare
  // n8n root (e.g. `https://n8n.example`). Tolerating a `/webhook` suffix in
  // the env prevents a double-`/webhook/webhook` URL from config drift.
  return base.replace(/\/+$/, "").replace(/\/webhook\/?$/, "");
}

/**
 * Absolute URL for a workflow webhook, used for plain-GET redirect flows
 * (e.g. calendar connect - PATCH 5). The backend handles the OAuth exchange
 * itself and returns the recruiter to the app with ?calendar=connected.
 */
export function webhookUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(`${baseUrl()}/webhook/${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

const ALLOWED_VARYING_STATUS = new Set([200, 201, 202]);
const TIER_LIMIT_STATUS = new Set([402, 403]);

/**
 * Single entry point for every workflow action. All requests go through here
 * so error handling stays consistent: 402 (credit exhaustion) and 403 (hard
 * tier-limit block) -> TierLimitError, everything else non-2xx -> N8nError with
 * the webhook's body surfaced as detail.
 */
export async function callWebhook<T>(
  path: string,
  req: WebhookRequest = {}
): Promise<WebhookResponse<T>> {
  const endpoint = `${baseUrl()}/webhook/${path}`;
  const method = req.method ?? "POST";

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (req.accessToken) headers.Authorization = `Bearer ${req.accessToken}`;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";

  const url = new URL(endpoint);
  if (req.query) {
    for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: req.formData ?? (req.body !== undefined ? JSON.stringify(req.body) : undefined),
      signal: req.signal,
    });
  } catch (err) {
    if (req.signal?.aborted) {
      throw new N8nError("Request aborted", { status: 0, path });
    }
    throw new N8nError("Could not reach the workflow backend", {
      status: 0,
      path,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text ? { error: text.slice(0, 500) } : null;
  }

  const errBody = (isRecord(payload) ? payload : {}) as Record<string, unknown>;
  const message = typeof errBody.error === "string" ? errBody.error : response.statusText;
  const detail = typeof errBody.detail === "string" ? errBody.detail : undefined;
  const reason = typeof errBody.reason === "string" ? errBody.reason : undefined;

  if (TIER_LIMIT_STATUS.has(response.status)) {
    throw new TierLimitError(path, message || "Plan limit reached", detail, reason, response.status);
  }
  if (!ALLOWED_VARYING_STATUS.has(response.status)) {
    throw new N8nError(message || `Unexpected status ${response.status}`, {
      status: response.status,
      path,
      detail,
      reason,
    });
  }

  return { ...(isRecord(payload) ? (payload as T) : ({} as T)), _httpStatus: response.status };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}