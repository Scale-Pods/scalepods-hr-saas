/**
 * Route visibility rules, kept pure so middleware and tests share one source
 * of truth. `(recruiter)` routes require a session; `(auth)` and `(candidate)`
 * routes are public (candidate pages are token-gated, not session-gated).
 */
const PROTECTED_PREFIXES = ["/dashboard", "/campaigns", "/candidates", "/billing", "/settings"];

const PUBLIC_PREFIXES = ["/auth", "/book", "/interview", "/assignment", "/thanks", "/api"];

function matches(prefixes: string[], pathname: string): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || matches(PUBLIC_PREFIXES, pathname);
}

export function isProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  return matches(PROTECTED_PREFIXES, pathname);
}
