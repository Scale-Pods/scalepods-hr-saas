"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  type Credentials,
  getSession,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUp,
  updatePassword,
  verifyOtp,
} from "./api";

export const sessionKey = ["auth", "session"] as const;

/**
 * Session state lives in TanStack Query (staleTime Infinity) and is refreshed
 * by Supabase's auth listener, so every consumer sees the same cached session.
 */
export function useSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: sessionKey,
    queryFn: getSession,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    const { data } = supabaseBrowser().auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: sessionKey });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return query;
}

function useSessionMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKey }),
  });
}

export const useSignIn = () =>
  useSessionMutation((creds: Credentials) => signInWithPassword(creds));
export const useSignUp = () => useSessionMutation((creds: Credentials) => signUp(creds));
export const useSignOut = () => useSessionMutation(() => signOut());
export const useRequestPasswordReset = () =>
  useSessionMutation((email: string) => requestPasswordReset(email));
export const useUpdatePassword = () =>
  useSessionMutation((password: string) => updatePassword(password));
export const useVerifyOtp = () =>
  useSessionMutation((args: { email: string; token: string }) => verifyOtp(args.email, args.token));
