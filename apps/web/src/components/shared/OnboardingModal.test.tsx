import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingModal } from "./OnboardingModal";

const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    from: () => ({
      update: (args: Record<string, unknown>) => {
        mockUpdate(args);
        return {
          eq: (field: string, val: string) => {
            mockEq(field, val);
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
  }),
}));

vi.mock("@/features/auth/hooks", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "usr_123",
        email: "test@example.com",
        user_metadata: {
          full_name: "Initial Name",
        },
      },
    },
  }),
}));

vi.mock("@/components/shared/TierLimitToast", () => ({
  showToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

describe("OnboardingModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders when open and pre-fills name from metadata", () => {
    render(<OnboardingModal open={true} onComplete={vi.fn()} />);

    expect(screen.getByText("Welcome to ScalePods")).toBeDefined();
    expect(screen.getByLabelText(/Your full name/i)).toBeDefined();
    expect(screen.getByLabelText(/Company name/i)).toBeDefined();

    const nameInput = screen.getByLabelText(/Your full name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Initial Name");
  });

  it("submits company name and user name to accounts table", async () => {
    const mockOnComplete = vi.fn();
    render(<OnboardingModal open={true} onComplete={mockOnComplete} />);

    const companyInput = screen.getByLabelText(/Company name/i);
    fireEvent.change(companyInput, { target: { value: "ScalePods Inc" } });

    const submitBtn = screen.getByRole("button", { name: /get started/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        name: "Initial Name",
        company_name: "ScalePods Inc",
      });
      expect(mockEq).toHaveBeenCalledWith("id", "usr_123");
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });
});
