import { useState, useEffect } from "react";
import { supabase } from "@/supabase";
import { CheckCircle2, Lock, KeyRound, Loader2, ArrowLeft, Mail, Send, ChevronRight } from "lucide-react";

export function ResetPasswordPage() {
  const [view, setView] = useState<"loading" | "request" | "reset" | "success">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Listen for the recovery event which is triggered by clicking the email link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setView("reset");
      }
    });

    // Check session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setView("reset");
      } else {
        // If no session and not a recovery event, show the request form
        // But wait a small beat to let onAuthStateChange trigger if it's a redirect landing
        setTimeout(() => {
          setView(prev => prev === "loading" ? "request" : prev);
        }, 800);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Check your inbox. We've sent a recovery link to " + email);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError("");

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userEmail = userData?.user?.email;
      if (userEmail) {
        await supabase.rpc("sync_password_hash", {
          p_email: userEmail,
          p_password: password,
        });
      }
    } catch (err) {
      console.error("Sync error:", err);
    }

    setLoading(false);
    setView("success");
    
    setTimeout(() => {
      window.location.href = "/";
    }, 3000);
  };

  return (
    <div className="reset-page-container">
      <div className="reset-page-bg">
        <div className="reset-blob blob-1"></div>
        <div className="reset-blob blob-2"></div>
      </div>

      <div className="reset-content">
        <header className="reset-header">
          <div className="reset-brand" onClick={() => window.location.href = "/"}>
            <img
              src="https://www.scalepods.co/_next/image?url=%2Fscalepods-navbar-logo.png&w=256&q=75&dpl=dpl_DX4go8Z4Sy3vBkyqLBb8kxYXVNrc"
              alt="ScalePods"
              className="reset-logo-img"
            />
          </div>
          <button className="reset-back-btn" onClick={() => window.location.href = "/"}>
            <ArrowLeft size={16} />
            Back to Home
          </button>
        </header>

        <main className="reset-main">
          {view === "loading" && (
            <div className="reset-view-box centered">
              <Loader2 className="reset-spinner large" />
              <p className="reset-loading-text">Preparing security gateway...</p>
            </div>
          )}

          {view === "request" && (
            <div className="reset-view-box">
              <h1 className="reset-title">Restoration</h1>
              <p className="reset-desc">
                Recover access to your ScalePods account. Enter your registered email to receive a secure link.
              </p>

              <form onSubmit={handleRequestLink} className="reset-form">
                <div className="reset-field">
                  <label>Work Email</label>
                  <div className="reset-input-container">
                    <Mail className="reset-input-icon" size={18} />
                    <input
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && <div className="reset-msg error">{error}</div>}
                {message && (
                  <div className="reset-msg success">
                    <Send size={16} className="reset-msg-icon" />
                    <span>{message}</span>
                  </div>
                )}

                <button type="submit" className="reset-submit-btn" disabled={loading || !!message}>
                  {loading ? <Loader2 className="btn-spinner" /> : null}
                  {loading ? "Sending..." : "Request Reset Link"}
                  {!loading && !message && <ChevronRight size={18} className="btn-arrow" />}
                </button>
              </form>
            </div>
          )}

          {view === "reset" && (
            <div className="reset-view-box">
              <h1 className="reset-title">New Credentials</h1>
              <p className="reset-desc">
                Your identity has been verified. Please choose a strong new password for your account.
              </p>

              <form onSubmit={handleReset} className="reset-form">
                <div className="reset-field">
                  <label>New Password</label>
                  <div className="reset-input-container">
                    <Lock className="reset-input-icon" size={18} />
                    <input
                      type="password"
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="reset-field">
                  <label>Confirm Password</label>
                  <div className="reset-input-container">
                    <KeyRound className="reset-input-icon" size={18} />
                    <input
                      type="password"
                      placeholder="Repeat password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                {error && <div className="reset-msg error">{error}</div>}

                <button type="submit" className="reset-submit-btn alternate" disabled={loading}>
                  {loading ? <Loader2 className="btn-spinner" /> : null}
                  {loading ? "Updating..." : "Secure Account"}
                  {!loading && <ChevronRight size={18} className="btn-arrow" />}
                </button>
              </form>
            </div>
          )}

          {view === "success" && (
            <div className="reset-view-box centered">
              <div className="reset-success-ring">
                <CheckCircle2 size={48} className="reset-success-icon" />
              </div>
              <h1 className="reset-title">Account Secured</h1>
              <p className="reset-desc centered">
                Your password has been successfully updated. Redirecting you to the dashboard...
              </p>
              <div className="reset-progress-bar">
                <div className="reset-progress-fill"></div>
              </div>
            </div>
          )}
        </main>

        <footer className="reset-footer">
          <p>&copy; {new Date().getFullYear()} ScalePods Inc. High Performance Hiring.</p>
        </footer>
      </div>
    </div>
  );
}
