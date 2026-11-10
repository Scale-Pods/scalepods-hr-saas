import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProctoringOverlay } from "../components/ProctoringOverlay";
import type { ProctoringEvent } from "../types";
import { checkDesktopDevice, checkSingleDisplay } from "./environmentCheck";
import { filterProhibitedDetections } from "./mediapipeObjectDetector";

vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [], error: null }),
      }),
    }),
  }),
}));

describe("checkDesktopDevice", () => {
  const originalUa = navigator.userAgent;
  const originalPlatform = navigator.platform;
  const originalMaxTouch = navigator.maxTouchPoints;
  const originalUaData = (navigator as Navigator & { userAgentData?: unknown }).userAgentData;
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: originalUa,
      configurable: true,
    });
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: originalMaxTouch,
      configurable: true,
    });
    Object.defineProperty(navigator, "userAgentData", {
      value: originalUaData,
      configurable: true,
    });
    Object.defineProperty(window, "matchMedia", {
      value: originalMatchMedia,
      configurable: true,
      writable: true,
    });
  });

  function mockEnvironment(opts: {
    ua: string;
    platform?: string;
    maxTouchPoints?: number;
    uaData?: { mobile?: boolean; platform?: string };
    finePointer?: boolean;
  }) {
    Object.defineProperty(navigator, "userAgent", { value: opts.ua, configurable: true });
    Object.defineProperty(navigator, "platform", {
      value: opts.platform ?? "Win32",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: opts.maxTouchPoints ?? 0,
      configurable: true,
    });
    Object.defineProperty(navigator, "userAgentData", {
      value: opts.uaData,
      configurable: true,
    });
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: query.includes("pointer: fine") ? (opts.finePointer ?? true) : false,
      }),
      configurable: true,
      writable: true,
    });
  }

  it("allows standard desktop Windows/Mac browsers", () => {
    mockEnvironment({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0",
      uaData: { mobile: false, platform: "Windows" },
      finePointer: true,
    });
    expect(checkDesktopDevice()).toEqual({ ok: true, deviceLabel: "Windows", reason: null });
  });

  it("blocks mobile phones via User-Agent", () => {
    mockEnvironment({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      platform: "iPhone",
      maxTouchPoints: 5,
      finePointer: false,
    });
    const res = checkDesktopDevice();
    expect(res.ok).toBe(false);
    expect(res.deviceLabel).toBe("Mobile Device");
  });

  it("blocks mobile devices via userAgentData.mobile", () => {
    mockEnvironment({
      ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0",
      uaData: { mobile: true, platform: "Android" },
    });
    expect(checkDesktopDevice().ok).toBe(false);
  });

  it("blocks iPadOS masquerading as Macintosh when fine pointer is absent", () => {
    mockEnvironment({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
      finePointer: false,
    });
    const res = checkDesktopDevice();
    expect(res.ok).toBe(false);
    expect(res.deviceLabel).toBe("iPad / Tablet");
  });

  it("allows touchscreen laptops that still have a fine primary pointer", () => {
    mockEnvironment({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0",
      maxTouchPoints: 10,
      finePointer: true,
      uaData: { mobile: false, platform: "Windows" },
    });
    expect(checkDesktopDevice().ok).toBe(true);
  });
});

describe("checkSingleDisplay", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window.screen, "isExtended");

  afterEach(() => {
    if (descriptor) {
      Object.defineProperty(window.screen, "isExtended", descriptor);
    } else {
      delete (window.screen as Screen & { isExtended?: boolean }).isExtended;
    }
  });

  it("blocks when Chromium reports screen.isExtended = true", () => {
    Object.defineProperty(window.screen, "isExtended", { value: true, configurable: true });
    const res = checkSingleDisplay();
    expect(res.ok).toBe(false);
    expect(res.apiSupported).toBe(true);
    expect(res.screenCount).toBe(2);
  });

  it("allows when Chromium reports screen.isExtended = false", () => {
    Object.defineProperty(window.screen, "isExtended", { value: false, configurable: true });
    const res = checkSingleDisplay();
    expect(res.ok).toBe(true);
    expect(res.apiSupported).toBe(true);
    expect(res.screenCount).toBe(1);
  });

  it("allows Safari/Firefox where screen.isExtended is undefined", () => {
    delete (window.screen as Screen & { isExtended?: boolean }).isExtended;
    const res = checkSingleDisplay();
    expect(res.ok).toBe(true);
    expect(res.apiSupported).toBe(false);
  });
});

describe("filterProhibitedDetections", () => {
  it("extracts prohibited items above thresholds and normalizes remotes to cell phone", () => {
    const detections = [
      { categories: [{ categoryName: "cell phone", score: 0.48 }] },
      { categories: [{ categoryName: "remote", score: 0.62 }] },
      { categories: [{ categoryName: "book", score: 0.56 }] },
      { categories: [{ categoryName: "laptop", score: 0.55 }] },
      { categories: [{ categoryName: "cup", score: 0.95 }] },
    ];
    expect(filterProhibitedDetections(detections)).toEqual([
      { label: "cell phone", score: 0.48 },
      { label: "cell phone", score: 0.62 },
      { label: "book", score: 0.56 },
    ]);
  });
});

describe("ProctoringOverlay strict enforcement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders duplicate tab and multi-screen blockers when active", () => {
    const { rerender } = render(
      createElement(ProctoringOverlay, {
        violations: [],
        sessionId: "sess-1",
        multiTabBlocked: true,
        multiScreenBlocked: false,
        isScreenShareActive: true,
      }),
    );
    expect(screen.getByText("Multiple Interview Tabs Detected")).toBeTruthy();

    rerender(
      createElement(ProctoringOverlay, {
        violations: [],
        sessionId: "sess-1",
        multiTabBlocked: false,
        multiScreenBlocked: true,
        isScreenShareActive: true,
      }),
    );
    expect(screen.getByText("Multiple Displays Detected")).toBeTruthy();
  });

  it("auto-terminates after 20s if entire screen sharing is not restored", async () => {
    const onAutoTerminate = vi.fn();
    await act(async () => {
      render(
        createElement(ProctoringOverlay, {
          violations: [],
          sessionId: "sess-1",
          isScreenShareActive: false,
          onAutoTerminate,
        }),
      );
    });

    expect(screen.getByText("Entire Screen Share Disconnected")).toBeTruthy();
    expect(onAutoTerminate).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(onAutoTerminate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Interview Terminated")).toBeTruthy();
  });

  it("auto-terminates when 5 intentional critical violations accumulate", async () => {
    const onAutoTerminate = vi.fn();
    const makeViolation = (
      idx: number,
      event_type: ProctoringEvent["event_type"],
    ): ProctoringEvent => ({
      id: `v-${idx}`,
      session_id: "sess-1",
      event_type,
      severity: "critical",
      timestamp: new Date().toISOString(),
    });

    const violations: ProctoringEvent[] = [
      makeViolation(1, "tab_switch"),
      makeViolation(2, "window_blur"),
      makeViolation(3, "fullscreen_exit"),
      makeViolation(4, "prohibited_object"),
      makeViolation(5, "keyboard_shortcut"),
    ];

    await act(async () => {
      render(
        createElement(ProctoringOverlay, {
          violations,
          sessionId: "sess-1",
          isScreenShareActive: true,
          onAutoTerminate,
        }),
      );
    });

    expect(onAutoTerminate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Interview Terminated")).toBeTruthy();
  });
});
