import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignsPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/account/hooks", () => ({
  useAccount: () => ({
    account: { id: "acc_1", tier: "pro" },
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "mock-token" } },
      }),
    },
  }),
}));

const mockCampaigns = [
  {
    id: "camp_1",
    account_id: "acc_1",
    name: "Full Stack Lead",
    jd_text: "React and Node.js",
    status: "on",
    number_of_rounds: 2,
    candidates: 5,
    created_at: "2026-09-30T10:00:00Z",
  },
  {
    id: "camp_2",
    account_id: "acc_1",
    name: "DevOps Engineer",
    jd_text: "Kubernetes and AWS",
    status: "on",
    number_of_rounds: 3,
    candidates: 2,
    created_at: "2026-09-29T10:00:00Z",
  },
];

const mockDeleteCampaign = vi.fn().mockResolvedValue(undefined);
const mockUpdateCampaignStatus = vi.fn().mockResolvedValue(undefined);
vi.mock("@/features/campaigns/api", () => ({
  deleteCampaign: (...args: unknown[]) => mockDeleteCampaign(...args),
  updateCampaignStatus: (...args: unknown[]) => mockUpdateCampaignStatus(...args),
}));

vi.mock("@/features/campaigns/hooks", () => ({
  useCampaigns: () => ({
    data: mockCampaigns,
    isPending: false,
    refetch: vi.fn(),
    isRefetching: false,
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CampaignsPage List and Delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays campaigns with active/paused status switch controls and filters", async () => {
    renderWithClient(<CampaignsPage />);

    expect(screen.getByText("Full Stack Lead")).toBeInTheDocument();
    expect(screen.getByText("DevOps Engineer")).toBeInTheDocument();

    // Active switches exist
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(2);

    // Toggle switch can be clicked
    fireEvent.click(switches[0]);
    await waitFor(() => {
      expect(mockUpdateCampaignStatus).toHaveBeenCalledWith(
        "camp_1",
        "paused",
        "acc_1",
        "mock-token",
      );
    });
  });

  it("provides delete button and confirmation dialog on campaign card", () => {
    renderWithClient(<CampaignsPage />);

    const deleteButtons = screen.getAllByTitle("Delete campaign");
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);

    // Click delete on first campaign
    fireEvent.click(deleteButtons[0]);

    // Confirmation dialog opens
    expect(
      screen.getByText(/Are you sure you want to delete “Full Stack Lead”?/i),
    ).toBeInTheDocument();

    // Cancel closes dialog
    const cancelBtn = screen.getByRole("button", { name: /^Cancel$/i });
    fireEvent.click(cancelBtn);
  });
});
