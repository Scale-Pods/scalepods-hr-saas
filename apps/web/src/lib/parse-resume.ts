import { extractTextFromFile } from "./extract-text";

export interface ParsedContact {
  email?: string;
  phone?: string;
  name?: string;
  /** Set when the file's text couldn't be read (e.g. scanned PDF). */
  error?: string;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
// Plain phone heuristics: optional country code, optional area-code parens.
// Handles +1 (415) 555-0132, (415) 555-0132, 415-555-0132, 555-0109,
// and +44 20 7946 0958. The final 4-digit group is optional so 7-digit
// local numbers still match.
const PHONE_RE =
  /(?<![\d])(?:\+\d{1,3}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d{3,4}(?:[\s.-]?\d{4})?(?![\d])/;
// Lines that are never a candidate name (common header/section titles).
const SKIP_LINE_RE =
  /@|www\.|http|tel:|linkedin|github|summary|profile|objective|education|experience|skills|contact|address|resume|curriculum|reference|available|\bdate\b|\bcreated\b|\bupdated\b|^email|^phone|^name\b/i;
// Words that smell like a job title rather than a person.
const JOB_WORDS =
  /(^|\s)(intern|engineer|developer|designer|manager|architect|lead|analyst|specialist|consultant|associate|recruiter|marketing|sales|software|product|data|senior|junior|founder|owner|assistant|coordinator|head|director)(\s|$)/i;
// Words that smell like a company rather than a person.
const COMPANY_WORDS =
  /\b(corp|inc|ltd|llc|gmbh|technolog|tech|lab|group|solution|system|compan|universit|hospital|agency|studio|global|health|scienc|partner|digital)\b/i;

export function parseResumeText(text: string): ParsedContact {
  const email = text.match(EMAIL_RE)?.[0];
  const phone = text.match(PHONE_RE)?.[0];
  return { email, phone, name: guessName(text) };
}

/**
 * Extract email / phone / probable name straight from the file's text so the
 * uploader can prefill them (the user can still edit any value). The backend
 * keeps full control - n8n workflow 1 re-extracts whatever it needs server-side.
 */
export async function parseResumeContact(file: File): Promise<ParsedContact> {
  const res = await extractTextFromFile(file);
  if ("error" in res) return { error: res.error };
  return parseResumeText(res.text);
}

function guessName(text: string): string | undefined {
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/).slice(0, 20)) {
    const line = raw.trim().replace(/^[#*>·•-]+\s*/, "");
    if (!line || line.length > 60) continue;
    if (SKIP_LINE_RE.test(line)) continue;

    const words = line.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-z][\w'.-]*$/.test(w))) continue;
    if (!words.every((w) => /^[A-Z]/.test(w))) continue;
    if (JOB_WORDS.test(line) || COMPANY_WORDS.test(line)) continue;

    const key = words.join(" ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    return words.join(" ");
  }
  return undefined;
}
