import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { browserClient } from "../lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import type { AccountsRow } from "../lib/types";
import { showErrorToast } from "./useToast";

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  account: AccountsRow | null;
  /** True while the account row is being fetched after a fresh session. */
  accountLoading: boolean;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  loading: true,
  session: null,
  user: null,
  account: null,
  accountLoading: false,
  signOut: async () => {},
  refreshAccount: async () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Derive user id + access token without React for non-component callers. */
export async function currentAccessToken(): Promise<string | undefined> {
  const { data } = await browserClient().auth.getSession();
  return data.session?.access_token;
}

export async function currentUserId(): Promise<string | undefined> {
  const { data } = await browserClient().auth.getSession();
  return data.session?.user.id;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<AccountsRow | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);

  const supabase = browserClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session?.user.id) {
      setAccount(null);
      return;
    }
    setAccountLoading(true);
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("accounts")
          .select("id,tier,billing_anchor_date,billing_status,quiet_hours_start,quiet_hours_end,max_messages_per_candidate_per_day,created_at")
          .eq("id", session.user.id)
          .maybeSingle();
        if (error) {
          showErrorToast(error);
          setAccount(null);
        } else {
          setAccount(data as AccountsRow | null);
        }
      } finally {
        setAccountLoading(false);
      }
    };
    void load();
  }, [session?.user.id, supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAccount(null);
  };

  const refreshAccount = async () => {
    if (!session?.user.id) return;
    setAccountLoading(true);
    try {
      const { data } = await supabase
        .from("accounts")
        .select("id,tier,billing_anchor_date,billing_status,quiet_hours_start,quiet_hours_end,max_messages_per_candidate_per_day,created_at")
        .eq("id", session.user.id)
        .maybeSingle();
      setAccount((data as AccountsRow | null) ?? null);
    } finally {
      setAccountLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        account,
        accountLoading,
        signOut,
        refreshAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}