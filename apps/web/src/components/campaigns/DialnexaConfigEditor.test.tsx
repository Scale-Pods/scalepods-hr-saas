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
});
