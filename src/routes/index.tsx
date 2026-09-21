import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { AppShell } from "../components/AppShell";

const AuthPage = lazy(() => import("./AuthPage").then((m) => ({ default: m.AuthPage })));
const HomePage = lazy(() => import("./Home").then((m) => ({ default: m.Home })));
const Dashboard = lazy(() => import("./Dashboard").then((m) => ({ default: m.Dashboard })));
const CampaignNewPage = lazy(() => import("./CampaignNew").then((m) => ({ default: m.CampaignNewPage })));
const CampaignsPage = lazy(() => import("./Campaigns").then((m) => ({ default: m.CampaignsPage })));
const CampaignDetailPage = lazy(() => import("./CampaignDetail").then((m) => ({ default: m.CampaignDetailPage })));
const CandidateProfilePage = lazy(() => import("./CandidateProfile").then((m) => ({ default: m.CandidateProfilePage })));
const BillingPage = lazy(() => import("./Billing").then((m) => ({ default: m.BillingPage })));
const SettingsPage = lazy(() => import("./Settings").then((m) => ({ default: m.SettingsPage })));

const BookPage = lazy(() => import("./candidate/Book").then((m) => ({ default: m.BookPage })));
const AssignmentPage = lazy(() => import("./candidate/Assignment").then((m) => ({ default: m.AssignmentPage })));
const InterviewCheckPage = lazy(() => import("./candidate/InterviewCheck").then((m) => ({ default: m.InterviewCheckPage })));
const InterviewConductPage = lazy(() => import("./candidate/InterviewConduct").then((m) => ({ default: m.InterviewConductPage })));
const InterviewThanksPage = lazy(() => import("./candidate/InterviewThanks").then((m) => ({ default: m.InterviewThanksPage })));

function PageFallback({ dark = false }: { dark?: boolean }) {
  return (
    <div className={dark ? "flex min-h-screen items-center justify-center bg-foreground text-sm text-muted-foreground" : "flex min-h-screen items-center justify-center text-sm text-muted-foreground"}>
      Loading…
    </div>
  );
}

function RequireAuth() {
  const { loading, session } = useAuth();
  useEffect(() => {
    document.title = "ScalePods";
  }, []);
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <AppShell />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />

        {/* Candidate-facing pages - no login, accessed via signed links. */}
        <Route path="/book/:round_instance_id" element={<BookPage />} />
        <Route path="/assignment/:round_instance_id" element={<AssignmentPage />} />
        <Route path="/interview/:session_id/check" element={<InterviewCheckPage />} />
        <Route path="/interview/:session_id/conduct" element={<InterviewConductPage />} />
        <Route path="/interview/:session_id/thanks" element={<InterviewThanksPage />} />

        {/* Recruiter-facing pages. */}
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/new" element={<CampaignNewPage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="/candidates/:id" element={<CandidateProfilePage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}