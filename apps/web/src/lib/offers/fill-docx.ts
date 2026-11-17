import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { pruneDocxXmlConditions } from "./prune-docx-xml";

export {
  extractTextFromDocxXml,
  pruneDocxXmlConditions,
  splitDocxBodyElements,
} from "./prune-docx-xml";

export class OfferDocxError extends Error {
  constructor(
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = "OfferDocxError";
  }
}

/**
 * Format Docxtemplater error objects into clear, human-readable error messages.
 */
function formatDocxtemplaterError(err: unknown): OfferDocxError {
  if (err instanceof OfferDocxError) {
    return err;
  }

  const anyErr = err as {
    message?: string;
    properties?: {
      id?: string;
      explanation?: string;
      file?: string;
      context?: string;
      xtag?: string;
      errors?: Array<{
        message?: string;
        properties?: {
          id?: string;
          explanation?: string;
          file?: string;
          context?: string;
          xtag?: string;
        };
      }>;
    };
  };

  const subErrors = anyErr.properties?.errors;
  if (Array.isArray(subErrors) && subErrors.length > 0) {
    const errorDetails = subErrors.map((sub) => {
      const p = sub.properties || {};
      const fileInfo = p.file ? ` (in ${p.file})` : "";
      const explanation = p.explanation || sub.message || "Malformed tag";
      return `${explanation}${fileInfo}`;
    });
    return new OfferDocxError(
      `Template contains ${subErrors.length} tag error(s):\n${errorDetails.join("\n")}`,
      errorDetails,
    );
  }

  if (anyErr.properties?.explanation) {
    const fileInfo = anyErr.properties.file ? ` (in ${anyErr.properties.file})` : "";
    return new OfferDocxError(`${anyErr.properties.explanation}${fileInfo}`);
  }

  const msg = err instanceof Error ? err.message : String(err);
  return new OfferDocxError(msg);
}

/**
 * Fill a .docx template buffer using docxtemplater and pizzip.
 * Layout, fonts, tables, margins, headers, and footers from the original .docx are strictly preserved.
 */
export function fillOfferDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(templateBuffer);
  } catch (zipErr) {
    throw new OfferDocxError(
      `Invalid or corrupted .docx file: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`,
    );
  }

  // 1. Pre-process word/document.xml to prune conditional blocks (e.g. LETTER_TYPE = fulltime vs intern)
  const docFile = zip.file("word/document.xml");
  if (docFile) {
    try {
      const rawXml = docFile.asText();
      const prunedXml = pruneDocxXmlConditions(rawXml, data);
      zip.file("word/document.xml", prunedXml);
    } catch (pruneErr) {
      console.warn("[fillOfferDocx] Error pruning conditional XML in word/document.xml:", pruneErr);
    }
  }

  // Create a case-tolerant lookup so {{candidate_name}}, {{CANDIDATE_NAME}}, etc. resolve gracefully
  const normalizedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    normalizedData[key] = value;
    normalizedData[key.toLowerCase()] = value;
    normalizedData[key.toUpperCase()] = value;
  }

  // Native boolean flags for Docxtemplater conditions {#is_intern}...{/is_intern}
  const roleLower = String(
    data.POSITION_TITLE || data.ROLE || data.role || data.designation || data.position_title || "",
  ).toLowerCase();
  const letterType = String(data.LETTER_TYPE || data.letter_type || "").toLowerCase();
  const isIntern =
    letterType === "intern" ||
    roleLower.includes("intern") ||
    Boolean(
      data.STIPEND_AMOUNT &&
        String(data.STIPEND_AMOUNT).trim() !== "" &&
        String(data.STIPEND_AMOUNT).trim() !== "0",
    );

  normalizedData.is_fulltime = !isIntern;
  normalizedData.is_intern = isIntern;
  normalizedData.is_internship = isIntern;
  normalizedData.has_incentive = Boolean(
    data.INCENTIVE_NOTE && String(data.INCENTIVE_NOTE).trim() !== "",
  );

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter(part) {
        const tag = part.value?.trim() || "";
        // Check if normalized key exists with non-null value
        if (tag in normalizedData && normalizedData[tag] != null) {
          return normalizedData[tag];
        }
        const lower = tag.toLowerCase();
        if (lower in normalizedData && normalizedData[lower] != null) {
          return normalizedData[lower];
        }
        const upper = tag.toUpperCase();
        if (upper in normalizedData && normalizedData[upper] != null) {
          return normalizedData[upper];
        }
        throw new OfferDocxError(`Missing value for placeholder: {{${part.value}}}`);
      },
    });

    // Precompile and compile all document, header, and footer files in the package
    const internalDoc = doc as unknown as {
      precompileFile?: (fileName: string) => void;
      compileFile?: (fileName: string) => void;
    };

    const xmlFiles = Object.keys(zip.files).filter((fileName) => {
      if (!fileName.startsWith("word/") || !fileName.endsWith(".xml")) return false;
      const base = fileName.replace("word/", "");
      return (
        base === "document.xml" ||
        base.startsWith("header") ||
        base.startsWith("footer") ||
        base.startsWith("footnotes") ||
        base.startsWith("endnotes")
      );
    });

    for (const fileName of xmlFiles) {
      try {
        internalDoc.precompileFile?.(fileName);
        internalDoc.compileFile?.(fileName);
      } catch {
        // Continue
      }
    }

    doc.render(normalizedData);
  } catch (renderErr) {
    throw formatDocxtemplaterError(renderErr);
  }

  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  }) as Buffer;
}
