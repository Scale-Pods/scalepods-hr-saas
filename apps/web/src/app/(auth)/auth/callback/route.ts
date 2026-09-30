import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") || "/dashboard";
  const urlError = requestUrl.searchParams.get("error");
  const urlErrorDescription = requestUrl.searchParams.get("error_description");

  let redirectUrl = new URL(next, requestUrl.origin);

  if (type === "recovery") {
    redirectUrl = new URL("/auth/verify?type=recovery", requestUrl.origin);
  }

  const response = NextResponse.redirect(redirectUrl);

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
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // If Supabase redirected with an error, handle it directly
  if (urlError) {
    return NextResponse.redirect(
      new URL(
        `/auth/verify?error=${encodeURIComponent(urlError)}&error_description=${encodeURIComponent(
          urlErrorDescription || "Authentication failed",
        )}`,
        requestUrl.origin,
      ),
    );
  }

  let errorMessage = "Authentication link is invalid or has expired.";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
    errorMessage = error.message;
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "recovery" | "email" | "signup",
    });
    if (!error) {
      return response;
    }
    errorMessage = error.message;
  }

  return NextResponse.redirect(
    new URL(
      `/auth/verify?error=access_denied&error_description=${encodeURIComponent(errorMessage)}`,
      requestUrl.origin,
    ),
  );
}
