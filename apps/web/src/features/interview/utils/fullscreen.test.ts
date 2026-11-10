import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enterFullscreen,
  exitFullscreen,
  getFullscreenElement,
  isFullscreenSupported,
} from "./fullscreen";

describe("fullscreen helpers", () => {
  const originalRequestFullscreen = document.documentElement.requestFullscreen;
  const originalExitFullscreen = document.exitFullscreen;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: originalRequestFullscreen,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, "fullscreenEnabled", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: originalExitFullscreen,
      configurable: true,
      writable: true,
    });
  });

  it("reports unsupported when requestFullscreen is missing", async () => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(isFullscreenSupported()).toBe(false);
    expect(await enterFullscreen()).toBe(false);
  });

  it("enters and exits fullscreen cleanly when supported", async () => {
    const requestMock = vi.fn().mockImplementation(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
        writable: true,
      });
    });
    const exitMock = vi.fn().mockImplementation(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        configurable: true,
        writable: true,
      });
    });

    Object.defineProperty(document, "fullscreenEnabled", {
      value: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: requestMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: exitMock,
      configurable: true,
      writable: true,
    });

    expect(isFullscreenSupported()).toBe(true);
    expect(getFullscreenElement()).toBeNull();

    const entered = await enterFullscreen();
    expect(entered).toBe(true);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(getFullscreenElement()).toBe(document.documentElement);

    await exitFullscreen();
    expect(exitMock).toHaveBeenCalledTimes(1);
    expect(getFullscreenElement()).toBeNull();
  });

  it("returns false cleanly when browser rejects requestFullscreen", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      value: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: vi.fn().mockRejectedValue(new Error("user gesture required")),
      configurable: true,
      writable: true,
    });

    expect(await enterFullscreen()).toBe(false);
  });
});
