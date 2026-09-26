import { StrictMode, useEffect, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { supabase } from "./supabase";
import "./style.css";

// Extend window type for the global root
declare global {
  interface Window {
    __reactRoot?: Root;
  }
}

function AuthGate() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    // Safety timeout to prevent permanent loading if getSession() hangs
    const timeout = setTimeout(() => {
      setSession(prev => prev === null ? false : prev);
    }, 3000);

    supabase.auth.getSession().then(({ data: { session: s }, error: sessionError }) => {
      clearTimeout(timeout);
      if (sessionError) {
        console.error("Auth error:", sessionError);
        setSession(false);
        return;
      }
      
      const loggedIn = !!s;
      setSession(loggedIn);
      if (loggedIn) {
        document.body.classList.add('logged-in');
      }
    });

    // Only listen for explicit sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _s) => {
      if (event === 'SIGNED_OUT') {
        setSession(false);
        document.body.classList.remove('logged-in');
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Loading — show spinner while getSession() resolves
  if (session === null) {
    return (
      <div className="login-overlay active-loading">
        <div className="login-loader" />
        <div className="login-loader-text" style={{ marginTop: '12px', color: '#94a3b8' }}>Establishing secure connection...</div>
      </div>
    );
  }

  // Logged in — render nothing, dashboard visible via body.logged-in CSS
  if (session) return null;

  // Not logged in — our static HTML landing page in index.html is visible.
  // We return null here to avoid rendering a duplicate React-based landing page.
  return null;
}

const container = document.getElementById("react-root");
if (container) {
  if (!window.__reactRoot) {
    window.__reactRoot = createRoot(container);
  }
  window.__reactRoot.render(
    <StrictMode>
      <AuthGate />
    </StrictMode>
  );
}
