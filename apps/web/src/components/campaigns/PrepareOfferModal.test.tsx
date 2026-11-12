import type { CampaignsRow } from "@scalepods/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrepareOfferModal } from "./PrepareOfferModal";

vi.mock("@/features/account/hooks", () => ({
  useAccount: () => ({
    account: {
      id: "acc-1",
      tier: "growth",
      company_name: "ScalePods Labs",
      name: "Manish",
    },
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  accessToken: vi.fn().mockResolvedValue("test-token"),
  supabaseBrowser: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "acc-1" } } }) },
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
}));

vi.mock("@/components/shared/TierLimitToast", () => ({
  showToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

const mockCampaign = {
  id: "camp-1",
  name: "AI Automation Intern",
  salary_min: 15000,
  salary_currency: "INR",
  location: "Remote",
} as unknown as CampaignsRow;

const mockCandidate = {
  application_id: "app-1",
  candidate_id: "cand-1",
  name: "Aqib Khan",
  email: "aqib@example.com",
  status: "offer_ready",
  current_stage: "offer",
} as never;

describe("PrepareOfferModal (3-step flow)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads company template, auto-fills DB fields, previews rendered letter, and sends", async () => {
    let sentPayload: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/offer-templates") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              templates: [
                {
                  id: "tpl-1",
                  name: "Intern Offer Template",
                  file_name: "intern_offer.docx",
                  storage_path: "acc-1/intern_offer.docx",
                  raw_text:
                    "Dear {{CANDIDATE_NAME}},\nRole: {{POSITION_TITLE}}\nDept: {{DEPARTMENT}}\nSalary: {{CURRENCY}} {{SALARY}}",
                  variables: ["DEPARTMENT"],
                  is_default: true,
                },
              ],
            }),
          });
        }
        if (url === "/api/offers/send") {
          sentPayload = JSON.parse(init?.body as string);
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, offer: { id: "offer-1" } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    const onComplete = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <PrepareOfferModal
        open={true}
        onOpenChange={onOpenChange}
        candidate={mockCandidate}
        campaign={mockCampaign}
        recruiterEmail="hr@scalepods.tech"
        onComplete={onComplete}
      />,
    );

    // Step 1: Template loaded
    await waitFor(() => {
      expect(screen.getByText("Intern Offer Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Next: Fill Variables/i }));

    // Step 2: DB fields auto-filled + custom variable rendered
    expect(screen.getByDisplayValue("Aqib Khan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("AI Automation Intern")).toBeInTheDocument();
    expect(screen.getByDisplayValue("15000")).toBeInTheDocument();
    expect(screen.getByLabelText("Department")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "AI Research" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next: Preview Offer/i }));

    // Step 3: Preview rendered letter
    const previewTextarea = await screen.findByDisplayValue(/Dear Aqib Khan,/);
    expect((previewTextarea as HTMLTextAreaElement).value).toContain("Dept: AI Research");
    expect((previewTextarea as HTMLTextAreaElement).value).toContain("Salary: INR 15000");

    fireEvent.click(screen.getByRole("button", { name: /Confirm & Send Offer/i }));

    await waitFor(() => {
      expect(sentPayload).not.toBeNull();
    });

    expect(sentPayload).toMatchObject({
      campaign_id: "camp-1",
      application_id: "app-1",
      offer_template_id: "tpl-1",
      rendered_text: expect.stringContaining("Dept: AI Research"),
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it("does not show a default ScalePods template and disables Next until a template is uploaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ templates: [] }),
      }),
    );

    render(
      <PrepareOfferModal
        open={true}
        onOpenChange={vi.fn()}
        candidate={mockCandidate}
        campaign={mockCampaign}
        recruiterEmail="hr@scalepods.tech"
        onComplete={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No uploaded offer templates yet")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Standard ScalePods Offer Letter/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next: Fill Variables/i })).toBeDisabled();
  });

  it("allows deleting a saved template directly from Step 1", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/offer-templates" && (!init?.method || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            templates: [
              {
                id: "tpl-del-1",
                name: "Old Offer Template",
                file_name: "old_offer.pdf",
                storage_path: "acc-1/old_offer.pdf",
                raw_text: "Dear {{CANDIDATE_NAME}}",
                variables: [],
                is_default: true,
              },
            ],
          }),
        });
      }
      if (url.startsWith("/api/offer-templates?id=tpl-del-1") && init?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <PrepareOfferModal
        open={true}
        onOpenChange={vi.fn()}
        candidate={mockCandidate}
        campaign={mockCampaign}
        recruiterEmail="hr@scalepods.tech"
        onComplete={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Old Offer Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Old Offer Template" }));

    await waitFor(() => {
      expect(screen.queryByText("Old Offer Template")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No uploaded offer templates yet")).toBeInTheDocument();
  });
});
