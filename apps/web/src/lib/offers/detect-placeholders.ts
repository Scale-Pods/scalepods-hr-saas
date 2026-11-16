import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

/**
 * Inspect a .docx buffer and return a list of unique placeholder names found across
 * the body (word/document.xml), headers (word/header*.xml), and footers (word/footer*.xml).
 *
 * Section tags (#loop, ^inverted, /close) are strictly excluded so only fillable field
 * names are returned.
 */
export function detectPlaceholders(templateBuffer: Buffer): string[] {
  let zip: PizZip;
  try {
    zip = new PizZip(templateBuffer);
  } catch (err) {
    throw new Error(
      `Failed to read .docx template: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
  });

  // Identify all templated XML files: document, headers, footers, footnotes, endnotes
  const xmlFiles = Object.keys(zip.files).filter((fileName) => {
    if (!fileName.startsWith("word/") || !fileName.endsWith(".xml")) {
      return false;
    }
    const base = fileName.replace("word/", "");
    return (
      base === "document.xml" ||
      base.startsWith("header") ||
      base.startsWith("footer") ||
      base.startsWith("footnotes") ||
      base.startsWith("endnotes")
    );
  });

  // Cast to internal Docxtemplater interface for AST compilation & inspection
  const internalDoc = doc as unknown as {
    precompileFile?: (fileName: string) => void;
    compileFile?: (fileName: string) => void;
    compiled?: Record<string, { postparsed?: unknown[] }>;
  };

  // Precompile and compile each target file so Docxtemplater resolves split runs and builds AST
  for (const fileName of xmlFiles) {
    try {
      if (typeof internalDoc.precompileFile === "function") {
        internalDoc.precompileFile(fileName);
      }
      if (typeof internalDoc.compileFile === "function") {
        internalDoc.compileFile(fileName);
      }
    } catch {
      // Continue inspecting other files if one file has non-fatal format differences
    }
  }

  const placeholders = new Set<string>();

  function collectTokens(tokens: unknown[]) {
    if (!Array.isArray(tokens)) return;
    for (const item of tokens) {
      if (!item || typeof item !== "object") continue;
      const token = item as {
        type?: string;
        module?: string;
        value?: string;
        raw?: string;
        subparsed?: unknown[];
      };

      if (token.type === "placeholder") {
        const raw = String(token.raw || token.value || "").trim();
        const val = String(token.value || "").trim();

        // Exclude loop/section tags starting with #, ^, or /
        const isSection =
          token.module === "loop" ||
          raw.startsWith("#") ||
          raw.startsWith("^") ||
          raw.startsWith("/") ||
          val.startsWith("#") ||
          val.startsWith("^") ||
          val.startsWith("/");

        if (!isSection && val) {
          placeholders.add(val);
        }
      }

      if (Array.isArray(token.subparsed)) {
        collectTokens(token.subparsed);
      }
    }
  }

  for (const fileName of Object.keys(internalDoc.compiled || {})) {
    const fileObj = internalDoc.compiled?.[fileName];
    if (fileObj?.postparsed) {
      collectTokens(fileObj.postparsed);
    }
  }

  return Array.from(placeholders);
}
