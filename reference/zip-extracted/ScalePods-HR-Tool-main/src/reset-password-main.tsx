import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ResetPasswordPage } from "@/components/ui/reset-password-page";

createRoot(document.getElementById("reset-root")!).render(
  <StrictMode>
    <ResetPasswordPage />
  </StrictMode>
);
