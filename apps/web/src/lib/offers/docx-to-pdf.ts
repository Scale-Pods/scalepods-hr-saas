export class OfferPdfConversionError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
  ) {
    super(message);
    this.name = "OfferPdfConversionError";
  }
}

export interface ConvertDocxOptions {
  tenantId?: string;
  timeoutMs?: number;
  maxFileSizeBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 15;

// In-memory sliding window rate limiter per tenant
const tenantRateLimitMap = new Map<string, number[]>();

function checkRateLimit(tenantId: string) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const existing = tenantRateLimitMap.get(tenantId) || [];
  const validTimestamps = existing.filter((t) => t > windowStart);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new OfferPdfConversionError(
      `Rate limit exceeded: maximum ${MAX_REQUESTS_PER_WINDOW} PDF conversions per minute per tenant. Please try again shortly.`,
      429,
    );
  }

  validTimestamps.push(now);
  tenantRateLimitMap.set(tenantId, validTimestamps);
}

/** Reset rate limit for tests */
export function _resetRateLimits(): void {
  tenantRateLimitMap.clear();
}

/**
 * Convert a .docx Buffer to PDF Buffer using LibreOffice via Gotenberg or CloudConvert.
 *
 * Provider selected by env PDF_CONVERTER ("gotenberg" | "cloudconvert").
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  options?: ConvertDocxOptions,
): Promise<Buffer> {
  const maxSize = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
  if (docxBuffer.length > maxSize) {
    throw new OfferPdfConversionError(
      `File size (${(docxBuffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of ${(maxSize / (1024 * 1024)).toFixed(0)}MB`,
      400,
    );
  }

  if (options?.tenantId) {
    checkRateLimit(options.tenantId);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const provider = (process.env.PDF_CONVERTER || "gotenberg").toLowerCase().trim();

  if (provider === "cloudconvert") {
    return convertViaCloudConvert(docxBuffer, timeoutMs);
  }

  return convertViaGotenberg(docxBuffer, timeoutMs);
}

async function convertViaGotenberg(docxBuffer: Buffer, timeoutMs: number): Promise<Buffer> {
  const gotenbergUrl = (process.env.GOTENBERG_URL || "http://localhost:3000").replace(/\/+$/, "");
  const endpoint = `${gotenbergUrl}/forms/libreoffice/convert`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(docxBuffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  formData.append("files", blob, "document.docx");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new OfferPdfConversionError(
        `Gotenberg conversion failed (HTTP ${res.status}): ${errText || res.statusText}`,
        res.status,
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err instanceof OfferPdfConversionError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new OfferPdfConversionError(
        `PDF conversion timed out after ${timeoutMs / 1000} seconds`,
        504,
      );
    }
    throw new OfferPdfConversionError(
      `Failed to reach Gotenberg at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function convertViaCloudConvert(docxBuffer: Buffer, timeoutMs: number): Promise<Buffer> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY?.trim();
  if (!apiKey) {
    throw new OfferPdfConversionError(
      "CLOUDCONVERT_API_KEY environment variable is not configured",
      500,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Create CloudConvert job
    const jobRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tasks: {
          "import-file": {
            operation: "import/upload",
          },
          "convert-file": {
            operation: "convert",
            input: "import-file",
            output_format: "pdf",
          },
          "export-file": {
            operation: "export/url",
            input: "convert-file",
          },
        },
      }),
      signal: controller.signal,
    });

    if (!jobRes.ok) {
      const errJson = (await jobRes.json().catch(() => ({}))) as { message?: string };
      throw new OfferPdfConversionError(
        `CloudConvert job creation failed: ${errJson.message || jobRes.statusText}`,
        jobRes.status,
      );
    }

    const jobData = (await jobRes.json()) as {
      data: {
        id: string;
        tasks: Array<{
          name: string;
          operation: string;
          result?: {
            form?: {
              url: string;
              parameters: Record<string, string>;
            };
          };
        }>;
      };
    };

    const importTask = jobData.data.tasks.find((t) => t.name === "import-file");
    const uploadForm = importTask?.result?.form;
    if (!uploadForm?.url) {
      throw new OfferPdfConversionError("Failed to obtain CloudConvert upload parameters", 502);
    }

    // 2. Upload docx buffer
    const uploadData = new FormData();
    for (const [key, val] of Object.entries(uploadForm.parameters || {})) {
      uploadData.append(key, val);
    }
    const blob = new Blob([new Uint8Array(docxBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    uploadData.append("file", blob, "document.docx");

    const uploadRes = await fetch(uploadForm.url, {
      method: "POST",
      body: uploadData,
      signal: controller.signal,
    });

    if (!uploadRes.ok) {
      throw new OfferPdfConversionError("Failed to upload document to CloudConvert storage", 502);
    }

    // 3. Wait for job completion
    const waitRes = await fetch(
      `https://api.cloudconvert.com/v2/jobs/${jobData.data.id}/wait?timeout=60`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );

    if (!waitRes.ok) {
      throw new OfferPdfConversionError(
        "Failed while waiting for CloudConvert job completion",
        502,
      );
    }

    const completedJob = (await waitRes.json()) as {
      data: {
        status: string;
        tasks: Array<{
          name: string;
          status: string;
          result?: {
            files?: Array<{ url: string; filename: string }>;
          };
        }>;
      };
    };

    const exportTask = completedJob.data.tasks.find((t) => t.name === "export-file");
    const downloadUrl = exportTask?.result?.files?.[0]?.url;
    if (!downloadUrl) {
      throw new OfferPdfConversionError("CloudConvert did not return an exported PDF URL", 502);
    }

    // 4. Download converted PDF
    const downloadRes = await fetch(downloadUrl, { signal: controller.signal });
    if (!downloadRes.ok) {
      throw new OfferPdfConversionError("Failed to download PDF from CloudConvert", 502);
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err instanceof OfferPdfConversionError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new OfferPdfConversionError(
        `CloudConvert PDF conversion timed out after ${timeoutMs / 1000} seconds`,
        504,
      );
    }
    throw new OfferPdfConversionError(
      `CloudConvert error: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
