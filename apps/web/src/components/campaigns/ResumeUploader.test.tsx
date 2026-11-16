import type { CampaignsRow } from "@scalepods/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeUploader } from "./ResumeUploader";

const mockOnComplete = vi.fn();
const mockShowToast = vi.fn();
const mockShowErrorToast = vi.fn();

vi.mock("@/components/shared/TierLimitToast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
  showErrorToast: (...args: unknown[]) => mockShowErrorToast(...args),
}));

vi.mock("@/lib/extract-text", () => ({
  extractTextFromFile: vi.fn().mockResolvedValue({ text: "Extracted candidate resume content" }),
}));

vi.mock("@/lib/parse-resume", () => ({
  normalizePhoneNumber: vi.fn((phone: string) => phone),
  parseResumeContact: vi.fn().mockResolvedValue({
    name: "Jane Doe",
    email: "jane.doe@example.com",
    phone: "+1234567890",
  }),
}));

const mockStorageUpload = vi.fn().mockResolvedValue({ error: null });
const mockStorageRemove = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    storage: {
      from: () => ({
        upload: mockStorageUpload,
        remove: mockStorageRemove,
      }),
    },
  }),
}));

const mockCampaign = {
  id: "camp-123",
  account_id: "acc-123",
  name: "Frontend Engineer",
  jd_text: "Seeking React & TypeScript developer",
  status: "open" as const,
  number_of_rounds: 3,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  department: "Engineering",
  location: "Remote",
  openings: 1,
  hired_count: 0,
} as unknown as CampaignsRow;

describe("ResumeUploader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("automatically removes candidate from upload card once added to kanban board", async () => {
    const user = userEvent.setup();

    // Mock fetch for /api/applications/intake returning success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "app-1" }),
    } as unknown as Response);

    render(
      <ResumeUploader
        campaign={mockCampaign}
        accountId="acc-123"
        accessToken="mock-token"
        onComplete={mockOnComplete}
      />,
    );

    const file = new File(["dummy content"], "janedoe.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(fileInput, file);

    // Wait for the extracted contact info to appear in inputs
    await waitFor(() => {
      expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
      expect(screen.getByDisplayValue("jane.doe@example.com")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /Add 1 candidate/i });
    await user.click(addButton);

    // Verify onComplete was called (which puts candidate on kanban board)
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    // Verify candidate is automatically removed from the upload card
    await waitFor(
      () => {
        expect(screen.queryByDisplayValue("Jane Doe")).not.toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    expect(mockShowToast).toHaveBeenCalledWith("1 candidate added to hiring pipeline", {
      kind: "success",
    });
  });

  it("keeps candidate in upload card when intake fails with duplicate error", async () => {
    const user = userEvent.setup();

    // Mock fetch returning 409 duplicate
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: "Candidate already added to this campaign",
          code: "candidate_already_uploaded",
        }),
    } as unknown as Response);

    render(
      <ResumeUploader
        campaign={mockCampaign}
        accountId="acc-123"
        accessToken="mock-token"
        onComplete={mockOnComplete}
      />,
    );

    const file = new File(["dummy content"], "janedoe.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /Add 1 candidate/i });
    await user.click(addButton);

    // Wait for the error note to show
    await waitFor(() => {
      expect(
        screen.getAllByText("Candidate already added to this campaign").length,
      ).toBeGreaterThanOrEqual(1);
    });

    // The candidate MUST stay in the upload card so the recruiter can address it
    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });
});
