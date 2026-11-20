import { numberToWords } from "./number-to-words";

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
  "SIGNATORY_DATE",
  "SIGNATORY_SIGNATURE",
  "COMPANY_SIGN_DATE",
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
function cleanOfferTemplateDirectivesHtml(
  html: string,
  options?: { letterType?: string; isIntern?: boolean; incentiveNote?: string },
): string {
  const hasSpecificType = Boolean(options?.letterType?.trim() || options?.isIntern !== undefined);
  // If template has no ScalePods conditional directives and no specific letter type requested, keep entire content untouched
  if (
    !hasSpecificType &&
    !/Show this section only when|LETTER_TYPE\s*=|INCENTIVE_NOTE|ATTACH_LETTERHEAD/i.test(html)
  ) {
    return html;
  }

  // Normalize HTML block endings with newlines
  const normalized = html
    .replace(/(<\/(?:p|div|tr|h[1-6]|table|ul|ol)>)/gi, "$1\n")
    .replace(/(<(?:br)\s*\/?>)/gi, "\n");

  const blocks: string[] = [];
  const regex =
    /<table[^>]*>[\s\S]*?<\/table>|<(?:p|h[1-6]|div|ul|ol)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|div|ul|ol)>/gi;
  for (const match of normalized.matchAll(regex)) {
    blocks.push(match[0]);
  }

  if (blocks.length === 0) return html;

  const rawLetterType = String(options?.letterType || "")
    .toLowerCase()
    .trim();
  let isIntern = false;
  if (rawLetterType === "intern") {
    isIntern = true;
  } else if (rawLetterType === "fulltime") {
    isIntern = false;
  } else if (options?.isIntern !== undefined) {
    isIntern = Boolean(options.isIntern);
  }

  const out: string[] = [];
  let activeCondition: "any" | "fulltime" | "intern" = "any";

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const rawText = b
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const text =
      escapeHtmlBasic(rawText) === rawText
        ? rawText
        : rawText
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"');

    // 1. Drop developer notes and logo instructions
    if (/\{\{VARIABLE\}\}.*?dynamic field/i.test(text)) continue;
    if (/LETTERHEAD\s*\/\s*LOGO\s*AREA/i.test(text)) continue;
    if (/Attach client letterhead as background image/i.test(text)) continue;
    if (/^\{\{COMPANY_LOGO_PATH\}\}$/i.test(text)) continue;

    // 2. Inline conditional title: "Show this section only when: LETTER_TYPE = fulltime -> show 'APPOINTMENT LETTER'"
    const inlineMatch = text.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)\s*(?:→|->|-->|=>)\s*show\s*['"]?([^'"]+)['"]?/i,
    );
    if (inlineMatch) {
      if (hasSpecificType) {
        const targetType = inlineMatch[1].toLowerCase();
        const title = inlineMatch[2].trim();
        const shouldShow = targetType === "intern" ? isIntern : !isIntern;
        if (shouldShow) {
          out.push(`<h2>${title}</h2>`);
        }
        // Always skip duplicate title block following it whether shown or not
        if (i + 1 < blocks.length) {
          const nextText = blocks[i + 1]
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (nextText.toLowerCase() === title.toLowerCase()) {
            i++;
          }
        }
        continue;
      } else {
        // Master template preservation: keep directive when options not specified
        out.push(b);
        continue;
      }
    }

    // 3. Block condition: "Show this section only when: LETTER_TYPE = fulltime" or intern
    const blockMatch = text.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)/i,
    );
    if (blockMatch) {
      if (hasSpecificType) {
        activeCondition = blockMatch[1].toLowerCase() as "fulltime" | "intern";
        continue;
      } else {
        out.push(b);
        continue;
      }
    }

    // 4. Incentive directive: "Show this section only when: Show incentive line only when INCENTIVE_NOTE is non-empty"
    if (/Show incentive line only when INCENTIVE_NOTE/i.test(text)) {
      if (hasSpecificType) {
        if (!options?.incentiveNote?.trim()) {
          if (i + 1 < blocks.length) {
            const nextText = blocks[i + 1]
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (/Incentive\s*\/\s*Variable\s*Pay/i.test(nextText)) {
              i++;
            }
          }
        }
        continue;
      } else {
        out.push(b);
        continue;
      }
    }

    // 5. Major unconditional section heading resets condition
    if (
      /^(?:TERMS OF ENGAGEMENT|ACKNOWLEDGEMENT|For\s+\{\{COMPANY_NAME\}\}|We look forward to welcoming you)/i.test(
        text,
      ) ||
      /^(?:1\.\s+Role\s+&|4\.\s+Confidentiality|5\.\s+Intellectual|6\.\s+Code|7\.\s+Termination)/i.test(
        text,
      ) ||
      /^(?:Signature:|Date:|Place:|I,\s*\{\{CANDIDATE_NAME\}\})/i.test(text)
    ) {
      activeCondition = "any";
    }

    // Filter by active condition if generating for a specific type
    if (hasSpecificType) {
      if (activeCondition === "fulltime" && isIntern) continue;
      if (activeCondition === "intern" && !isIntern) continue;
    }

    // 6. Fallback deduplication for templates where directive tables were already missing or stripped
    if (hasSpecificType) {
      // Titles deduplication
      if (/^APPOINTMENT LETTER$/i.test(text) && isIntern) continue;
      if (/^INTERNSHIP APPOINTMENT LETTER$/i.test(text) && !isIntern) continue;

      // Opening paragraph deduplication
      if (
        isIntern &&
        /We are pleased to offer you the position of/i.test(text) &&
        !/internship/i.test(text)
      ) {
        continue;
      }
      if (!isIntern && /We are pleased to offer you a.*?internship/i.test(text)) {
        continue;
      }

      // Section 2 (Compensation) deduplication
      if (isIntern && /2\.\s+Compensation\s+(?:&|&amp;)\s+Benefits/i.test(text)) {
        continue;
      }
      if (isIntern && /^<table/i.test(b) && /Basic Salary|HRA|Total CTC/i.test(text)) {
        continue;
      }
      if (isIntern && /Gross Annual CTC/i.test(text)) {
        continue;
      }
      if (!isIntern && /2\.\s+Compensation$/i.test(text)) {
        continue;
      }
      if (!isIntern && /Monthly Stipend/i.test(text)) {
        continue;
      }

      // Section 3 (Status) deduplication
      if (isIntern && /3\.\s+Employment\s+Status/i.test(text)) {
        continue;
      }
      if (isIntern && /(?:full-time position|probationary period)/i.test(text)) {
        continue;
      }
      if (!isIntern && /3\.\s+Internship\s+Status/i.test(text)) {
        continue;
      }
      if (!isIntern && /(?:internship engagement|fixed duration of)/i.test(text)) {
        continue;
      }

      // Section 7 (Termination) deduplication
      if (
        isIntern &&
        /Either party may terminate this engagement with/i.test(text) &&
        /prior written notice/i.test(text) &&
        !/internship/i.test(text)
      ) {
        continue;
      }
      if (!isIntern && /Either party may terminate this internship/i.test(text)) {
        continue;
      }
    }

    let formattedBlock = b;
    if (/^<table/i.test(b)) {
      const rows = b.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
      if (rows.length === 1 && !/<thead/i.test(b)) {
        const cells = rows[0].match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/gi) ?? [];
        if (cells.length === 2) {
          formattedBlock = `<table class="offer-layout-table" style="width:100%;border-collapse:collapse;border:none;margin:8px 0;"><tr><td style="border:none;padding:2px 0;vertical-align:top;width:50%;text-align:left;">${cells[0].replace(/^<(?:th|td)[^>]*>|<\/(?:th|td)>$/gi, "")}</td><td style="border:none;padding:2px 0;vertical-align:top;width:50%;text-align:right;">${cells[1].replace(/^<(?:th|td)[^>]*>|<\/(?:th|td)>$/gi, "")}</td></tr></table>`;
        } else if (cells.length === 3) {
          formattedBlock = `<table class="offer-layout-table" style="width:100%;border-collapse:collapse;border:none;margin:12px 0;"><tr><td style="border:none;padding:2px 0;vertical-align:top;width:33.3%;text-align:left;">${cells[0].replace(/^<(?:th|td)[^>]*>|<\/(?:th|td)>$/gi, "")}</td><td style="border:none;padding:2px 0;vertical-align:top;width:33.3%;text-align:center;">${cells[1].replace(/^<(?:th|td)[^>]*>|<\/(?:th|td)>$/gi, "")}</td><td style="border:none;padding:2px 0;vertical-align:top;width:33.3%;text-align:right;">${cells[2].replace(/^<(?:th|td)[^>]*>|<\/(?:th|td)>$/gi, "")}</td></tr></table>`;
        }
      }
    }

    out.push(formattedBlock);
  }

  return out.join("\n");
}

function cleanOfferTemplateDirectivesText(
  content: string,
  options?: { letterType?: string; isIntern?: boolean; incentiveNote?: string },
): string {
  const rawLetterType = String(options?.letterType || "")
    .toLowerCase()
    .trim();
  let isIntern = false;
  if (rawLetterType === "intern") {
    isIntern = true;
  } else if (rawLetterType === "fulltime") {
    isIntern = false;
  } else if (options?.isIntern !== undefined) {
    isIntern = Boolean(options.isIntern);
  }
  const hasSpecificType = Boolean(rawLetterType || options?.isIntern !== undefined);

  // If template has no ScalePods conditional directives and no specific letter type requested, keep entire content untouched
  if (
    !hasSpecificType &&
    !/Show this section only when|LETTER_TYPE\s*=|INCENTIVE_NOTE|ATTACH_LETTERHEAD/i.test(content)
  ) {
    return content;
  }

  let preprocessed = content;
  if (/APPOINTMENT LETTER\s*\/\s*INTERNSHIP APPOINTMENT LETTER/i.test(preprocessed)) {
    const targetTitle = isIntern ? "INTERNSHIP APPOINTMENT LETTER" : "APPOINTMENT LETTER";
    preprocessed = preprocessed.replace(
      /APPOINTMENT LETTER\s*\/\s*INTERNSHIP APPOINTMENT LETTER/gi,
      targetTitle,
    );
  }

  const lines = preprocessed.split("\n");
  const result: string[] = [];
  let currentCondition: "any" | "fulltime" | "intern" = "any";
  let skipMode:
    | "none"
    | "fulltime_opening"
    | "intern_opening"
    | "fulltime_comp"
    | "intern_comp"
    | "fulltime_status"
    | "intern_status" = "none";

  for (let i = 0; i < lines.length; i++) {
    let rawLine = lines[i];
    let lineTrim = rawLine
      .replace(/<[^>]+>/g, "")
      .replace(/^[|\s]+|[|\s]+$/g, "")
      .trim();

    // 1. Drop developer notes / legend / logo placeholder instructions
    if (/\{\{VARIABLE\}\}.*?dynamic field/i.test(lineTrim)) continue;
    if (/LETTERHEAD\s*\/\s*LOGO\s*AREA/i.test(lineTrim)) continue;
    if (/Attach client letterhead as background image/i.test(lineTrim)) continue;
    if (lineTrim === "{{COMPANY_LOGO_PATH}}") continue;

    // 2. Inline conditional title: "Show this section only when: LETTER_TYPE = fulltime -> show 'APPOINTMENT LETTER'"
    const inlineTitleMatch = lineTrim.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)\s*(?:→|->|-->|=>)\s*show\s*['"]?([^'"]+)['"]?/i,
    );
    if (inlineTitleMatch) {
      if (hasSpecificType) {
        const targetType = inlineTitleMatch[1].toLowerCase();
        const titleText = inlineTitleMatch[2].trim();
        const shouldShow = targetType === "intern" ? isIntern : !isIntern;
        if (shouldShow) {
          result.push(titleText);
        }
        for (let nextIdx = i + 1; nextIdx < lines.length; nextIdx++) {
          const nextClean = lines[nextIdx]
            .replace(/<[^>]+>/g, "")
            .replace(/^[|\s]+|[|\s]+$/g, "")
            .trim();
          if (!nextClean) continue;
          if (nextClean.toLowerCase() === titleText.toLowerCase()) {
            i = nextIdx;
          }
          break;
        }
        continue;
      } else {
        result.push(rawLine);
        continue;
      }
    }

    // 3. Block condition start: "Show this section only when: LETTER_TYPE = fulltime"
    const blockMatch = lineTrim.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)/i,
    );
    if (blockMatch) {
      if (hasSpecificType) {
        currentCondition = blockMatch[1].toLowerCase() as "fulltime" | "intern";
        continue;
      } else {
        result.push(rawLine);
        continue;
      }
    }

    // 4. Incentive note condition: "Show this section only when: Show incentive line only when INCENTIVE_NOTE is non-empty"
    if (/Show incentive line only when INCENTIVE_NOTE/i.test(lineTrim)) {
      if (hasSpecificType) {
        if (!options?.incentiveNote?.trim()) {
          for (let nextIdx = i + 1; nextIdx < lines.length; nextIdx++) {
            const nextClean = lines[nextIdx]
              .replace(/<[^>]+>/g, "")
              .replace(/^[|\s]+|[|\s]+$/g, "")
              .trim();
            if (!nextClean) continue;
            if (/Incentive\s*\/\s*Variable\s*Pay/i.test(nextClean)) {
              i = nextIdx;
            }
            break;
          }
        }
        continue;
      } else {
        result.push(rawLine);
        continue;
      }
    }

    // 5. Unconditional major section headings — reset condition so subsequent terms are never dropped
    const isUnconditionalHeading =
      /^(?:TERMS OF ENGAGEMENT|ACKNOWLEDGEMENT|For\s+\{\{COMPANY_NAME\}\}|We look forward to welcoming you)/i.test(
        lineTrim,
      ) ||
      /^(?:1\.\s+Role\s+&\s+Scope|4\.\s+Confidentiality|5\.\s+Intellectual\s+Property|6\.\s+Code\s+of\s+Conduct|7\.\s+Termination)/i.test(
        lineTrim,
      ) ||
      /^(?:Signature:|Date:|Place:|I,\s*\{\{CANDIDATE_NAME\}\})/i.test(lineTrim);

    if (isUnconditionalHeading) {
      currentCondition = "any";
      skipMode = "none";
    }

    // 6. Filter lines based on active block condition
    if (hasSpecificType) {
      if (currentCondition === "fulltime" && isIntern) {
        continue;
      }
      if (currentCondition === "intern" && !isIntern) {
        continue;
      }
    }

    // 7. Handle AI-mutated dual templates (Alternatively, For Regular Full-Time Position, etc.)
    if (hasSpecificType) {
      // Titles deduplication
      if (/^APPOINTMENT LETTER$/i.test(lineTrim) && isIntern) continue;
      if (/^INTERNSHIP APPOINTMENT LETTER$/i.test(lineTrim) && !isIntern) continue;

      // Opening paragraph resolution
      if (isIntern) {
        if (
          /We are pleased to offer you the position of/i.test(lineTrim) &&
          !/internship/i.test(lineTrim)
        ) {
          if (!/contribute to our growth/i.test(lineTrim)) {
            skipMode = "fulltime_opening";
          }
          continue;
        }
        if (skipMode === "fulltime_opening") {
          if (/contribute to our growth/i.test(lineTrim)) {
            skipMode = "none";
          }
          continue;
        }
        if (/^Alternatively,\s*we are pleased to offer you/i.test(lineTrim)) {
          rawLine = rawLine.replace(/Alternatively,\s*/i, "");
          rawLine = rawLine.replace(/we are pleased/i, "We are pleased");
          lineTrim = rawLine
            .replace(/<[^>]+>/g, "")
            .replace(/^[|\s]+|[|\s]+$/g, "")
            .trim();
        }
      } else {
        if (/^(?:Alternatively,\s*)?we are pleased to offer you a.*?internship/i.test(lineTrim)) {
          if (!/contribute meaningfully to our initiatives/i.test(lineTrim)) {
            skipMode = "intern_opening";
          }
          continue;
        }
        if (skipMode === "intern_opening") {
          if (/contribute meaningfully to our initiatives/i.test(lineTrim)) {
            skipMode = "none";
          }
          continue;
        }
      }

      // Section 2: Compensation
      if (/^2\.\s+Compensation/i.test(lineTrim)) {
        rawLine = isIntern ? "2. Compensation" : "2. Compensation & Benefits";
        lineTrim = rawLine;
        result.push(rawLine);
        continue;
      }
      if (/^For Regular Full-Time Position:/i.test(lineTrim)) {
        skipMode = isIntern ? "fulltime_comp" : "none";
        continue;
      }
      if (/^For Internship Position:/i.test(lineTrim)) {
        skipMode = isIntern ? "none" : "intern_comp";
        continue;
      }

      // Section 3: Status
      if (/^3\.\s+(?:Employment|Internship)\s+Status/i.test(lineTrim)) {
        rawLine = isIntern ? "3. Internship Status" : "3. Employment Status";
        lineTrim = rawLine;
        result.push(rawLine);
        continue;
      }

      // Section 7: Termination
      if (/^Either party may terminate this engagement with/i.test(lineTrim)) {
        if (isIntern) continue;
      }
      if (
        /^(?:For internship positions,\s*)?either party may terminate this internship/i.test(
          lineTrim,
        )
      ) {
        if (!isIntern) continue;
        rawLine = rawLine.replace(/For internship positions,\s*/i, "");
        rawLine = rawLine.replace(/^either party/i, "Either party");
        lineTrim = rawLine
          .replace(/<[^>]+>/g, "")
          .replace(/^[|\s]+|[|\s]+$/g, "")
          .trim();
      }

      if (skipMode === "fulltime_comp" || skipMode === "intern_comp") {
        continue;
      }
    }

    // Clean space before punctuation
    rawLine = rawLine.replace(/\s+([,.])/g, "$1").replace(/\s+'s\b/g, "'s");

    result.push(rawLine);
  }

  return result
    .join("\n")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanOfferTemplateDirectives(
  content: string,
  options?: { letterType?: string; isIntern?: boolean; incentiveNote?: string },
): string {
  if (!content) return "";
  const isHtml = /<table|<p|<div|<h[1-6]/i.test(content);
  if (isHtml) {
    return cleanOfferTemplateDirectivesHtml(content, options);
  }
  return cleanOfferTemplateDirectivesText(content, options);
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
    (normalized.POSITION_TITLE || normalized.ROLE || "").toLowerCase().includes("intern") ||
    Boolean(normalized.STIPEND_AMOUNT);

  // First clean conditional directives and meta notes
  const cleaned = cleanOfferTemplateDirectives(rawText, {
    letterType: normalized.LETTER_TYPE,
    isIntern,
    incentiveNote: normalized.INCENTIVE_NOTE,
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
 * with <h2>/<h3> headings, <table> tables, <ul> bullet lists, and <p> paragraphs.
 */
export function formatPlainTextAsRichHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let listItems: string[] = [];
  let tableRows: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      out.push(`<ul>\n${listItems.map((li) => `  <li>${li}</li>`).join("\n")}\n</ul>`);
      listItems = [];
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      const parsedRows = tableRows.map((r) =>
        r
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1),
      );
      if (parsedRows.length > 0) {
        let tableHtml = "<table>\n";
        parsedRows.forEach((row, rIdx) => {
          const isHeader = rIdx === 0 && row.some((c) => /Component|Monthly|Annual/i.test(c));
          tableHtml += "  <tr>\n";
          row.forEach((cell) => {
            const tag = isHeader ? "th" : "td";
            tableHtml += `    <${tag}>${escapeHtmlBasic(cell)}</${tag}>\n`;
          });
          tableHtml += "  </tr>\n";
        });
        tableHtml += "</table>";
        out.push(tableHtml);
      }
      tableRows = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushTable();
      continue;
    }

    // Markdown table row: starts and ends with "|"
    if (line.startsWith("|") && line.endsWith("|") && line.length > 2) {
      flushList();
      tableRows.push(line);
      continue;
    }

    flushTable();

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
  flushTable();
  return out.join("\n");
}

export function isOfferTemplatePlaceholder(text?: string | null): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  return (
    !trimmed ||
    trimmed === "[Raw DOCX Template]" ||
    trimmed === "[Reusable DOCX Template]" ||
    trimmed === "[Finished Letter]" ||
    trimmed === "[Finished Letter - Sent As-Is]" ||
    /^Employment Offer & Agreement\s+Dear\s+/i.test(trimmed)
  );
}

export interface StandardOfferLetterOptions {
  isIntern: boolean;
  candidateName: string;
  positionTitle: string;
  companyName: string;
  salary: string;
  currency?: string;
  stipendAmount?: string;
  stipendWords?: string;
  duration?: string;
  refNo?: string;
  issueDate?: string;
  joiningDate?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  signatoryDate?: string;
}

export function generateStandardOfferLetterText(opts: StandardOfferLetterOptions): string {
  const currency = opts.currency || "INR";
  const year = new Date().getFullYear();
  const refNo = opts.refNo || `SP/${year}/OFFER/101`;
  const issueDate =
    opts.issueDate ||
    new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  const joiningDate = opts.joiningDate || "09 November 2026";
  const salaryWords = numberToWords(opts.salary);
  const stipendAmount = opts.stipendAmount || opts.salary || "5000";
  const stipendWords = opts.stipendWords || numberToWords(stipendAmount);
  const duration = opts.duration || (opts.isIntern ? "3 Months" : "Full-time");
  const candidateName = opts.candidateName || "Candidate";
  const positionTitle = opts.positionTitle || "Team Member";
  const companyName = opts.companyName || "ScalePods Partner";
  const signatoryName = opts.signatoryName || "Manish";
  const signatoryTitle = opts.signatoryTitle || "Talent Acquisition Lead";
  const signatoryDate = opts.signatoryDate || issueDate;

  return [
    `| Ref: ${refNo} | Date: ${issueDate} |`,
    `| Dear ${candidateName}, | Starting Date: ${joiningDate} |`,
    "",
    opts.isIntern ? "INTERNSHIP APPOINTMENT LETTER" : "APPOINTMENT LETTER",
    "",
    opts.isIntern
      ? `We are pleased to offer you an internship position with ${companyName} as ${positionTitle}. We were impressed by your background and potential, and we are confident that you will make valuable contributions to our team while gaining meaningful professional experience.`
      : `We are pleased to offer you the position of ${positionTitle} with ${companyName}. We believe that your skills and experience will be a valuable asset to our company and look forward to your contributions.`,
    "",
    "TERMS OF ENGAGEMENT",
    "",
    "1. Role & Scope",
    `You will be engaged as ${positionTitle}. In this role, you will be expected to devote your full business time, attention, and energies to the performance of your duties.`,
    "",
    opts.isIntern ? "2. Duration" : "2. Compensation & Benefits",
    opts.isIntern
      ? `Your internship will be for a duration of ${duration}, commencing on ${joiningDate}, unless terminated earlier in accordance with the terms herein.`
      : `Your gross annual compensation will be ${currency} ${opts.salary} /- (${salaryWords}). Detailed breakdown is provided in the Annexure.`,
    "",
    opts.isIntern ? "3. Stipend & Allowances" : "3. Working Hours & Leave",
    opts.isIntern
      ? `You will receive a monthly stipend of ${currency} ${stipendAmount} /- (${stipendWords}), payable on or before the last working day of each calendar month.`
      : "You will be expected to work 5 days a week. You are entitled to standard paid leaves as per company policy.",
    "",
    "4. Confidentiality",
    `During and after your engagement with ${companyName}, you shall maintain strict confidentiality regarding all proprietary information, trade secrets, software, designs, algorithms, customer lists, and business affairs of the company.`,
    "",
    "5. Intellectual Property",
    `All inventions, discoveries, designs, software, documentation, and works of authorship created by you in the course of your engagement shall be the sole and exclusive property of ${companyName}.`,
    "",
    "6. Code of Conduct",
    `You agree to adhere to all workplace policies, rules, regulations, and standards of conduct established by ${companyName}.`,
    "",
    "7. Termination",
    opts.isIntern
      ? "Either party may terminate this internship at any time with 15 days written notice, or payment of stipend in lieu thereof."
      : "Either party may terminate this employment with 30 days written notice, or salary in lieu thereof.",
    "",
    `We look forward to welcoming you to the ${companyName} team.`,
    "",
    `For ${companyName}`,
    signatoryName,
    signatoryTitle,
    "Signature: ______________________",
    `Date: ${signatoryDate}`,
    "",
    "ACKNOWLEDGEMENT",
    `I, ${candidateName}, accept the above terms and agree to work with ${companyName} as ${positionTitle} under the conditions stated herein.`,
    "",
    "| Signature: __________________ | Date: __________________ | Place: __________________ |",
  ].join("\n");
}
