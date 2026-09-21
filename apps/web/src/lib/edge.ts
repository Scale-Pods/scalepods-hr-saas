/**
 * Thin Supabase Edge Function client (checkout / portal / score-assignment).
 * Edge Functions live at {SUPABASE_URL}/functions/v1/{name}.
 */
export class EdgeError extends Error {
  readonly status: number;
  readonly detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "EdgeError";
    this.status = status;
    this.detail = detail;
  }
}

export async function callEdge<T>(
  name: string,
  opts: {
    body?: unknown;
    accessToken?: string;
    method?: "GET" | "POST";
    query?: Record<string, string>;
  },
): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new EdgeError("SUPABASE_URL is not configured", 0);
  const endpoint = `${url.replace(/\/+$/, "")}/functions/v1/${name}`;
  const u = new URL(endpoint);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) u.searchParams.set(k, v);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;

  const res = await fetch(u.toString(), {
    method: opts.method ?? "POST",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }
  if (!res.ok) {
    const errBody = (payload as { error?: string; detail?: string }) ?? {};
    throw new EdgeError(
      errBody.error ?? `Edge function returned ${res.status}`,
      res.status,
      errBody.detail,
    );
  }
  return payload as T;
}
