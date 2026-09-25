import { describe, expect, it } from "vitest";
import { parseResumeText } from "./parse-resume";

describe("parseResumeText", () => {
  const SAMPLE = `Sarah Johnson
Senior Product Designer
sarah.johnson@example.com | +1 (415) 555-0132 | San Francisco, CA
https://linkedin.com/in/sarahjohnson

SUMMARY
Product designer with 8 years of experience...

EXPERIENCE
Senior Product Designer, Acme Corp (2020-present)
...`;

  it("extracts email, phone, and name from a plain-text resume", () => {
    const parsed = parseResumeText(SAMPLE);
    expect(parsed.email).toBe("sarah.johnson@example.com");
    expect(parsed.phone).toBe("+1 (415) 555-0132");
    expect(parsed.name).toBe("Sarah Johnson");
  });

  it.each([
    ["(415) 555-0132", "(415) 555-0132"],
    ["415-555-0132", "415-555-0132"],
    ["415.555.0132", "415.555.0132"],
    ["+44 20 7946 0958", "+44 20 7946 0958"],
    ["call me: 555-0109", "555-0109"],
  ])("extracts phone %s", (input, expected) => {
    const text = `Emily Rodriguez\n${input}\nemily@acme.io\n...`;
    expect(parseResumeText(text).phone).toBe(expected);
  });

  it("handles resumes where contact is at the top without labels", () => {
    const text = `Michael Chen
555-0109
mchen@startup.io
Full Stack Developer
...`;
    const parsed = parseResumeText(text);
    expect(parsed.email).toBe("mchen@startup.io");
    expect(parsed.phone).toBe("555-0109");
    expect(parsed.name).toBe("Michael Chen");
  });

  it("skips job titles and section headers when guessing the name", () => {
    const text = `John Smith
Lead Engineer
Web Developer at Somewhere LLC
+1 (917) 555-0144
webdev@noreply.co
EXPERIENCE
Web Developer, Acme Corp
...`;
    const parsed = parseResumeText(text);
    expect(parsed.email).toBe("webdev@noreply.co");
    expect(parsed.phone).toBe("+1 (917) 555-0144");
    expect(parsed.name).toBe("John Smith");
  });

  it("returns no contact for text without any", () => {
    const parsed = parseResumeText(
      "This resume has neither an address book entry nor digits beyond 2023.",
    );
    expect(parsed.email).toBeUndefined();
    expect(parsed.phone).toBeUndefined();
    expect(parsed.name).toBeUndefined();
  });

  it("extracts a name from a PDF-style layout with preserved line breaks", () => {
    // Reconstructed from a real run-on PDF where the checker previously
    // surfaced the filename instead of the person's name.
    const text = `Aqib Firdous Khan
Full Stack Developer
aqibfirdous93@gmail.com
7780874496
Islamabad, Pakistan
...
PROJECTS
...`;
    const parsed = parseResumeText(text);
    expect(parsed.name).toBe("Aqib Firdous Khan");
    expect(parsed.email).toBe("aqibfirdous93@gmail.com");
    expect(parsed.phone).toBe("7780874496");
  });
});
