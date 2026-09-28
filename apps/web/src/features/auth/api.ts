import type { Session } from "@supabase/supabase-js";
import { getEnv } from "@/env";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface Credentials {
  email: string;
  password: string;
}

export async function getSession(): Promise<Session | null> {
  const supabase = supabaseBrowser();
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error || !sessionData.session) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    await supabase.auth.signOut().catch(() => {});
    return null;
  }

  return sessionData.session;
}

export async function signInWithPassword({
  email,
  password,
}: Credentials): Promise<Session | null> {
  const { data, error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp({ email, password }: Credentials) {
  const { data, error } = await supabaseBrowser().auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut(): Promise<void> {
  const { error } = await supabaseBrowser().auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const origin =
    typeof window !== "undefined" ? window.location.origin : getEnv().NEXT_PUBLIC_FRONTEND_URL;
  const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/verify?type=recovery`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabaseBrowser().auth.updateUser({ password });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string): Promise<Session | null> {
  const { data, error } = await supabaseBrowser().auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw error;
  return data.session;
}
