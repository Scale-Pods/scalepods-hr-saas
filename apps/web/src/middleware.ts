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

  const { pathname } = request.nextUrl;
  const isProtected = isProtectedPath(pathname);

  // Only verify user session with remote Supabase for protected paths
  if (isProtected) {
    const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    if (!hasAuthCookie) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/auth";
      redirect.search = "";
      redirect.searchParams.set("next", pathname);
      return NextResponse.redirect(redirect);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/auth";
      redirect.search = "";
      redirect.searchParams.set("next", pathname);
      return NextResponse.redirect(redirect);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
