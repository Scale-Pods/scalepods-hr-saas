import { N8nError, TierLimitError } from "@scalepods/core";
import { getEnv } from "@/env";

export { N8nError, TierLimitError };

export interface WorkflowRequest {
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

export type WorkflowResponse<T> = T & { _httpStatus: number };

/**
 * n8n root, with any trailing slash and a trailing `/webhook` segment
 * stripped: the helpers append `/webhook/<path>` themselves, so tolerating a
 * `/webhook` suffix prevents a double-`/webhook/webhook` URL from config drift.
 */
function baseUrl(): string {
  const base = getEnv().NEXT_PUBLIC_N8N_BASE_URL;
  return base.replace(/\/+$/, "").replace(/\/webhook\/?$/, "");
}

/** Absolute URL for a plain-GET redirect flow (e.g. calendar OAuth start). */
export function workflowUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(`${baseUrl()}/webhook/${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

const ALLOWED_VARYING_STATUS = new Set([200, 201, 202]);
const TIER_LIMIT_STATUS = new Set([402, 403]);

/**
 * Single entry point for every workflow action. 402 (credit exhaustion) and
 * 403 (hard tier-limit block) -> TierLimitError; any other non-2xx -> N8nError
 * with the webhook body surfaced as `detail`.
 */
export async function callWorkflow<T>(
  path: string,
  req: WorkflowRequest = {},
): Promise<WorkflowResponse<T>> {
  const endpoint = `${baseUrl()}/webhook/${path}`;
  const method = req.method ?? "POST";

  const headers: Record<string, string> = { Accept: "application/json" };
  if (req.accessToken) headers.Authorization = `Bearer ${req.accessToken}`;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";

  const url = new URL(endpoint);
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: req.formData ?? (req.body !== undefined ? JSON.stringify(req.body) : undefined),
      signal: req.signal,
    });
  } catch (error) {
    if (req.signal?.aborted) throw new N8nError("Request aborted", { status: 0, path });
    throw new N8nError("Could not reach the workflow backend", {
      status: 0,
      path,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text ? { error: text.slice(0, 500) } : null;
  }

  const body = (isRecord(payload) ? payload : {}) as Record<string, unknown>;
  const message = typeof body.error === "string" ? body.error : response.statusText;
  const detail = typeof body.detail === "string" ? body.detail : undefined;
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  if (TIER_LIMIT_STATUS.has(response.status)) {
    throw new TierLimitError(
      path,
      message || "Plan limit reached",
      detail,
      reason,
      response.status,
    );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
