import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RescheduleCalendar } from "@/components/ui/reschedule-calendar";

let rescheduleRoot: Root | null = null;
const rescheduleRootEl = document.getElementById("reschedule-root");

interface RescheduleParams {
  eventId: string;
  email: string;
  candidate?: string;
}

declare global {
  interface Window {
    openRescheduleModal: (params: RescheduleParams) => void;
    closeRescheduleModal: () => void;
    loadMeetingsPage: () => void;
  }
}

console.log("Reschedule integration module loaded");

window.openRescheduleModal = (params: RescheduleParams) => {
  console.log("Opening reschedule modal with params:", params);
  const modal = document.getElementById("reschedule-modal");
  const overlay = document.getElementById("reschedule-overlay");

  if (modal && overlay && rescheduleRootEl) {
    if (!rescheduleRoot) {
      rescheduleRoot = createRoot(rescheduleRootEl);
    }
    
    rescheduleRoot.render(
      <StrictMode>
        <RescheduleCalendar 
          eventId={params.eventId} 
          email={params.email} 
          candidate={params.candidate}
          onSuccess={() => {
            window.closeRescheduleModal();
            if (window.loadMeetingsPage) window.loadMeetingsPage();
          }}
          onCancel={() => window.closeRescheduleModal()}
        />
      </StrictMode>
    );

    overlay.classList.add("open");
    modal.style.display = "block";
    requestAnimationFrame(() => {
      modal.classList.add("open");
    });
  }
};

window.closeRescheduleModal = () => {
  const modal = document.getElementById("reschedule-modal");
  const overlay = document.getElementById("reschedule-overlay");

  if (modal && overlay) {
    modal.classList.remove("open");
    overlay.classList.remove("open");
    setTimeout(() => {
      modal.style.display = "none";
    }, 400);
  }
};

