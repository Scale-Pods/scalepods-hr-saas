import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimits, convertDocxToPdf, OfferPdfConversionError } from "./docx-to-pdf";

describe("convertDocxToPdf", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetRateLimits();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("enforces maximum file size limit", async () => {
    const fakeBuffer = Buffer.alloc(16 * 1024 * 1024); // 16MB
    await expect(convertDocxToPdf(fakeBuffer)).rejects.toThrowError(/exceeds maximum limit/i);
  });

  it("enforces per-tenant rate limiting", async () => {
    process.env.PDF_CONVERTER = "gotenberg";
    process.env.GOTENBERG_URL = "http://mock-gotenberg:3000";

    const smallBuffer = Buffer.from("dummy-docx-content");
    const fakePdf = Buffer.from("%PDF-1.4 dummy");

    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(fakePdf, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );

    const tenantId = "tenant-123";

    // 15 conversions within a minute should succeed
    for (let i = 0; i < 15; i++) {
      const res = await convertDocxToPdf(smallBuffer, { tenantId });
      expect(res).toEqual(fakePdf);
    }

    // 16th conversion within the same window must throw 429
    await expect(convertDocxToPdf(smallBuffer, { tenantId })).rejects.toThrowError(
      OfferPdfConversionError,
    );

    try {
      await convertDocxToPdf(smallBuffer, { tenantId });
    } catch (err) {
      expect((err as OfferPdfConversionError).statusCode).toBe(429);
      expect((err as OfferPdfConversionError).message).toMatch(/Rate limit exceeded/i);
    }

    // A different tenant should not be rate-limited
    const otherRes = await convertDocxToPdf(smallBuffer, {
      tenantId: "tenant-456",
    });
    expect(otherRes).toEqual(fakePdf);
  });

  it("successfully converts via Gotenberg provider", async () => {
    process.env.PDF_CONVERTER = "gotenberg";
    process.env.GOTENBERG_URL = "http://localhost:3000";

    const smallBuffer = Buffer.from("dummy-docx-content");
    const fakePdf = Buffer.from("%PDF-1.4 output");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(fakePdf, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );

    const result = await convertDocxToPdf(smallBuffer);
    expect(result).toEqual(fakePdf);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/forms/libreoffice/convert",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles Gotenberg errors gracefully", async () => {
    process.env.PDF_CONVERTER = "gotenberg";
    process.env.GOTENBERG_URL = "http://localhost:3000";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("LibreOffice syntax crash", {
        status: 400,
        statusText: "Bad Request",
      }),
    );

    await expect(convertDocxToPdf(Buffer.from("corrupt"))).rejects.toThrowError(
      /Gotenberg conversion failed \(HTTP 400\)/i,
    );
  });

  it("handles CloudConvert workflow successfully", async () => {
    process.env.PDF_CONVERTER = "cloudconvert";
    process.env.CLOUDCONVERT_API_KEY = "test-api-key";

    const smallBuffer = Buffer.from("dummy-docx-content");
    const fakePdf = Buffer.from("%PDF-1.4 cloudconvert output");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // 1. Create job
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "job-123",
              tasks: [
                {
                  name: "import-file",
                  operation: "import/upload",
                  result: {
                    form: {
                      url: "https://storage.cloudconvert.com/upload",
                      parameters: { key: "val" },
                    },
                  },
                },
              ],
            },
          }),
          { status: 201 },
        ),
      )
      // 2. Upload file
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      // 3. Wait for job
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              status: "finished",
              tasks: [
                {
                  name: "export-file",
                  status: "finished",
                  result: {
                    files: [
                      {
                        url: "https://storage.cloudconvert.com/download/doc.pdf",
                        filename: "doc.pdf",
                      },
                    ],
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      // 4. Download PDF
      .mockResolvedValueOnce(
        new Response(fakePdf, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
      );

    const result = await convertDocxToPdf(smallBuffer);
    expect(result).toEqual(fakePdf);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});
