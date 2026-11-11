import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProctoringOverlay } from "../components/ProctoringOverlay";
import type { ProctoringEvent } from "../types";
import { DeepgramSTT } from "./deepgram";
import { checkDesktopDevice, checkSingleDisplay } from "./environmentCheck";
import { filterProhibitedDetections } from "./mediapipeObjectDetector";
import { acquireMediapipeQuietConsole } from "./mediapipeShared";
import {
  classifyRgbCell,
  getBeaconPattern,
  verifyBeaconQuadrants,
  verifyScreenShareFrame,
} from "./screenVerification";

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

  it("blocks and auto-terminates after 20s when wrong screen is shared", async () => {
    const onAutoTerminate = vi.fn();
    await act(async () => {
      render(
        createElement(ProctoringOverlay, {
          violations: [],
          sessionId: "sess-1",
          isScreenShareActive: true,
          wrongScreenBlocked: true,
          onAutoTerminate,
        }),
      );
    });

    expect(screen.getByText("Wrong Screen Shared")).toBeTruthy();
    expect(onAutoTerminate).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(onAutoTerminate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Interview Terminated")).toBeTruthy();
  });
});

describe("screenVerification live beacon", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, "innerHeight", {
      value: originalInnerHeight,
      configurable: true,
    });
  });

  it("classifies encoded colors despite compression drift and rejects neutrals", () => {
    expect(classifyRgbCell(238, 18, 52)).toBe("R");
    expect(classifyRgbCell(16, 214, 78)).toBe("G");
    expect(classifyRgbCell(12, 98, 240)).toBe("B");
    expect(classifyRgbCell(236, 198, 18)).toBe("Y");
    expect(classifyRgbCell(245, 245, 245)).toBeNull();
    expect(classifyRgbCell(30, 32, 35)).toBeNull();
  });

  it("matches current or immediate previous beacon permutation and rejects wrong screens", () => {
    const p0 = getBeaconPattern(0); // R, G, B, Y
    const p1 = getBeaconPattern(1); // G, B, Y, R

    const r: [number, number, number] = [245, 10, 60];
    const g: [number, number, number] = [10, 225, 80];
    const b: [number, number, number] = [10, 105, 245];
    const y: [number, number, number] = [248, 208, 10];

    expect(verifyBeaconQuadrants([g, b, y, r], p1, p0)).toBe(true);
    expect(verifyBeaconQuadrants([r, g, b, y], p1, p0)).toBe(true);
    // Random/other screen (uniform desktop grey or wrong permutation)
    expect(verifyBeaconQuadrants([r, r, r, r], p1, p0)).toBe(false);
    expect(
      verifyBeaconQuadrants(
        [
          [30, 30, 30],
          [30, 30, 30],
          [30, 30, 30],
          [30, 30, 30],
        ],
        p1,
        p0,
      ),
    ).toBe(false);
  });

  it("returns null when video stream is not ready", () => {
    const video = document.createElement("video");
    const beaconEl = document.createElement("div");
    const canvas = document.createElement("canvas");
    expect(verifyScreenShareFrame(video, beaconEl, canvas, getBeaconPattern(0))).toBeNull();
  });

  it("samples the 32x32 beacon canvas regions accurately", () => {
    const p0 = getBeaconPattern(0); // R, G, B, Y
    const data = new Uint8ClampedArray(32 * 32 * 4);
    const fillQuad = (qx: number, qy: number, rgb: [number, number, number]) => {
      for (let y = qy * 16; y < qy * 16 + 16; y++) {
        for (let x = qx * 16; x < qx * 16 + 16; x++) {
          const i = (y * 32 + x) * 4;
          data[i] = rgb[0];
          data[i + 1] = rgb[1];
          data[i + 2] = rgb[2];
          data[i + 3] = 255;
        }
      }
    };
    fillQuad(0, 0, [255, 0, 64]); // R
    fillQuad(1, 0, [0, 230, 80]); // G
    fillQuad(0, 1, [0, 110, 255]); // B
    fillQuad(1, 1, [255, 210, 0]); // Y

    const video = {
      readyState: 2,
      paused: false,
      videoWidth: 1920,
      videoHeight: 1080,
    } as unknown as HTMLVideoElement;

    const beaconEl = {
      getBoundingClientRect: () => ({ left: 1200, top: 700, width: 40, height: 40 }),
    } as unknown as HTMLElement;

    const canvas = {
      width: 32,
      height: 32,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data }),
      }),
    } as unknown as HTMLCanvasElement;

    Object.defineProperty(window, "innerWidth", { value: 1920, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 1080, configurable: true });

    expect(verifyScreenShareFrame(video, beaconEl, canvas, p0)).toBe(true);
    expect(verifyScreenShareFrame(video, beaconEl, canvas, getBeaconPattern(2))).toBe(false);
  });
});

describe("console noise suppression & clean STT teardown", () => {
  it("suppresses MediaPipe C++/WASM diagnostic messages while passing real app logs", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const release = acquireMediapipeQuietConsole();
    try {
      console.warn(
        "W1111 04:28:35.707000 2213568 face_landmarker_graph.cc:181] Sets FaceBlendshapesGraph acceleration to xnnpack by default.",
      );
      console.info("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
      console.error("Graph successfully started running.");
      console.error(
        "W1111 04:28:36.399000 2213568 inference_feedback_manager.cc:121] Feedback manager requires a model",
      );
      console.error("Graph finished closing successfully.");
      console.error(
        "I1111 04:29:01.116999 2213568 gl_context_webgl.cc:149] Successfully destroyed WebGL context with handle 1",
      );

      console.error("Real application error");
    } finally {
      release();
    }

    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("Real application error");

    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("defers WebSocket.close() until handshake opens when stopped while CONNECTING", () => {
    const closeSpy = vi.fn();
    const sockets: MockWebSocket[] = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      close = closeSpy;
      constructor() {
        sockets.push(this);
      }
    }

    const originalWs = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    try {
      const stt = new DeepgramSTT({ apiKey: "test-key" });
      void stt.start();
      const sock = sockets[0];
      expect(sock).toBeDefined();

      stt.stop();
      expect(closeSpy).not.toHaveBeenCalled();

      sock.readyState = 1;
      sock.onopen?.();
      expect(closeSpy).toHaveBeenCalledWith(1000, "stopped");
    } finally {
      globalThis.WebSocket = originalWs;
    }
  });
});
