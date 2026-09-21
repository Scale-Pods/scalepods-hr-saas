import { describe, expect, it } from "vitest";
import { parseResumeText, parseResumeContact } from "./parse-resume";

const RESUME = `Sarah Jane Doe
email: sarah.doe@example.com
phone: (415) 555-0199
linkedin.com/in/sarahdoe
Software Engineer at Acme`;

describe("parseResumeText", () => {
  it("picks the email and phone out of a resume", () => {
    const parsed = parseResumeText(RESUME);
    expect(parsed.email).toBe("sarah.doe@example.com");
    expect(parsed.phone).toBe("(415) 555-0199");
  });

  it("guesses the name from the first clean capitalized line", () => {
    expect(parseResumeText(RESUME).name).toBe("Sarah Jane Doe");
  });

  it("skips job-title lines like 'Data Analyst' before naming the candidate", () => {
    const parsed = parseResumeText(`Data Analyst
John Smith
john.smith@corp.io
(212) 555-0134`);
    expect(parsed.name).toBe("John Smith");
  });

  it("returns contact but no name when nothing looks like a person", () => {
    const parsed = parseResumeText("ACME Corp\nwww.acme.com\nservice@acme.com");
    expect(parsed.email).toBe("service@acme.com");
    expect(parsed.name).toBeUndefined();
  });
});

describe("parseResumeContact", () => {
  it("extracts fields from a plain text resume file", async () => {
    const file = { name: "sarah-resume.txt", text: async () => RESUME } as unknown as File;
    const parsed = await parseResumeContact(file);
    expect(parsed).toMatchObject({ email: "sarah.doe@example.com", name: "Sarah Jane Doe" });
    expect(parsed.phone).toBeTruthy();
  });
});