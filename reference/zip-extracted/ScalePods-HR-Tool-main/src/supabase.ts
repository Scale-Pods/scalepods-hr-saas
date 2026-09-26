import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://zqoafwrkkquicemuwfkb.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseAnonKey) {
  console.warn("Supabase Anon Key is missing. Check your Vercel Environment Variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey || "placeholder", {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
