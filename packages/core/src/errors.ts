export class N8nError extends Error {
  readonly status: number;
  readonly path: string;
  readonly detail?: string;
  readonly reason?: string;

  constructor(
    message: string,
    opts: { status: number; path: string; detail?: string; reason?: string },
  ) {
    super(message);
    this.name = "N8nError";
    this.status = opts.status;
    this.path = opts.path;
    this.detail = opts.detail;
    this.reason = opts.reason;
  }
}

/**
 * Thrown when the Credit & Usage Guard (workflow 7) denies an action with
 * HTTP 402 (credit exhaustion) or 403 (hard tier-limit block on campaign
 * creation / round scheduling). The UI handles both via a single reusable
 * TierLimitToast + upgrade CTA - never bespoke per-page error handling.
 */
export class TierLimitError extends N8nError {
  constructor(
    path: string,
    message: string,
    detail?: string,
    reason?: string,
    status: number = 403,
  ) {
    super(message, { status, path, detail, reason });
    this.name = "TierLimitError";
  }
}
