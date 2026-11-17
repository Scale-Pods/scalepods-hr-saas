import * as fflate from "fflate";
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
 * Validate that all `{{...}}` tags in XML are well-formed and closed.
 */
function validateXmlTags(xml: string): void {
  // Check for unclosed tag: "{{" followed by characters without a closing "}}"
  const unclosedMatch = xml.match(/\{\{[^}]*(?:<(?!\/w:t>)[^>]+>[^}]*)*$/);
  if (unclosedMatch) {
    throw new OfferDocxError(
      `Malformed or unclosed tag detected in document XML: ${unclosedMatch[0]}`,
    );
  }

  // Check for "{{" followed by another "{{" before "}}"
  const nestedMatch = xml.match(/\{\{[^}]*\{\{/);
  if (nestedMatch) {
    throw new OfferDocxError(`Malformed nested or unclosed tag in document XML: ${nestedMatch[0]}`);
  }

  // Check single brace mismatch where an opening {{ is not closed on the line/paragraph
  const openBraces = (xml.match(/\{\{/g) || []).length;
  const closeBraces = (xml.match(/\}\}/g) || []).length;
  if (openBraces !== closeBraces) {
    throw new OfferDocxError(
      `Tag syntax error: found ${openBraces} opening '{{' but ${closeBraces} closing '}}' tags (unclosed tag)`,
    );
  }
}

/**
 * Extract all placeholder keys present in an XML string (e.g. {{CANDIDATE_NAME}} -> CANDIDATE_NAME).
 */
function findPlaceholdersInXml(xml: string): string[] {
  const matches = xml.match(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g) || [];
  const keys = new Set<string>();
  for (const m of matches) {
    const key = m
      .replace(/^\{\{\s*/, "")
      .replace(/\s*\}\}$/, "")
      .trim();
    if (key) keys.add(key);
  }
  return Array.from(keys);
}

/**
 * Replace placeholders in an XML string with resolved data values (case-tolerant).
 */
function substitutePlaceholdersInXml(
  xml: string,
  normalizedData: Record<string, unknown>,
  validateAllResolved = false,
): string {
  return xml.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    const upper = key.toUpperCase();
    const lower = key.toLowerCase();

    let val: unknown;
    if (key in normalizedData && normalizedData[key] != null) {
      val = normalizedData[key];
    } else if (upper in normalizedData && normalizedData[upper] != null) {
      val = normalizedData[upper];
    } else if (lower in normalizedData && normalizedData[lower] != null) {
      val = normalizedData[lower];
    }

    if (val !== undefined && val !== null) {
      // Escape XML characters in replacement value
      return String(val)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    if (validateAllResolved) {
      throw new OfferDocxError(`Missing value for placeholder: {{${key}}}`);
    }

    return match;
  });
}

/**
 * Fill a .docx template buffer synchronously using fflate.
 * Layout, fonts, tables, margins, headers, and footers from the original .docx are strictly preserved.
 */
export function fillOfferDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = fflate.unzipSync(new Uint8Array(templateBuffer));
  } catch (zipErr) {
    throw new OfferDocxError(
      `Invalid or corrupted .docx file: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`,
    );
  }

  // Create a case-tolerant lookup so {{candidate_name}}, {{CANDIDATE_NAME}}, etc. resolve gracefully
  const normalizedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    normalizedData[key] = value;
    normalizedData[key.toLowerCase()] = value;
    normalizedData[key.toUpperCase()] = value;
  }

  // Native boolean flags for role / engagement type
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

  // 1. Process word/document.xml
  const docU8 = unzipped["word/document.xml"];
  if (docU8) {
    let rawXml = fflate.strFromU8(docU8);

    // Validate tag syntax
    validateXmlTags(rawXml);

    // Prune conditional clauses (e.g. intern vs fulltime)
    try {
      rawXml = pruneDocxXmlConditions(rawXml, normalizedData);
    } catch (pruneErr) {
      console.warn("[fillOfferDocx] Warning pruning conditional XML:", pruneErr);
    }

    // Check for any missing required placeholders in the pruned document
    const docPlaceholders = findPlaceholdersInXml(rawXml);
    for (const ph of docPlaceholders) {
      const hasVal =
        (ph in normalizedData && normalizedData[ph] != null) ||
        (ph.toUpperCase() in normalizedData && normalizedData[ph.toUpperCase()] != null) ||
        (ph.toLowerCase() in normalizedData && normalizedData[ph.toLowerCase()] != null);

      if (!hasVal) {
        throw new OfferDocxError(`Missing value for placeholder: {{${ph}}}`);
      }
    }

    // Substitute placeholders in body
    const filledXml = substitutePlaceholdersInXml(rawXml, normalizedData, false);
    unzipped["word/document.xml"] = fflate.strToU8(filledXml);
  }

  // 2. Process headers and footers (word/header*.xml, word/footer*.xml)
  for (const [filename, fileU8] of Object.entries(unzipped)) {
    if (
      filename.startsWith("word/") &&
      (filename.includes("header") || filename.includes("footer")) &&
      filename.endsWith(".xml")
    ) {
      try {
        let hfXml = fflate.strFromU8(fileU8);
        validateXmlTags(hfXml);
        hfXml = substitutePlaceholdersInXml(hfXml, normalizedData, false);
        unzipped[filename] = fflate.strToU8(hfXml);
      } catch (hfErr) {
        if (hfErr instanceof OfferDocxError) throw hfErr;
      }
    }
  }

  // 3. Re-zip package
  const zippedU8 = fflate.zipSync(unzipped);
  return Buffer.from(zippedU8);
}
