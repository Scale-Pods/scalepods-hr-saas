/**
 * Shared helpers for extracting {{VAR_NAME}} placeholders from offer letter
 * templates and substituting filled values for preview / PDF generation.
 */

/**
 * Only keys that ALREADY have dedicated form fields in Step 2 of PrepareOfferModal
 * (plus the literal {{VARIABLE}} legend placeholder) are excluded from the custom
 * variables grid. Every other {{VAR}} in the uploaded template is surfaced to
 * the recruiter so no variable is ever silently dropped.
 */
export const STANDARD_OFFER_VAR_KEYS = new Set([
  "POSITION_TITLE",
  "ROLE",
  "SALARY",
  "COMPENSATION",
  "CURRENCY",
  "START_DATE",
  "JOINING_DATE",
  "SPECIAL_TERMS",
  "TERMS",
  "CANDIDATE_NAME",
  "RECIPIENT_NAME",
  "COMPANY_NAME",
  "SIGNATORY_NAME",
  "VARIABLE",
  "COMPANY_LOGO_PATH",
]);

const PLACEHOLDER_REGEX = /\{\{\s*([A-Za-z0-9_ -]+?)\s*\}\}/g;

export function normalizeVarKey(rawKey: string): string {
  return rawKey
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .toUpperCase();
}

/**
 * Clean template developer notes, legend lines, and conditional directives
 * (e.g. "Show this section only when: LETTER_TYPE = fulltime") from raw docx text or HTML.
 */
export function cleanOfferTemplateDirectives(
  content: string,
  options?: { letterType?: string; isIntern?: boolean },
): string {
  if (!content) return "";

  // Normalize HTML block endings with newlines so Mammoth single-line HTML doesn't drop multi-page content
  const normalized = content.replace(/(<\/(?:p|div|tr|h[1-6]|table|ul|ol)>)/gi, "$1\n");

  const hasSpecificType = options?.isIntern !== undefined || Boolean(options?.letterType?.trim());
  const isIntern =
    options?.isIntern ??
    (options?.letterType ? options.letterType.toLowerCase().includes("intern") : false);

  const lines = normalized.split("\n");
  const result: string[] = [];
  let currentCondition: "any" | "fulltime" | "intern" = "any";

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineTrim = rawLine.replace(/<[^>]+>/g, "").trim();

    // Reset condition on empty lines
    if (!lineTrim) {
      currentCondition = "any";
      result.push(rawLine);
      continue;
    }

    // 1. Drop developer notes / legend / logo placeholder instructions
    if (/\{\{VARIABLE\}\}.*?dynamic field/i.test(lineTrim)) continue;
    if (/LETTERHEAD\s*\/\s*LOGO\s*AREA/i.test(lineTrim)) continue;
    if (/Attach client letterhead as background image/i.test(lineTrim)) continue;

    // 2. Inline conditional title: "Show this section only when: LETTER_TYPE = fulltime -> show 'APPOINTMENT LETTER'"
    const inlineTitleMatch = lineTrim.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)\s*(?:→|->|-->|=>)\s*show\s*['"]?([^'"]+)['"]?/i,
    );
    if (inlineTitleMatch) {
      const targetType = inlineTitleMatch[1].toLowerCase();
      const titleText = inlineTitleMatch[2].trim();
      const shouldShow = !hasSpecificType || (targetType === "intern" ? isIntern : !isIntern);
      if (shouldShow) {
        result.push(rawLine.includes("<") ? `<h2>${titleText}</h2>` : titleText);
      }
      // If the immediate next line repeats the exact titleText, skip it to avoid duplication
      if (i + 1 < lines.length) {
        const nextClean = lines[i + 1].replace(/<[^>]+>/g, "").trim();
        if (nextClean.toLowerCase() === titleText.toLowerCase()) {
          i++;
        }
      }
      continue;
    }

    // 3. Block condition start: "Show this section only when: LETTER_TYPE = fulltime"
    const blockMatch = lineTrim.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)/i,
    );
    if (blockMatch) {
      if (hasSpecificType) {
        currentCondition = blockMatch[1].toLowerCase() as "fulltime" | "intern";
      }
      // Always drop the directive line itself from output
      continue;
    }

    // 4. Filter only the immediate target paragraph for the condition, then reset
    if (hasSpecificType) {
      if (currentCondition === "fulltime" && isIntern) {
        currentCondition = "any";
        continue;
      }
      if (currentCondition === "intern" && !isIntern) {
        currentCondition = "any";
        continue;
      }
    }

    currentCondition = "any";
    result.push(rawLine);
  }

  return result
    .join("\n")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract all unique {{VAR_NAME}} placeholders from template text (uppercased).
 * Handles spaces/hyphens inside braces (common in PDF text extraction).
 */
export function extractAllOfferVariables(text: string): string[] {
  const vars: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_REGEX)) {
    const key = normalizeVarKey(match[1] ?? "");
    if (key) vars.push(key);
  }
  return Array.from(new Set(vars));
}

/**
 * Extract all {{VAR_NAME}} placeholders except the dedicated Step 2 standard
 * form fields and the literal {{VARIABLE}} legend token.
 */
export function extractCustomOfferVariables(text: string): string[] {
  return extractAllOfferVariables(text).filter((v) => !STANDARD_OFFER_VAR_KEYS.has(v));
}

/**
 * Format a SCREAMING_SNAKE_CASE variable name into a human-friendly label.
 */
export function formatOfferVarLabel(key: string): string {
  const clean = key.replace(/^\{\{|\}\}$/g, "").trim();
  const ACRONYMS: Record<string, string> = {
    HRA: "HRA",
    CTC: "CTC",
    NDA: "NDA",
    AI: "AI",
    ID: "ID",
    USD: "USD",
    INR: "INR",
    PF: "PF",
    PAN: "PAN",
    URL: "URL",
  };
  return clean
    .split("_")
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS[upper]) return ACRONYMS[upper];
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Substitute all {{VAR_NAME}} placeholders in template text using the supplied map.
 * Matching is case-insensitive and whitespace-tolerant on the key name.
 * Also cleans template directive markers automatically.
 */
export function renderOfferTemplateText(
  rawText: string,
  values: Record<string, string | undefined>,
): string {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      normalized[normalizeVarKey(k)] = String(v).trim();
    }
  }

  const isIntern =
    normalized.LETTER_TYPE === "intern" ||
    (normalized.POSITION_TITLE || normalized.ROLE || "").toLowerCase().includes("intern");

  // First clean conditional directives and meta notes
  const cleaned = cleanOfferTemplateDirectives(rawText, {
    letterType: normalized.LETTER_TYPE,
    isIntern,
  });

  return cleaned.replace(PLACEHOLDER_REGEX, (full, key: string) => {
    const upper = normalizeVarKey(key);
    return normalized[upper] ?? full;
  });
}

function escapeHtmlBasic(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert plain extracted text into structured HTML
 * with <h2>/<h3> headings, <ul> bullet lists, and <p> paragraphs.
 */
export function formatPlainTextAsRichHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      out.push(`<ul>\n${listItems.map((li) => `  <li>${li}</li>`).join("\n")}\n</ul>`);
      listItems = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }

    // Bullet item: "* ..." or "- ..." or "• ..."
    const bulletMatch = line.match(/^(?:\*|-|•)\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(escapeHtmlBasic(bulletMatch[1]));
      continue;
    }

    flushList();

    const isAllCapsHeading =
      line === line.toUpperCase() &&
      line.length > 2 &&
      line.length < 70 &&
      /[A-Z]/.test(line) &&
      !/^\{\{.*\}\}$/.test(line);

    const isNumberedSection = /^\d+\.\s+[A-Z]/.test(line) && line.length < 80;

    if (isAllCapsHeading) {
      out.push(`<h2>${escapeHtmlBasic(line)}</h2>`);
    } else if (isNumberedSection) {
      out.push(`<h3>${escapeHtmlBasic(line)}</h3>`);
    } else {
      out.push(`<p>${escapeHtmlBasic(line)}</p>`);
    }
  }

  flushList();
  return out.join("\n");
}
