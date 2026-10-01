import { type NextRequest, NextResponse } from "next/server";
import { parseResumeText } from "@/lib/parse-resume";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = await file.arrayBuffer();
    let text = "";

    if (name.endsWith(".pdf")) {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      }).promise;

      const maxPages = Math.min(doc.numPages, 30);
      const parts: string[] = [];
      for (let i = 1; i <= maxPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str || "").join(" ");
        parts.push(pageText);
      }
      text = parts
        .join("\n\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      text = result.value.trim();
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = Buffer.from(buffer).toString("utf-8");
    }

    if (!text) {
      return NextResponse.json({
        email: undefined,
        name: file.name.replace(/\.[^.]+$/, ""),
        phone: undefined,
        text: "",
      });
    }

    const contact = parseResumeText(text);
    return NextResponse.json({
      email: contact.email,
      name: contact.name || file.name.replace(/\.[^.]+$/, ""),
      phone: contact.phone,
      text,
    });
  } catch (err) {
    console.error("[api/parse-resume] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse resume" },
      { status: 500 },
    );
  }
}
