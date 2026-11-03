import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { isProtectedPath } from "@/lib/auth-paths";

/**
 * Refreshes the Supabase session cookie on every request (so Server Components
 * always see a valid session) and bounces unauthenticated users off recruiter
 * routes to /auth with a `next` hint.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { pathname, search } = request.nextUrl;
  const isProtected = isProtectedPath(pathname);

  // Only verify user session with remote Supabase for protected paths
  if (isProtected) {
    const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    const fullTarget = pathname + search;
    if (!hasAuthCookie) {
      if (
        pathname === "/settings" &&
        request.nextUrl.searchParams.get("calendar") === "connected"
      ) {
        const redirect = request.nextUrl.clone();
        redirect.pathname = "/calendar/connect";
        redirect.search = "?status=connected";
        return NextResponse.redirect(redirect);
      }

      const redirect = request.nextUrl.clone();
      redirect.pathname = "/auth";
      redirect.search = "";
      redirect.searchParams.set("next", fullTarget);
      const res = NextResponse.redirect(redirect);
      for (const c of response.cookies.getAll()) {
        res.cookies.set(c);
      }
      return res;
    }

    // Do not block lightweight RSC prefetch requests on remote auth network verification
    const isPrefetch =
      request.headers.get("purpose") === "prefetch" ||
      request.headers.get("next-router-prefetch") === "1" ||
      request.headers.get("x-middleware-prefetch") === "1";

    if (isPrefetch) {
      return response;
    }

    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null }, error: new Error("Auth timeout") }), 2500),
    );

    const {
      data: { user },
    } = await Promise.race([supabase.auth.getUser(), timeoutPromise]);

    if (!user) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/auth";
      redirect.search = "";
      redirect.searchParams.set("next", fullTarget);
      const res = NextResponse.redirect(redirect);
      for (const c of response.cookies.getAll()) {
        res.cookies.set(c);
      }
      return res;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
