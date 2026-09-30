import { extractTextFromFile } from "./extract-text";

export interface ParsedContact {
  email?: string;
  phone?: string;
  name?: string;
  /** Set when the file's text couldn't be read (e.g. scanned PDF). */
  error?: string;
}

// Allow optional spaces around @ and . to handle pdf-parse artifacts
const EMAIL_RE = /[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}/i;
// Phone heuristics: find groups of digits (even single digits if spaced), then filter for >= 10 digits
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{1,5}\)?(?:[\s.-]?\d{1,5}){1,9}/g;

// Lines that are never a candidate name (common header/section titles).
const SKIP_LINE_RE =
  /@|www\.|http|tel:|linkedin|github|summary|profile|objective|education|experience|skills|contact|address|resume|curriculum|reference|available|\bdate\b|\bcreated\b|\bupdated\b|^email|^phone|^name\b|personal details|details|hobbies|interests|languages|projects|playing|stats/i;
// Words that smell like a job title rather than a person.
const JOB_WORDS =
  /(^|\s)(intern|engineer|engineering|developer|designer|manager|architect|lead|analyst|specialist|consultant|associate|recruiter|marketing|sales|software|product|data|senior|junior|founder|owner|assistant|coordinator|head|director|business|development|export|revenue)(\s|$)/i;
// Words that smell like a company rather than a person.
const COMPANY_WORDS =
  /\b(corp|inc|ltd|llc|gmbh|technologies|technology|tech|labs?|group|solutions?|systems?|company|companies|university|universities|hospital|agency|studio|global|health|sciences?|partners?|digital|polytechnic|college|school|institute|academy|foundation|industries|industry)\b/i;

export function parseResumeText(text: string): ParsedContact {
  const rawEmail = text.match(EMAIL_RE)?.[0];
  const email = rawEmail ? rawEmail.replace(/\s+/g, "") : undefined;

  const phoneMatches = text.match(PHONE_RE);
  const phone = phoneMatches?.find((p) => {
    if (p.match(/\b\d{2}[./-]\d{2}[./-]\d{4}\b/)) return false;
    const digits = p.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  });

  let name = guessName(text);

  if (!name && email) {
    const localPart = email
      .split("@")[0]
      .replace(/[0-9_.-]+/g, " ")
      .trim();
    if (localPart) {
      name = localPart
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  return { email, phone, name };
}

export async function parseResumeContact(file: File): Promise<ParsedContact> {
  const res = await extractTextFromFile(file);
  if ("error" in res) return { error: res.error };
  return parseResumeText(res.text);
}

function guessName(text: string): string | undefined {
  const seen = new Set<string>();

  const rawLines = text
    .split(/\r?\n/)
    .slice(0, 30)
    .map((l) => {
      let clean = l.trim().replace(/^[#*>·•-]+\s*/, "");
      // If the line is highly fragmented single letters e.g. "K e v i n   S h e t h"
      // collapse single spaces between letters, but preserve double spaces as word boundaries
      if (/^([A-Za-z]\s+)+[A-Za-z]$/.test(clean)) {
        clean = clean.replace(/([A-Za-z]) (?! )/g, "$1").replace(/\s{2,}/g, " ");
      }
      return clean;
    });

  const mergedLines: string[] = [];
  let buffer: string[] = [];

  for (const line of rawLines) {
    if (!line) continue;
    if (
      line.indexOf(" ") === -1 &&
      /^[A-Z][a-zA-Z]*$/.test(line) &&
      !SKIP_LINE_RE.test(line) &&
      !JOB_WORDS.test(line) &&
      !COMPANY_WORDS.test(line)
    ) {
      buffer.push(line);
      if (buffer.length === 2) {
        mergedLines.push(buffer.join(" "));
        buffer = [];
      }
    } else {
      if (buffer.length > 0) {
        mergedLines.push(...buffer);
        buffer = [];
      }
      mergedLines.push(line);
    }
  }
  if (buffer.length > 0) mergedLines.push(...buffer);

  for (const raw of mergedLines) {
    const line = raw.replace(/\s*[|,\-—]\s*.*$/, "");

    if (!line || line.length > 60) continue;
    if (SKIP_LINE_RE.test(line)) continue;

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-z][\w'.-]*$/.test(w))) continue;
    if (!words.every((w) => /^[A-Z]/.test(w))) continue;
    if (JOB_WORDS.test(line) || COMPANY_WORDS.test(line)) continue;

    const key = words.join(" ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (words.every((w) => w === w.toUpperCase())) {
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }

    return words.join(" ");
  }
  return undefined;
}
