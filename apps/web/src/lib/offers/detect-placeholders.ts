import * as fflate from "fflate";

/**
 * Inspect a .docx buffer and return a list of unique placeholder names found across
 * the body (word/document.xml), headers (word/header*.xml), and footers (word/footer*.xml).
 *
 * Section tags (#loop, ^inverted, /close) are strictly excluded so only fillable field
 * names are returned.
 */
export function detectPlaceholders(templateBuffer: Buffer): string[] {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = fflate.unzipSync(new Uint8Array(templateBuffer));
  } catch (err) {
    throw new Error(
      `Failed to read .docx template: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const placeholders = new Set<string>();

  for (const [fileName, fileU8] of Object.entries(unzipped)) {
    if (
      !fileName.startsWith("word/") ||
      !fileName.endsWith(".xml") ||
      (!fileName.includes("document") &&
        !fileName.includes("header") &&
        !fileName.includes("footer"))
    ) {
      continue;
    }

    const xml = fflate.strFromU8(fileU8);
    // Find all {{placeholder}} patterns
    const matches = xml.match(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g) || [];
    for (const m of matches) {
      const clean = m
        .replace(/^\{\{\s*/, "")
        .replace(/\s*\}\}$/, "")
        .trim();
      if (
        clean &&
        !clean.startsWith("#") &&
        !clean.startsWith("^") &&
        !clean.startsWith("/") &&
        !clean.startsWith("!")
      ) {
        placeholders.add(clean);
      }
    }
  }

  return Array.from(placeholders);
}
