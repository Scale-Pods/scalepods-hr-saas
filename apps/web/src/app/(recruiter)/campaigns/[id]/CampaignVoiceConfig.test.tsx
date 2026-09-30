import { DEFAULT_DIALNEXA_CONFIG } from "@scalepods/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "camp_123" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/features/account/hooks", () => ({
  useAccount: () => ({
    account: { id: "acc_1", tier: "pro", billing_status: "active" },
  }),
}));

vi.mock("@/features/auth/hooks", () => ({
  useSession: () => ({
    session: { access_token: "mock-token" },
  }),
}));

const mockCampaignDetail = {
  campaign: {
    id: "camp_123",
    name: "Senior Platform Architect",
    jd_text: "Building distributed systems",
    status: "on",
    number_of_rounds: 1,
    voice_call_config: null,
  },
  rounds: [
    {
      id: "rnd_1",
      round_number: 1,
      round_type: "ai_interview",
      cutoff_score: 70,
    },
  ],
  candidates: [],
  roundStatuses: {},
};

let currentDetailData: typeof mockCampaignDetail | null = mockCampaignDetail;

vi.mock("@/features/campaigns/hooks", () => ({
  useCampaignDetail: () => ({
    data: currentDetailData,
    isPending: false,
    isError: false,
  }),
  useToggleCampaignStatus: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    from: () => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }),
}));

vi.mock("@/lib/webhooks", () => ({
  callWorkflow: vi.fn().mockResolvedValue({ success: true }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CampaignDetailPage Voice Agent Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays Voice Agent Not Configured when campaign was launched without voice screening", () => {
    currentDetailData = {
      ...mockCampaignDetail,
      campaign: {
        ...mockCampaignDetail.campaign,
        voice_call_config: null,
      },
    };

    renderWithClient(<CampaignDetailPage />);

    expect(screen.getByText("Voice Agent Not Configured")).toBeInTheDocument();
    expect(
      screen.getByText(/Voice agent configuration is only available while creating the campaign/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Configuration/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Configure Voice Agent/i }),
    ).not.toBeInTheDocument();
  });

  it(
    "displays Custom Agent Configured with Edit Configuration option and previous data when voice was configured at creation",
    () => {
    currentDetailData = {
      ...mockCampaignDetail,
      campaign: {
        ...mockCampaignDetail.campaign,
        voice_call_config: {
          ...DEFAULT_DIALNEXA_CONFIG,
          voice: "sarah",
          prompt: "Custom previous prompt text for senior platform architect screening",
          first_message: "Hello, this is ScalePods calling for the Platform Architect role.",
          response_eagerness: 0.85,
        } as unknown as null,
      },
    };

    renderWithClient(<CampaignDetailPage />);

    expect(screen.getByText("Custom Agent Configured")).toBeInTheDocument();
    expect(
      screen.getByText("“Hello, this is ScalePods calling for the Platform Architect role.”"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Custom previous prompt text for senior platform architect screening"),
    ).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: /Edit Configuration/i });
    expect(editBtn).toBeInTheDocument();

    // Clicking Edit Configuration switches into edit mode showing all previous data and action buttons
    fireEvent.click(editBtn);

    expect(
      screen.getByText(/Editing Voice Agent Configuration — all previous settings loaded below/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Configuration/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument();

    // Clicking Cancel restores view mode
    const cancelBtn = screen.getByRole("button", { name: /Cancel Edit/i });
    fireEvent.click(cancelBtn);
    expect(screen.getByRole("button", { name: /Edit Configuration/i })).toBeInTheDocument();
  }, 15000);

  it("provides active/deactive status switch and allows toggling status", () => {
    currentDetailData = mockCampaignDetail;
    renderWithClient(<CampaignDetailPage />);

    // Shows Active badge and switch
    expect(screen.getByText("Active")).toBeInTheDocument();

    const statusSwitch = screen.getByRole("switch", { name: /Campaign status/i });
    expect(statusSwitch).toBeInTheDocument();
    expect(statusSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(statusSwitch);
  });

  it("provides an option to delete the campaign with confirmation", () => {
    currentDetailData = mockCampaignDetail;
    renderWithClient(<CampaignDetailPage />);

    const deleteBtn = screen.getByRole("button", { name: /Delete Campaign/i });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);

    // Confirmation dialog appears
    expect(
      screen.getByText(/Are you sure you want to delete “Senior Platform Architect”?/i),
    ).toBeInTheDocument();

    // Cancel button in dialog closes it
    const cancelDeleteBtn = screen.getByRole("button", { name: /^Cancel$/i });
    expect(cancelDeleteBtn).toBeInTheDocument();
    fireEvent.click(cancelDeleteBtn);
  });
});
