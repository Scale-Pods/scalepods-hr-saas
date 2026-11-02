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
  it("renders with default values and shows active badges", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Product Manager"
        defaultMode="advanced"
      />,
    );

    expect(screen.getByText("DialNexa Voice AI Agent")).toBeInTheDocument();
    expect(screen.queryByText(/Language Model/)).not.toBeInTheDocument();
    expect(screen.getByText(/Synthetic Voice/)).toBeInTheDocument();
    expect(screen.getByText("Agent Greeting (First Spoken Message)")).toBeInTheDocument();
  });

  it("updates prompt when user types", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Software Engineer"
        defaultMode="advanced"
      />,
    );

    const promptTextarea = screen.getByPlaceholderText(
      /Enter system prompt and conversation instructions/,
    );
    fireEvent.change(promptTextarea, { target: { value: "New custom prompt text" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "New custom prompt text",
      }),
    );
  });

  it("applies template when clicked", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="DevOps Architect"
        defaultMode="advanced"
      />,
    );

    const technicalTemplateBtn = screen.getByText("Technical Qualification");
    fireEvent.click(technicalTemplateBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("DevOps Architect"),
      }),
    );
  });

  it("renders voice preview and audition buttons for all available voices", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        defaultMode="advanced"
      />,
    );

    expect(screen.getByText("Sample Voice")).toBeInTheDocument();
    expect(screen.getByText("Audition all voices")).toBeInTheDocument();

    const adamAuditionBtn = screen.getByTitle("Select Adam");
    expect(adamAuditionBtn).toBeInTheDocument();
    fireEvent.click(adamAuditionBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: "adam",
      }),
    );
  });

  it("navigates smoothly across tabs and step buttons", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        defaultMode="advanced"
      />,
    );

    expect(screen.getByText("1. Voice & Audio")).toBeInTheDocument();
    expect(screen.getByText("2. System Prompt")).toBeInTheDocument();
    expect(screen.getByText("3. Opening Greeting")).toBeInTheDocument();
    expect(screen.getByText("All Sections")).toBeInTheDocument();

    const nextToPromptBtn = screen.getByText("Next: System Prompt");
    fireEvent.click(nextToPromptBtn);

    const nextToGreetingBtn = screen.getByText("Next: Opening Greeting");
    expect(nextToGreetingBtn).toBeInTheDocument();
    fireEvent.click(nextToGreetingBtn);

    const backToPromptBtn = screen.getByText("Back: System Prompt");
    expect(backToPromptBtn).toBeInTheDocument();
    fireEvent.click(backToPromptBtn);

    const allSectionsBtn = screen.getByText("All Sections");
    fireEvent.click(allSectionsBtn);
    expect(screen.getByText("Overview mode")).toBeInTheDocument();
  });

  it("updates response eagerness and handles presets", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        defaultMode="advanced"
      />,
    );

    // Click on Eagerness tab
    const eagernessTab = screen.getByText("4. Eagerness & Latency");
    fireEvent.click(eagernessTab);

    expect(screen.getByText("DialNexa Turn-Taking & Response Eagerness")).toBeInTheDocument();

    // Click Ultra-Eager preset
    const eagerPresetBtn = screen.getByText(/Ultra-Eager \(0\.95\)/);
    fireEvent.click(eagerPresetBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        response_eagerness: 0.95,
      }),
    );
  });

  it("toggles agent functions and tools", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        defaultMode="advanced"
      />,
    );

    // Click on Functions tab
    const functionsTab = screen.getByText("5. Functions & Tools");
    fireEvent.click(functionsTab);

    expect(screen.getByText("DialNexa Agent Functions & Live Tools")).toBeInTheDocument();
    expect(screen.getByText(/End Call \(`end_call`\)/)).toBeInTheDocument();
    expect(screen.getByText(/Warm Recruiter Transfer \(`call_transfer`\)/)).toBeInTheDocument();

    // Toggle warm transfer
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(checkboxes[1]);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_functions: expect.any(Array),
      }),
    );
  });

  it("renders live test console and allows switching between simulator and phone test", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Cloud Engineer"
        defaultMode="advanced"
      />,
    );

    // Open Test Console
    const testTab = screen.getByText("7. Live Test Console");
    fireEvent.click(testTab);

    expect(screen.getByText("DialNexa Interactive Agent Testing Console")).toBeInTheDocument();
    expect(screen.getByText("Start Test Conversation")).toBeInTheDocument();

    // Switch to Phone Call Test mode
    const phoneTestBtn = screen.getByText("Live Phone Call Test");
    fireEvent.click(phoneTestBtn);

    expect(screen.getByText("Trigger Live Telephony Call to Your Phone")).toBeInTheDocument();
    expect(screen.getByText("Call My Phone Now")).toBeInTheDocument();
  });

  it("safely handles and displays error object from test call API without crashing React", async () => {
    const onChange = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          message: "Request failed with status code 400",
          name: "AxiosError",
          isAxiosError: true,
          code: "ERR_BAD_REQUEST",
          response: {},
          status: 400,
          options: {},
          statusCode: 400,
        },
      }),
    });

    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Cloud Engineer"
        defaultMode="advanced"
      />,
    );

    // Open Test Console and switch to phone test
    fireEvent.click(screen.getByText("7. Live Test Console"));
    fireEvent.click(screen.getByText("Live Phone Call Test"));

    // Enter phone number
    const phoneInput = screen.getByPlaceholderText("+91 98765 43210");
    fireEvent.change(phoneInput, { target: { value: "+1234567890" } });

    // Click Call My Phone Now
    const callBtn = screen.getByText("Call My Phone Now");
    fireEvent.click(callBtn);

    // Verify error is rendered as text and component does not crash
    expect(await screen.findByText(/Request failed with status code 400/)).toBeInTheDocument();
  });

  it("polls call status and renders recording player and turn-by-turn dialogue transcript", async () => {
    const onChange = vi.fn();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/voice-screen/test-call")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            call_id: "call_test123",
          }),
        });
      }
      if (url.includes("/api/voice-screen/call-status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            call: {
              id: "call_test123",
              duration: 45,
              status: "completed",
              sentiment: "positive",
              recording_url: "https://storage.azure.com/recordings/call_test123.mp3",
              turns: [
                {
                  speaker: "agent",
                  text: "Hello, thank you for speaking with us today.",
                  start: 1.0,
                  end: 4.2,
                },
                {
                  speaker: "candidate",
                  text: "Hi, I am excited to speak about the Cloud Engineer role.",
                  start: 4.8,
                  end: 8.5,
                },
              ],
            },
          }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Cloud Engineer"
        defaultMode="advanced"
      />,
    );

    // Switch to phone test
    fireEvent.click(screen.getByText("7. Live Test Console"));
    fireEvent.click(screen.getByText("Live Phone Call Test"));

    // Enter phone
    const phoneInput = screen.getByPlaceholderText("+91 98765 43210");
    fireEvent.change(phoneInput, { target: { value: "+919876543210" } });

    // Click Call My Phone Now
    const callBtn = screen.getByText("Call My Phone Now");
    fireEvent.click(callBtn);

    // Expect call telemetry, recording player, and transcript turns
    expect(await screen.findByText(/Call Audio Recording/)).toBeInTheDocument();
    expect(await screen.findByText(/Download MP3/)).toBeInTheDocument();
    expect(await screen.findByText(/Turn-by-Turn Dialogue Transcript/)).toBeInTheDocument();
    expect(
      await screen.findByText("Hello, thank you for speaking with us today."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Hi, I am excited to speak about the Cloud Engineer role."),
    ).toBeInTheDocument();
  });

  it("displays and synchronizes all previous data when value prop updates", () => {
    const onChange = vi.fn();
    const customConfig = {
      ...DEFAULT_DIALNEXA_CONFIG,
      voice: "adam",
      prompt: "Previous saved prompt instructions for candidate evaluation",
      first_message: "Welcome candidate to the interview",
      response_eagerness: 0.9,
    };

    const { rerender } = render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Senior Architect"
        defaultMode="advanced"
      />,
    );

    // Click All Sections to show all tabs
    fireEvent.click(screen.getByText("All Sections"));

    const promptTextarea = screen.getByPlaceholderText(
      /Enter system prompt and conversation instructions/,
    );
    expect(promptTextarea).toHaveValue(DEFAULT_DIALNEXA_CONFIG.prompt);

    // Re-render with previous data saved in campaign
    rerender(
      <DialnexaConfigEditor
        value={customConfig}
        onChange={onChange}
        jobTitle="Senior Architect"
        defaultMode="advanced"
      />,
    );

    expect(promptTextarea).toHaveValue(
      "Previous saved prompt instructions for candidate evaluation",
    );
    expect(screen.getByDisplayValue("Welcome candidate to the interview")).toBeInTheDocument();
  });

  describe("Simple Recruiter Setup (Quick Mode)", () => {
    it("renders 3 fixed call types with voice selection and topics by default", () => {
      const onChange = vi.fn();
      render(
        <DialnexaConfigEditor
          value={DEFAULT_DIALNEXA_CONFIG}
          onChange={onChange}
          jobTitle="Frontend Engineer"
        />,
      );

      // Check header and mode toggle
      expect(screen.getByText("✨ Simple Recruiter Setup")).toBeInTheDocument();
      expect(screen.getByText("⚙️ Advanced Studio")).toBeInTheDocument();

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
    });

    it("allows seamlessly toggling between Simple Recruiter Setup and Advanced Studio", () => {
      const onChange = vi.fn();
      render(
        <DialnexaConfigEditor
          value={DEFAULT_DIALNEXA_CONFIG}
          onChange={onChange}
          jobTitle="Backend Lead"
        />,
      );

      // Initially in Simple mode
      expect(screen.queryByText("1. Voice & Audio")).not.toBeInTheDocument();

      // Click to switch to Advanced Studio
      const advancedBtn = screen.getByText("⚙️ Advanced Studio");
      fireEvent.click(advancedBtn);

      // Now Advanced Studio navigation tabs are visible
      expect(screen.getByText("1. Voice & Audio")).toBeInTheDocument();
      expect(screen.getByText("2. System Prompt")).toBeInTheDocument();

      // Click back to Simple Recruiter Setup
      const simpleBtn = screen.getByText("✨ Simple Recruiter Setup");
      fireEvent.click(simpleBtn);

      // Tabs are hidden again, simple call types are back
      expect(screen.queryByText("1. Voice & Audio")).not.toBeInTheDocument();
      expect(screen.getByText("Choose Call Type")).toBeInTheDocument();
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
  });
});
