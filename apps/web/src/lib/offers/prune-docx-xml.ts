/**
 * Pure TypeScript / Node.js utility to prune conditional sections, template instructions,
 * and opposing full-time/intern clauses from OpenXML (word/document.xml).
 * No third-party APIs or external libraries required.
 */

export interface DocxBodyElement {
  raw: string;
  tag: "p" | "tbl" | "sectPr" | "other";
}

/**
 * Extract plain text content from an OpenXML snippet (<w:p> or <w:tbl>).
 */
export function extractTextFromDocxXml(xml: string): string {
  const matches = xml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) || [];
  return matches
    .map((m) => m.replace(/<w:t(?:\s[^>]*)?>/g, "").replace(/<\/w:t>/g, ""))
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Split the direct children of <w:body> into top-level <w:p>, <w:tbl>, and <w:sectPr> elements.
 */
export function splitDocxBodyElements(bodyContent: string): DocxBodyElement[] {
  const elements: DocxBodyElement[] = [];
  let i = 0;
  const len = bodyContent.length;

  while (i < len) {
    const nextTag = bodyContent.indexOf("<w:", i);
    if (nextTag === -1) {
      if (i < len) {
        elements.push({ raw: bodyContent.slice(i), tag: "other" });
      }
      break;
    }

    if (nextTag > i) {
      const interstitial = bodyContent.slice(i, nextTag);
      if (interstitial.trim()) {
        elements.push({ raw: interstitial, tag: "other" });
      }
    }

    const tagMatch = bodyContent.slice(nextTag).match(/^<w:(p|tbl|sectPr)([ >/])/);
    if (!tagMatch) {
      const closeIdx = bodyContent.indexOf(">", nextTag);
      const end = closeIdx !== -1 ? closeIdx + 1 : len;
      elements.push({ raw: bodyContent.slice(nextTag, end), tag: "other" });
      i = end;
      continue;
    }

    const tagName = tagMatch[1] as "p" | "tbl" | "sectPr";

    if (tagName === "p") {
      const closeTag = "</w:p>";
      const closeIdx = bodyContent.indexOf(closeTag, nextTag);
      if (closeIdx !== -1) {
        const end = closeIdx + closeTag.length;
        elements.push({ raw: bodyContent.slice(nextTag, end), tag: "p" });
        i = end;
      } else {
        elements.push({ raw: bodyContent.slice(nextTag), tag: "p" });
        break;
      }
    } else if (tagName === "tbl") {
      let depth = 0;
      const pos = nextTag;
      let end = len;
      const tblRegex = /<\/?w:tbl[ >/]/g;
      tblRegex.lastIndex = pos;
      while (true) {
        const m = tblRegex.exec(bodyContent);
        if (!m) break;
        if (m[0].startsWith("<w:tbl")) {
          depth++;
        } else if (m[0].startsWith("</w:tbl")) {
          depth--;
          if (depth === 0) {
            end = tblRegex.lastIndex;
            const closeBracket = bodyContent.indexOf(">", m.index);
            if (closeBracket !== -1) {
              end = closeBracket + 1;
            }
            break;
          }
        }
      }
      elements.push({ raw: bodyContent.slice(nextTag, end), tag: "tbl" });
      i = end;
    } else if (tagName === "sectPr") {
      const closeTag = "</w:sectPr>";
      const closeIdx = bodyContent.indexOf(closeTag, nextTag);
      if (closeIdx !== -1) {
        const end = closeIdx + closeTag.length;
        elements.push({ raw: bodyContent.slice(nextTag, end), tag: "sectPr" });
        i = end;
      } else {
        const selfClose = bodyContent.indexOf("/>", nextTag);
        const regularClose = bodyContent.indexOf(">", nextTag);
        const end =
          selfClose !== -1 && selfClose < regularClose
            ? selfClose + 2
            : regularClose !== -1
              ? regularClose + 1
              : len;
        elements.push({ raw: bodyContent.slice(nextTag, end), tag: "sectPr" });
        i = end;
      }
    }
  }

  return elements;
}

/**
 * Prune conditional sections, template instructions, and opposing full-time/intern
 * clauses from word/document.xml before Docxtemplater renders.
 */
export function pruneDocxXmlConditions(xml: string, data: Record<string, unknown>): string {
  const bodyStartMatch = xml.match(/<w:body(?:\s[^>]*)?>/);
  const bodyEndIdx = xml.indexOf("</w:body>");
  if (!bodyStartMatch || bodyEndIdx === -1) {
    return xml;
  }

  const bodyStartIdx = (bodyStartMatch.index ?? 0) + bodyStartMatch[0].length;
  const bodyContent = xml.slice(bodyStartIdx, bodyEndIdx);
  const elements = splitDocxBodyElements(bodyContent);

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
  const hasSpecificType =
    letterType === "fulltime" ||
    letterType === "intern" ||
    roleLower.includes("intern") ||
    Boolean(data.STIPEND_AMOUNT);
  const incentiveNote = String(data.INCENTIVE_NOTE || data.incentive_note || "").trim();

  let currentCondition: "any" | "fulltime" | "intern" = "any";
  let dropNextTitle = false;
  let dropNextIncentive = false;
  const keptElements: DocxBodyElement[] = [];

  for (const el of elements) {
    if (el.tag === "sectPr") {
      keptElements.push(el);
      continue;
    }

    const text = extractTextFromDocxXml(el.raw);

    // 1. Drop developer notes, legend, and logo instructions
    if (/\{\{VARIABLE\}\}.*?dynamic field/i.test(text)) continue;
    if (/LETTERHEAD\s*\/\s*LOGO\s*AREA/i.test(text)) continue;
    if (/Attach client letterhead as background image/i.test(text)) continue;
    if (text === "{{COMPANY_LOGO_PATH}}") continue;

    // 2. Inline conditional title: "Show this section only when: LETTER_TYPE = fulltime -> show 'APPOINTMENT LETTER'"
    const inlineTitleMatch = text.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)\s*(?:→|->|-->|=>)\s*show\s*['"]?([^'"]+)['"]?/i,
    );
    if (inlineTitleMatch) {
      if (hasSpecificType) {
        const targetType = inlineTitleMatch[1].toLowerCase();
        const shouldShow = targetType === "intern" ? isIntern : !isIntern;
        if (!shouldShow) {
          dropNextTitle = true;
        }
        continue;
      }
      continue;
    }

    if (dropNextTitle) {
      if (/^(?:INTERNSHIP\s+)?APPOINTMENT\s+LETTER/i.test(text)) {
        dropNextTitle = false;
        continue;
      }
      if (text) {
        dropNextTitle = false;
      }
    }

    // Standalone title deduplication
    if (/^APPOINTMENT LETTER$/i.test(text) && isIntern) continue;
    if (/^INTERNSHIP APPOINTMENT LETTER$/i.test(text) && !isIntern) continue;

    // 3. Block condition start: "Show this section only when: LETTER_TYPE = fulltime" or "intern"
    const blockMatch = text.match(
      /Show this section only when:\s*LETTER_TYPE\s*=\s*(fulltime|intern)/i,
    );
    if (blockMatch) {
      if (hasSpecificType) {
        currentCondition = blockMatch[1].toLowerCase() as "fulltime" | "intern";
        continue;
      }
      continue;
    }

    // 4. Incentive note condition
    if (/Show incentive line only when INCENTIVE_NOTE/i.test(text)) {
      if (!incentiveNote) {
        dropNextIncentive = true;
      }
      continue;
    }
    if (dropNextIncentive) {
      if (/Incentive\s*\/\s*Variable\s*Pay/i.test(text)) {
        dropNextIncentive = false;
        continue;
      }
      if (text) {
        dropNextIncentive = false;
      }
    }

    // 5. Unconditional major section headings — reset condition so subsequent terms are preserved
    const isUnconditionalHeading =
      /^(?:TERMS OF ENGAGEMENT|ACKNOWLEDGEMENT|For\s+\{\{COMPANY_NAME\}\}|We look forward to welcoming you)/i.test(
        text,
      ) ||
      /^(?:1\.\s+Role\s+&\s+Scope|4\.\s+Confidentiality|5\.\s+Intellectual\s+Property|6\.\s+Code\s+of\s+Conduct)/i.test(
        text,
      ) ||
      /^(?:Signature:|Date:|Place:|I,\s*\{\{CANDIDATE_NAME\}\})/i.test(text);

    if (isUnconditionalHeading) {
      currentCondition = "any";
    }

    // 6. Section 7: Termination
    if (/^7\.\s+Termination/i.test(text)) {
      currentCondition = "any";
    }
    if (/^Either party may terminate this engagement with/i.test(text) && isIntern) {
      continue;
    }
    if (
      /^(?:For internship positions,\s*)?Either party may terminate this internship/i.test(text) &&
      !isIntern
    ) {
      continue;
    }

    // 7. Filter based on active block condition
    if (hasSpecificType) {
      if (currentCondition === "fulltime" && isIntern) continue;
      if (currentCondition === "intern" && !isIntern) continue;
    }

    // 8. Opening paragraph fallback resolution
    if (hasSpecificType) {
      if (isIntern) {
        if (
          /We are pleased to offer you the position of/i.test(text) &&
          !/internship/i.test(text)
        ) {
          continue;
        }
      } else {
        if (/We are pleased to offer you a.*?internship/i.test(text)) {
          continue;
        }
      }
    }

    // 9. Section 2 Compensation fallback resolution
    if (hasSpecificType) {
      if (isIntern) {
        if (/^2\.\s+Compensation\s+&\s+Benefits/i.test(text)) continue;
        if (
          el.tag === "tbl" &&
          (/Basic Salary/i.test(text) ||
            /House Rent Allowance/i.test(text) ||
            /Total CTC/i.test(text) ||
            /Special Allowance/i.test(text))
        )
          continue;
        if (/Gross Annual CTC/i.test(text)) continue;
      } else {
        if (/^2\.\s+Compensation$/i.test(text)) continue;
        if (/Monthly Stipend/i.test(text)) continue;
      }
    }

    // 10. Section 3 Status fallback resolution
    if (hasSpecificType) {
      if (isIntern) {
        if (/^3\.\s+Employment\s+Status/i.test(text)) continue;
        if (/This is a full-time position/i.test(text)) continue;
        if (/probationary period/i.test(text)) continue;
        if (/standard notice period/i.test(text)) continue;
      } else {
        if (/^3\.\s+Internship\s+Status/i.test(text)) continue;
        if (/This is a full-time internship/i.test(text)) continue;
        if (/dedicate your full working capacity/i.test(text)) continue;
        if (/full-time role at the Company's discretion/i.test(text)) continue;
      }
    }

    keptElements.push(el);
  }

  const newBodyContent = keptElements.map((e) => e.raw).join("");
  return xml.slice(0, bodyStartIdx) + newBodyContent + xml.slice(bodyEndIdx);
}

/**
 * Extract structured offer letter document text from OpenXML body,
 * pruning conditional sections and formatting table rows as markdown tables.
 */
export function extractDocumentTextFromDocxXml(
  bodyXml: string,
  data?: Record<string, unknown>,
): string {
  const pruned = data ? pruneDocxXmlConditions(bodyXml, data) : bodyXml;
  const bodyStartMatch = pruned.match(/<w:body(?:\s[^>]*)?>/);
  const bodyEndIdx = pruned.indexOf("</w:body>");
  const content =
    bodyStartMatch && bodyEndIdx !== -1
      ? pruned.slice((bodyStartMatch.index ?? 0) + bodyStartMatch[0].length, bodyEndIdx)
      : pruned;

  const elements = splitDocxBodyElements(content);
  const lines: string[] = [];

  for (const el of elements) {
    if (el.tag === "sectPr" || el.tag === "other") continue;
    if (el.tag === "p") {
      const pText = extractTextFromDocxXml(el.raw);
      if (pText) {
        lines.push(pText);
      } else {
        lines.push("");
      }
    } else if (el.tag === "tbl") {
      const trMatches = el.raw.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
      for (const tr of trMatches) {
        const tcMatches = tr.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
        const cells = tcMatches.map((tc) => extractTextFromDocxXml(tc));
        if (cells.length > 0) {
          lines.push(`| ${cells.join(" | ")} |`);
        }
      }
    }
  }

  let fullText = lines.join("\n");
  if (data) {
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        normalized[k.toUpperCase()] = String(v).trim();
        normalized[k.toLowerCase()] = String(v).trim();
        normalized[k] = String(v).trim();
      }
    }
    fullText = fullText.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (match, key: string) => {
      const cleanKey = key.trim().toUpperCase();
      return normalized[cleanKey] ?? normalized[key.trim()] ?? match;
    });
  }

  return fullText.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extract structured text from a .docx Buffer directly using JSZip or PizZip.
 */
export async function extractDocumentTextFromDocxBuffer(
  docxBuffer: Buffer,
  data?: Record<string, unknown>,
): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(docxBuffer);
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      const xml = await docFile.async("string");
      return extractDocumentTextFromDocxXml(xml, data);
    }
  } catch (err) {
    console.warn("[extractDocumentTextFromDocxBuffer] Error reading docx buffer:", err);
  }
  return "";
}
