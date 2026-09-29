import { DEFAULT_DIALNEXA_CONFIG } from "@scalepods/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DialnexaConfigEditor } from "./DialnexaConfigEditor";

describe("DialnexaConfigEditor", () => {
  it("renders with default values and shows active badges", () => {
    const onChange = vi.fn();
    render(
      <DialnexaConfigEditor
        value={DEFAULT_DIALNEXA_CONFIG}
        onChange={onChange}
        jobTitle="Product Manager"
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
    render(<DialnexaConfigEditor value={DEFAULT_DIALNEXA_CONFIG} onChange={onChange} />);

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
    render(<DialnexaConfigEditor value={DEFAULT_DIALNEXA_CONFIG} onChange={onChange} />);

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
    render(<DialnexaConfigEditor value={DEFAULT_DIALNEXA_CONFIG} onChange={onChange} />);

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
    render(<DialnexaConfigEditor value={DEFAULT_DIALNEXA_CONFIG} onChange={onChange} />);

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
});
