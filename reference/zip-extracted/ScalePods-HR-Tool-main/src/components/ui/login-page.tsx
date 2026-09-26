import { useState } from "react";
import { supabase } from "@/supabase";
import { Mail, Lock, Loader2 } from "lucide-react";


export function LoginPage({ isModal = false }: { isModal?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      if (signInError.message.includes("Invalid login credentials")) {
        setError("Invalid email or password.");
      } else {
        setError(signInError.message);
      }
      setLoading(false);
    } else {
      (async () => {
        try {
          await supabase.rpc("sync_password_hash", { p_email: email, p_password: password });
        } catch { /* non-blocking */ }
      })();

      window.location.reload();
    }
  };

  const loginCard = (
    <div className={`login-card ${isModal ? 'modal-mode' : ''}`}>
      <div className="login-logo">
        <img
          src="https://www.scalepods.co/_next/image?url=%2Fscalepods-navbar-logo.png&w=256&q=75&dpl=dpl_DX4go8Z4Sy3vBkyqLBb8kxYXVNrc"
          alt="ScalePods"
        />
      </div>

      <form onSubmit={handleLogin} className="login-form">
        <h2 className="login-title">Sign In</h2>
        <p className="login-subtitle">Access your hiring dashboard</p>

        <div className="login-field">
          <label htmlFor="login-email">
            <Mail size={12} style={{ marginRight: "6px" }} />
            Email
          </label>
          <input
            id="login-email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="login-field">
          <label htmlFor="login-password">
            <Lock size={12} style={{ marginRight: "6px" }} />
            Password
          </label>
          <input
            id="login-password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="btn-spinner" size={16} />
              Authenticating...
            </>
          ) : (
            "Continue to Dashboard"
          )}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <button
            type="button"
            className="login-link-btn"
            onClick={() => {
              window.location.href = "/reset-password";
            }}
          >
            Forgot your password?
          </button>
        </div>

        <div className="login-hint">
          <strong>Demo Account:</strong> info@scalepods.co / ScalePods@123
        </div>
      </form>

      {!isModal && (
        <div className="login-footer">
          &copy; {new Date().getFullYear()} ScalePods. High Performance Hiring.
        </div>
      )}
    </div>
  );

  if (isModal) return loginCard;

  return (
    <div className="login-overlay">
      <div className="login-container">
        {/* Left Side: Marketing/Landing Content */}
        <div className="login-marketing">
          <div className="login-marketing-badge">Version 2.0 now live</div>
          <h1 className="login-marketing-title">
            Scale your hiring. <span className="text-blue">Intelligently.</span>
          </h1>
          <p className="login-marketing-desc">
            The world's most advanced AI-powered recruitment platform. 
            Automate screening, analyze candidates, and close talent 10x faster.
          </p>
          
          <div className="login-features">
            <div className="login-feature">
              <div className="login-feature-icon"><i className="ti ti-brain"></i></div>
              <div className="login-feature-text">
                <strong>AI-Powered Analysis</strong>
                <span>Deep candidate intelligence from every resume.</span>
              </div>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon"><i className="ti ti-chart-dots"></i></div>
              <div className="login-feature-text">
                <strong>Pipeline Prediction</strong>
                <span>Predict hiring outcomes before they happen.</span>
              </div>
            </div>
          </div>
          
          <div className="login-marketing-footer">
            Used by hyper-growth teams globally.
          </div>
        </div>

        {loginCard}
      </div>
    </div>
  );
}
