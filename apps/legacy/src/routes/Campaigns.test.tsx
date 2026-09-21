import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { browserClient } from "../lib/supabase";
import { CampaignsPage } from "./Campaigns";

vi.mock("../lib/supabase", () => ({
  browserClient: vi.fn(),
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const CAMPAIGNS = [
  {
    id: "c1",
    name: "AI Automation Intern",
    jd_text: "We are hiring an engineering intern…",
    number_of_rounds: 3,
    status: "on",
    created_at: "2026-09-01T10:00:00.000Z",
  },
  {
    id: "c2",
    name: "Design Lead",
    jd_text: null,
    number_of_rounds: 1,
    status: "off",
    created_at: "2026-09-05T10:00:00.000Z",
  },
] as never;

function mockDatabase(campaigns: unknown[], candidates: { campaign_id: string }[]) {
  const from = vi.fn((table: string) => ({
    select: vi.fn(() =>
      table === "campaigns"
        ? { order: () => Promise.resolve({ data: campaigns, error: null }) }
        : Promise.resolve({ data: candidates, error: null })
    ),
  }));
  vi.mocked(browserClient).mockReturnValue({ from } as never);
}

describe("Campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders each campaign with a link to its detail page", async () => {
    mockDatabase(CAMPAIGNS, [{ campaign_id: "c1" }]);
    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>
    );

    const anchor = () =>
      screen
        .getAllByRole("link", { name: /AI Automation Intern/i })
        .find((el) => el.tagName === "A");
    await waitFor(() => expect(anchor()).toBeTruthy());
    expect(anchor()).toHaveAttribute("href", "/campaigns/c1");
    expect(
      screen
        .getAllByRole("link", { name: /Design Lead/i })
        .find((el) => el.tagName === "A")
    ).toHaveAttribute("href", "/campaigns/c2");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("offers a path to create a first campaign when the list is empty", async () => {
    mockDatabase([], []);
    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>
    );

    const title = await screen.findByText("No campaigns yet");
    expect(title).toBeInTheDocument();
    const create = screen.getAllByRole("link", { name: /create campaign/i });
    const newButton = screen.getByRole("link", { name: /new campaign/i });
    expect(create.length).toBeGreaterThan(0);
    expect(newButton).toHaveAttribute("href", "/campaigns/new");
  });
});