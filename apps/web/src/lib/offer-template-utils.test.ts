import { describe, expect, it } from "vitest";
import {
  cleanOfferTemplateDirectives,
  extractAllOfferVariables,
  extractCustomOfferVariables,
  formatOfferVarLabel,
  renderOfferTemplateText,
} from "./offer-template-utils";

describe("offer-template-utils", () => {
  it("extracts all and custom variables while keeping non-form fields like REF_NO and ISSUE_DATE", () => {
    const text =
      "Dear {{CANDIDATE_NAME}}, welcome as {{POSITION_TITLE}} in {{DEPARTMENT}} at {{LOCATION}}. Ref: {{REF_NO}}, Date: {{ ISSUE_DATE }}, Website: {{COMPANY_WEBSITE}}, Probation: {{probation_period}}, Legend: {{VARIABLE}}.";
    expect(extractAllOfferVariables(text)).toEqual([
      "CANDIDATE_NAME",
      "POSITION_TITLE",
      "DEPARTMENT",
      "LOCATION",
      "REF_NO",
      "ISSUE_DATE",
      "COMPANY_WEBSITE",
      "PROBATION_PERIOD",
      "VARIABLE",
    ]);
    expect(extractCustomOfferVariables(text)).toEqual([
      "DEPARTMENT",
      "LOCATION",
      "REF_NO",
      "ISSUE_DATE",
      "COMPANY_WEBSITE",
      "PROBATION_PERIOD",
    ]);
  });

  it("formats variable keys into readable labels", () => {
    expect(formatOfferVarLabel("REPORTING_MANAGER")).toBe("Reporting Manager");
    expect(formatOfferVarLabel("CTC_ANNUAL")).toBe("CTC Annual");
  });

  it("renders placeholders case-insensitively and tolerates PDF whitespace inside braces", () => {
    const template = "Hello {{ candidate_name }}, Dept: {{DEPARTMENT}}, Bonus: {{BONUS}}";
    const rendered = renderOfferTemplateText(template, {
      CANDIDATE_NAME: "Manish Sharma",
      DEPARTMENT: "AI & Automation",
      BONUS: "",
    });
    expect(rendered).toBe("Hello Manish Sharma, Dept: AI & Automation, Bonus: {{BONUS}}");
  });

  it("cleans template directives, legend notes, and conditional sections for intern vs fulltime", () => {
    const sample = `{{COMPANY_NAME}} | {{COMPANY_WEBSITE}}
{{VARIABLE}} = dynamic field — replace at generation time.
LETTERHEAD / LOGO AREA Attach client letterhead as background image.
Show this section only when: LETTER_TYPE = fulltime → show 'APPOINTMENT LETTER'
APPOINTMENT LETTER
Show this section only when: LETTER_TYPE = intern → show 'INTERNSHIP APPOINTMENT LETTER'
INTERNSHIP APPOINTMENT LETTER
Dear {{CANDIDATE_NAME}},
Show this section only when: LETTER_TYPE = fulltime
We are pleased to offer you the full-time position of {{ROLE}}.
Show this section only when: LETTER_TYPE = intern
We are pleased to offer you an internship position of {{ROLE}}.
TERMS OF ENGAGEMENT`;

    const internCleaned = cleanOfferTemplateDirectives(sample, { isIntern: true });
    expect(internCleaned).not.toContain("{{VARIABLE}} = dynamic field");
    expect(internCleaned).not.toContain("LETTERHEAD / LOGO AREA");
    expect(internCleaned).not.toContain("Show this section only when");
    expect(internCleaned).not.toContain("We are pleased to offer you the full-time position");
    expect(internCleaned).toContain("We are pleased to offer you an internship position");

    const fulltimeCleaned = cleanOfferTemplateDirectives(sample, { isIntern: false });
    expect(fulltimeCleaned).not.toContain("We are pleased to offer you an internship position");
    expect(fulltimeCleaned).toContain("We are pleased to offer you the full-time position");
  });

  it("preserves HTML tables and master template when cleaning without options", () => {
    const htmlSample = `<table><tr><td><p><strong>{{VARIABLE}}</strong> = dynamic field</p></td></tr></table>
<table><tr><td><p>Ref: <strong>{{REF_NO}}</strong></p></td><td><p>Date: <strong>{{ISSUE_DATE}}</strong></p></td></tr></table>
<table><tr><td><p><em>Show this section only when: LETTER_TYPE = fulltime</em></p></td></tr></table>
<p><strong>APPOINTMENT LETTER</strong></p>
<table><tr><td><p><em>Show this section only when: LETTER_TYPE = intern</em></p></td></tr></table>
<p><strong>INTERNSHIP APPOINTMENT LETTER</strong></p>
<table><tr><td><p>Dear <strong>{{CANDIDATE_NAME}}</strong>,</p></td></tr></table>`;

    const cleaned = cleanOfferTemplateDirectives(htmlSample);
    expect(cleaned).not.toContain("{{VARIABLE}} = dynamic field");
    expect(cleaned).toContain("Ref: <strong>{{REF_NO}}</strong>");
    expect(cleaned).toContain("Date: <strong>{{ISSUE_DATE}}</strong>");
    expect(cleaned).toContain("APPOINTMENT LETTER");
    expect(cleaned).toContain("INTERNSHIP APPOINTMENT LETTER");
    expect(cleaned).toContain("<table");
  });

  it("cleans HTML blocks for intern vs fulltime without breaking table structures", () => {
    const htmlSample = `<table><tr><td><p>Ref: <strong>{{REF_NO}}</strong></p></td></tr></table>
<table><tr><td><p><em>Show this section only when: LETTER_TYPE = fulltime → show 'APPOINTMENT LETTER'</em></p></td></tr></table>
<p><strong>APPOINTMENT LETTER</strong></p>
<table><tr><td><p><em>Show this section only when: LETTER_TYPE = intern → show 'INTERNSHIP APPOINTMENT LETTER'</em></p></td></tr></table>
<p><strong>INTERNSHIP APPOINTMENT LETTER</strong></p>
<table><tr><td><p><em>Show this section only when: LETTER_TYPE = fulltime</em></p></td></tr></table>
<p><strong>2. Compensation &amp; Benefits</strong></p>
<table><tr><td><p>Basic</p></td><td><p>{{BASIC_SALARY}}</p></td></tr></table>
<table><tr><td><p><em>Show this section only when: LETTER_TYPE = intern</em></p></td></tr></table>
<p><strong>2. Compensation</strong></p>
<p>Stipend: {{STIPEND_AMOUNT}}</p>`;

    const internHtml = cleanOfferTemplateDirectives(htmlSample, { isIntern: true });
    expect(internHtml).toContain("INTERNSHIP APPOINTMENT LETTER");
    expect(internHtml).not.toContain("<h2>APPOINTMENT LETTER</h2>");
    expect(internHtml).toContain("Stipend: {{STIPEND_AMOUNT}}");
    expect(internHtml).not.toContain("{{BASIC_SALARY}}");
    expect(internHtml).toContain("Ref: <strong>{{REF_NO}}</strong>");

    const fulltimeHtml = cleanOfferTemplateDirectives(htmlSample, { isIntern: false });
    expect(fulltimeHtml).toContain("APPOINTMENT LETTER");
    expect(fulltimeHtml).not.toContain("INTERNSHIP APPOINTMENT LETTER");
    expect(fulltimeHtml).not.toContain("Stipend: {{STIPEND_AMOUNT}}");
    expect(fulltimeHtml).toContain("{{BASIC_SALARY}}");
    expect(fulltimeHtml).toContain("Ref: <strong>{{REF_NO}}</strong>");
  });
});
