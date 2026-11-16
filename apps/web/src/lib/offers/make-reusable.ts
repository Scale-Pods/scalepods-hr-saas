import PizZip from "pizzip";

export interface TextMatchItem {
  id: string; // unique ID: `${xmlFile}:${paragraphIndex}:${matchIndex}`
  targetText: string;
  contextSnippet: string;
  xmlFile: string;
  paragraphIndex: number;
  matchIndex: number;
}

export interface ReplacementInstruction {
  matchId: string;
  fieldName: string; // e.g. "candidate_name"
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeXmlEntities(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function normalizeFieldName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

interface RunInfo {
  fullMatch: string;
  rPr: string;
  textPrefix: string;
  rawText: string;
  decodedText: string;
  textSuffix: string;
}

/**
 * Parses all <w:r> runs in a paragraph XML string.
 */
function extractRunsFromParagraph(pXml: string): RunInfo[] {
  const runs: RunInfo[] = [];
  // Match each <w:r>...</w:r> block
  const runRegex = /<w:r(?:\s+[^>]*)?>[\s\S]*?<\/w:r>/g;
  let match: RegExpExecArray | null = runRegex.exec(pXml);

  while (match !== null) {
    const fullMatch = match[0];
    const rPrMatch = fullMatch.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";

    // Match <w:t ...>...</w:t>
    const tMatch = fullMatch.match(/(<w:t(?:\s+[^>]*)?>)([\s\S]*?)(<\/w:t>)/);
    if (tMatch) {
      const textPrefix = tMatch[1];
      const rawText = tMatch[2];
      const textSuffix = tMatch[3];
      const decodedText = decodeXmlEntities(rawText);

      runs.push({
        fullMatch,
        rPr,
        textPrefix,
        rawText,
        decodedText,
        textSuffix,
      });
    } else {
      // Run without text (e.g. image, break, tab)
      runs.push({
        fullMatch,
        rPr,
        textPrefix: "",
        rawText: "",
        decodedText: "",
        textSuffix: "",
      });
    }

    match = runRegex.exec(pXml);
  }

  return runs;
}

/**
 * Scan target XML files in the DOCX zip (document, headers, footers) for occurrences
 * of exact text phrases.
 */
export function findTextMatchesInDocx(
  templateBuffer: Buffer,
  targetPhrases: string[],
): Record<string, TextMatchItem[]> {
  const zip = new PizZip(templateBuffer);
  const results: Record<string, TextMatchItem[]> = {};

  for (const phrase of targetPhrases) {
    results[phrase] = [];
  }

  const xmlFiles = Object.keys(zip.files).filter((fileName) => {
    if (!fileName.startsWith("word/") || !fileName.endsWith(".xml")) return false;
    const base = fileName.replace("word/", "");
    return base === "document.xml" || base.startsWith("header") || base.startsWith("footer");
  });

  for (const xmlFile of xmlFiles) {
    const xmlContent = zip.files[xmlFile].asText();
    // Split into paragraphs <w:p>...</w:p>
    const pRegex = /<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/g;
    let pMatch: RegExpExecArray | null = pRegex.exec(xmlContent);
    let pIndex = 0;

    while (pMatch !== null) {
      const pXml = pMatch[0];
      const runs = extractRunsFromParagraph(pXml);
      const combinedText = runs.map((r) => r.decodedText).join("");

      if (combinedText.trim()) {
        for (const target of targetPhrases) {
          if (!target.trim()) continue;

          let searchStart = 0;
          let matchCount = 0;
          while (searchStart < combinedText.length) {
            const idx = combinedText.indexOf(target, searchStart);
            if (idx === -1) break;

            const snippetStart = Math.max(0, idx - 30);
            const snippetEnd = Math.min(combinedText.length, idx + target.length + 30);
            const contextSnippet = combinedText.slice(snippetStart, snippetEnd);

            results[target].push({
              id: `${xmlFile}:${pIndex}:${matchCount}`,
              targetText: target,
              contextSnippet,
              xmlFile,
              paragraphIndex: pIndex,
              matchIndex: matchCount,
            });

            matchCount++;
            searchStart = idx + target.length;
          }
        }
      }

      pIndex++;
      pMatch = pRegex.exec(xmlContent);
    }
  }

  return results;
}

interface MatchReplacementSpec {
  startChar: number;
  endChar: number;
  replacement: string;
}

/**
 * Replace matched text in a paragraph across multiple <w:r> runs.
 */
function replaceMatchesInParagraph(pXml: string, specs: MatchReplacementSpec[]): string {
  if (specs.length === 0) return pXml;

  // Sort specs descending by startChar so replacing does not shift earlier offsets
  const sortedSpecs = [...specs].sort((a, b) => b.startChar - a.startChar);

  // Parse runs
  const runRegex = /<w:r(?:\s+[^>]*)?>[\s\S]*?<\/w:r>/g;
  const runMatches: Array<{ fullMatch: string; index: number; length: number }> = [];
  let m: RegExpExecArray | null = runRegex.exec(pXml);
  while (m !== null) {
    runMatches.push({ fullMatch: m[0], index: m.index, length: m[0].length });
    m = runRegex.exec(pXml);
  }

  if (runMatches.length === 0) return pXml;

  const runs = extractRunsFromParagraph(pXml);

  // Map each character of the combined paragraph text back to (runIndex, offsetInRun)
  interface CharLocation {
    runIndex: number;
    offsetInRun: number;
  }
  const charMap: CharLocation[] = [];
  for (let rIdx = 0; rIdx < runs.length; rIdx++) {
    const textLen = runs[rIdx].decodedText.length;
    for (let c = 0; c < textLen; c++) {
      charMap.push({ runIndex: rIdx, offsetInRun: c });
    }
  }

  // Work on a mutable copy of run decoded texts
  const runTexts = runs.map((r) => r.decodedText);

  for (const spec of sortedSpecs) {
    if (spec.startChar < 0 || spec.endChar > charMap.length) continue;
    const startLoc = charMap[spec.startChar];
    const endLoc = charMap[spec.endChar - 1];

    if (!startLoc || !endLoc) continue;

    const rStart = startLoc.runIndex;
    const rEnd = endLoc.runIndex;

    if (rStart === rEnd) {
      // Single run replacement
      const current = runTexts[rStart];
      const before = current.slice(0, startLoc.offsetInRun);
      const after = current.slice(endLoc.offsetInRun + 1);
      runTexts[rStart] = before + spec.replacement + after;
    } else {
      // Multi-run replacement:
      // First affected run gets the replacement text appended to its prefix
      const startCurrent = runTexts[rStart];
      runTexts[rStart] = startCurrent.slice(0, startLoc.offsetInRun) + spec.replacement;

      // Intermediate runs have their matching portion erased
      for (let r = rStart + 1; r < rEnd; r++) {
        runTexts[r] = "";
      }

      // Last affected run keeps its suffix
      const endCurrent = runTexts[rEnd];
      runTexts[rEnd] = endCurrent.slice(endLoc.offsetInRun + 1);
    }
  }

  // Rebuild the paragraph XML by replacing each run with its updated text
  let updatedPXml = pXml;
  // Replace from last run to first run to maintain character indices in pXml
  for (let rIdx = runMatches.length - 1; rIdx >= 0; rIdx--) {
    const runMatch = runMatches[rIdx];
    const originalRun = runs[rIdx];
    const newText = runTexts[rIdx];

    let newRunXml: string;
    if (originalRun.textPrefix) {
      const encoded = encodeXmlEntities(newText);
      const spaceAttr = /^\s|\s$/.test(newText) ? ' xml:space="preserve"' : "";
      const textTag = `<w:t${spaceAttr}>${encoded}</w:t>`;
      newRunXml = `<w:r>${originalRun.rPr}${textTag}</w:r>`;
    } else {
      newRunXml = runMatch.fullMatch;
    }

    updatedPXml =
      updatedPXml.slice(0, runMatch.index) +
      newRunXml +
      updatedPXml.slice(runMatch.index + runMatch.length);
  }

  return updatedPXml;
}

/**
 * Apply selected text replacements to the DOCX package, replacing chosen matches
 * with {{field_name}} placeholders while strictly preserving Word formatting.
 */
export function applyTextReplacementsToDocx(
  templateBuffer: Buffer,
  replacements: ReplacementInstruction[],
  targetMatches: Record<string, TextMatchItem[]>,
): Buffer {
  const zip = new PizZip(templateBuffer);

  // Group instructions by xmlFile and paragraphIndex
  // matchId format: `${xmlFile}:${paragraphIndex}:${matchIndex}`
  interface PendingReplacement {
    matchItem: TextMatchItem;
    fieldName: string;
  }

  const grouped = new Map<string, Map<number, PendingReplacement[]>>();

  for (const inst of replacements) {
    const fieldName = normalizeFieldName(inst.fieldName);
    if (!fieldName) continue;

    // Find the match item across all targetMatches
    let foundItem: TextMatchItem | undefined;
    for (const list of Object.values(targetMatches)) {
      foundItem = list.find((item) => item.id === inst.matchId);
      if (foundItem) break;
    }

    if (!foundItem) continue;

    let fileMap = grouped.get(foundItem.xmlFile);
    if (!fileMap) {
      fileMap = new Map();
      grouped.set(foundItem.xmlFile, fileMap);
    }

    let pList = fileMap.get(foundItem.paragraphIndex);
    if (!pList) {
      pList = [];
      fileMap.set(foundItem.paragraphIndex, pList);
    }

    pList.push({ matchItem: foundItem, fieldName });
  }

  // Process each affected XML file
  for (const [xmlFile, paragraphMap] of grouped.entries()) {
    if (!zip.files[xmlFile]) continue;
    const xmlContent = zip.files[xmlFile].asText();

    const pRegex = /<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/g;
    const pMatches: Array<{ fullMatch: string; index: number; length: number }> = [];
    let pm: RegExpExecArray | null = pRegex.exec(xmlContent);
    while (pm !== null) {
      pMatches.push({ fullMatch: pm[0], index: pm.index, length: pm[0].length });
      pm = pRegex.exec(xmlContent);
    }

    let updatedXml = xmlContent;
    // Process paragraphs in reverse order to keep string slices valid
    for (let pIdx = pMatches.length - 1; pIdx >= 0; pIdx--) {
      const pData = paragraphMap.get(pIdx);
      if (!pData || pData.length === 0) continue;

      const pMatch = pMatches[pIdx];
      const pXml = pMatch.fullMatch;

      // Extract runs and combined text
      const runs = extractRunsFromParagraph(pXml);
      const combinedText = runs.map((r) => r.decodedText).join("");

      // Find character ranges for each pending replacement in this paragraph
      const specs: MatchReplacementSpec[] = [];
      for (const item of pData) {
        const target = item.matchItem.targetText;
        // Search for the specific matchIndex
        let searchStart = 0;
        let currentMatch = 0;
        while (searchStart < combinedText.length) {
          const idx = combinedText.indexOf(target, searchStart);
          if (idx === -1) break;

          if (currentMatch === item.matchItem.matchIndex) {
            specs.push({
              startChar: idx,
              endChar: idx + target.length,
              replacement: `{{${item.fieldName}}}`,
            });
            break;
          }

          currentMatch++;
          searchStart = idx + target.length;
        }
      }

      const updatedPXml = replaceMatchesInParagraph(pXml, specs);
      updatedXml =
        updatedXml.slice(0, pMatch.index) +
        updatedPXml +
        updatedXml.slice(pMatch.index + pMatch.length);
    }

    zip.file(xmlFile, updatedXml);
  }

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
