import { DEFAULT_DIALNEXA_CONFIG } from "@scalepods/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { DialnexaConfigEditor } from "./DialnexaConfigEditor";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("DialnexaConfigEditor", () => {
  it("renders guided voice call setup without any Advanced Studio option", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Frontend Engineer"
      />,
    );

    // Header and status badges
    expect(screen.getByText("DialNexa Voice AI Agent")).toBeInTheDocument();
    expect(screen.getByText("Live Automated Outbound")).toBeInTheDocument();

    // Advanced mode / toggle must not exist
    expect(screen.queryByText(/Advanced Studio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Simple Recruiter Setup/i)).not.toBeInTheDocument();
    expect(screen.queryByText("1. Voice & Audio")).not.toBeInTheDocument();

    // Check 3 fixed call types
    expect(screen.getByText("Choose Call Type")).toBeInTheDocument();
    expect(screen.getByText("Technical Screening")).toBeInTheDocument();
    expect(screen.getByText("General Screening")).toBeInTheDocument();
    expect(screen.getByText("Cultural Fit")).toBeInTheDocument();

    // Check voice picker section
    expect(screen.getByText("Choose AI Voice")).toBeInTheDocument();
    expect(screen.getByText("Aditi")).toBeInTheDocument();
    expect(screen.getByText("Rohan")).toBeInTheDocument();
    expect(screen.getAllByText("Rachel").length).toBeGreaterThanOrEqual(1);

    // Check topics section
    expect(screen.getByText("Discussion Topics")).toBeInTheDocument();

    // Check test call
    expect(screen.getByText("Test Call")).toBeInTheDocument();
    expect(screen.getByText("Test Call Now")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Candidate Name (e.g. Alex Morgan)")).toBeInTheDocument();
  });

  it("selecting a call type updates the fixed predefined configuration", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Senior Fullstack Dev"
      />,
    );

    // Click Technical Screening
    const techBtn = screen.getByText("Technical Screening");
    fireEvent.click(techBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        max_duration_seconds: 600,
        response_eagerness: 0.1,
        responsiveness: 0.85,
        interruption_sensitivity: 0.4,
        transcriber_id: "trs_deepgram_nova_2",
        prompt: expect.stringContaining("Senior Fullstack Dev"),
      }),
    );

    // Click Cultural Fit
    const cultureBtn = screen.getByText("Cultural Fit");
    fireEvent.click(cultureBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        max_duration_seconds: 480,
        response_eagerness: 0.1,
        prompt: expect.stringContaining("cultural fit"),
      }),
    );
  });

  it("allows recruiter to pick an AI voice in simple setup", () => {
    const onChange = vi.fn();
    render(<DialnexaConfigEditor value={DEFAULT_DIALNEXA_CONFIG} onChange={onChange} />);

    const aditiVoice = screen.getByText("Aditi");
    fireEvent.click(aditiVoice);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: "aditi",
      }),
    );
  });

  it("allows previewing and stopping an AI voice sample", () => {
    const onChange = vi.fn();
    const pauseMock = vi.fn();
    const playMock = vi.fn().mockResolvedValue(undefined);
    const audioConstructorSpy = vi.fn();
    class MockAudio {
      play = playMock;
      pause = pauseMock;
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(src?: string) {
        audioConstructorSpy(src);
      }
    }
    vi.stubGlobal("Audio", MockAudio);

    render(<DialnexaConfigEditor value={DEFAULT_DIALNEXA_CONFIG} onChange={onChange} />);

    const previewBtn = screen.getByRole("button", { name: "Preview Aditi" });
    fireEvent.click(previewBtn);

    expect(audioConstructorSpy).toHaveBeenCalled();
    expect(playMock).toHaveBeenCalled();

    const stopBtn = screen.getByRole("button", { name: "Stop Aditi" });
    fireEvent.click(stopBtn);

    expect(pauseMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Preview Aditi" })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("allows adding a new discussion topic and updates the prompt", () => {
    const onChange = vi.fn();
    render(<DialnexaConfigEditor value={DEFAULT_DIALNEXA_CONFIG} onChange={onChange} />);

    const topicInput = screen.getByPlaceholderText(/Type a new topic and press Enter/);
    fireEvent.change(topicInput, {
      target: { value: "Experience leading distributed remote teams" },
    });

    const addBtn = screen.getByRole("button", { name: "Add" });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Experience leading distributed remote teams"),
      }),
    );
  });

  it("triggers toast error instead of showing raw 'error in workflow' on test call failure", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "There was an error in the workflow.",
        }),
      }),
    );

    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Engineering Lead"
      />,
    );

    // Enter valid phone number
    const phoneInput = screen.getByPlaceholderText("+91 98765 43210");
    fireEvent.change(phoneInput, { target: { value: "+919876543210" } });

    const testCallBtn = screen.getByText("Test Call Now");
    fireEvent.click(testCallBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Workflow execution failed. Please verify your phone number and agent settings, then try again.",
      );
    });

    // Verify the UI does NOT render a raw "error in workflow" error message
    expect(screen.queryByText(/There was an error in the workflow/i)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("sends custom candidate name entered in the quick test call bar", async () => {
    const onChange = vi.fn();
    let capturedBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.body) {
          capturedBody = JSON.parse(init.body as string);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            call_id: "test_call_custom_name_123",
          }),
        });
      }),
    );

    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Senior Developer"
      />,
    );

    // Change Candidate Name in the test call section
    const nameInput = screen.getByPlaceholderText("Candidate Name (e.g. Alex Morgan)");
    fireEvent.change(nameInput, { target: { value: "Sarah Connor" } });

    // Enter phone number
    const phoneInput = screen.getByPlaceholderText("+91 98765 43210");
    fireEvent.change(phoneInput, { target: { value: "+919876543210" } });

    const testCallBtn = screen.getByText("Test Call Now");
    fireEvent.click(testCallBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    expect(capturedBody).toMatchObject({
      candidate_name: "Sarah Connor",
      phone_number: "+919876543210",
    });

    vi.unstubAllGlobals();
  });
});
