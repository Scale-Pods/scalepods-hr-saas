import { describe, expect, it } from "vitest";
import {
  cleanOfferTemplateDirectives,
  extractAllOfferVariables,
  extractCustomOfferVariables,
  formatOfferVarLabel,
  generateStandardOfferLetterText,
  isOfferTemplatePlaceholder,
  renderOfferTemplateText,
} from "./offer-template-utils";
import { extractDocumentTextFromDocxXml, pruneDocxXmlConditions } from "./offers/prune-docx-xml";

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

  it("handles fallback deduplication for templates where directives were already stripped", () => {
    const strippedHtml = `<h2>APPOINTMENT LETTER</h2>
<h2>INTERNSHIP APPOINTMENT LETTER</h2>
<p>We are pleased to offer you the position of Software Engineer.</p>
<p>We are pleased to offer you a 3 months internship position of Software Engineer.</p>
<p><strong>2. Compensation &amp; Benefits</strong></p>
<table><tr><td>Basic Salary</td><td>50,000</td></tr></table>
<p>Gross Annual CTC: 6,00,000</p>
<p><strong>2. Compensation</strong></p>
<p>Monthly Stipend: 15,000</p>
<p><strong>3. Employment Status</strong></p>
<p>This is a full-time position with probation.</p>
<p><strong>3. Internship Status</strong></p>
<p>This is a full-time internship engagement.</p>
<p><strong>7. Termination</strong></p>
<p>Either party may terminate this engagement with 30 days prior written notice.</p>
<p>Either party may terminate this internship with 15 days prior written notice.</p>`;

    const intern = cleanOfferTemplateDirectives(strippedHtml, { isIntern: true });
    expect(intern).not.toContain("<h2>APPOINTMENT LETTER</h2>");
    expect(intern).toContain("<h2>INTERNSHIP APPOINTMENT LETTER</h2>");
    expect(intern).not.toContain("We are pleased to offer you the position of Software Engineer.");
    expect(intern).toContain("internship position");
    expect(intern).not.toContain("2. Compensation &amp; Benefits");
    expect(intern).toContain("Monthly Stipend: 15,000");
    expect(intern).not.toContain("3. Employment Status");
    expect(intern).toContain("3. Internship Status");
    expect(intern).not.toContain("30 days prior written notice");
    expect(intern).toContain("15 days prior written notice");

    const fulltime = cleanOfferTemplateDirectives(strippedHtml, { isIntern: false });
    expect(fulltime).toContain("<h2>APPOINTMENT LETTER</h2>");
    expect(fulltime).not.toContain("INTERNSHIP APPOINTMENT LETTER");
    expect(fulltime).toContain("We are pleased to offer you the position of Software Engineer.");
    expect(fulltime).not.toContain("internship position");
    expect(fulltime).toContain("2. Compensation &amp; Benefits");
    expect(fulltime).not.toContain("Monthly Stipend: 15,000");
    expect(fulltime).toContain("3. Employment Status");
    expect(fulltime).not.toContain("3. Internship Status");
    expect(fulltime).toContain("30 days prior written notice");
    expect(fulltime).not.toContain("15 days prior written notice");
  });

  it("prunes DOCX OpenXML conditions and elements for intern vs fulltime without external API", () => {
    const sampleXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
  <w:p><w:r><w:t>Ref: {{REF_NO}}</w:t></w:r></w:p>
  <w:p><w:r><w:t>Show this section only when: LETTER_TYPE = fulltime → show 'APPOINTMENT LETTER'</w:t></w:r></w:p>
  <w:p><w:r><w:t>APPOINTMENT LETTER</w:t></w:r></w:p>
  <w:p><w:r><w:t>Show this section only when: LETTER_TYPE = intern → show 'INTERNSHIP APPOINTMENT LETTER'</w:t></w:r></w:p>
  <w:p><w:r><w:t>INTERNSHIP APPOINTMENT LETTER</w:t></w:r></w:p>
  <w:p><w:r><w:t>Show this section only when: LETTER_TYPE = fulltime</w:t></w:r></w:p>
  <w:p><w:r><w:t>We are pleased to offer you the fulltime position.</w:t></w:r></w:p>
  <w:p><w:r><w:t>Show this section only when: LETTER_TYPE = intern</w:t></w:r></w:p>
  <w:p><w:r><w:t>We are pleased to offer you an internship position.</w:t></w:r></w:p>
  <w:p><w:r><w:t>TERMS OF ENGAGEMENT</w:t></w:r></w:p>
  <w:p><w:r><w:t>Show this section only when: LETTER_TYPE = fulltime</w:t></w:r></w:p>
  <w:p><w:r><w:t>2. Compensation &amp; Benefits</w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:t>Basic Salary</w:t></w:p></w:tc><w:tc><w:p><w:t>{{BASIC_SALARY}}</w:t></w:p></w:tc></w:tr></w:tbl>
  <w:p><w:r><w:t>• Gross Annual CTC: INR {{GROSS_ANNUAL}}</w:t></w:r></w:p>
  <w:p><w:r><w:t>Show this section only when: LETTER_TYPE = intern</w:t></w:r></w:p>
  <w:p><w:r><w:t>2. Compensation</w:t></w:r></w:p>
  <w:p><w:r><w:t>• Monthly Stipend: INR {{STIPEND_AMOUNT}}</w:t></w:r></w:p>
  <w:p><w:r><w:t>7. Termination</w:t></w:r></w:p>
  <w:p><w:r><w:t>Either party may terminate this engagement with 30 days notice.</w:t></w:r></w:p>
  <w:p><w:r><w:t>Either party may terminate this internship with 15 days notice.</w:t></w:r></w:p>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
</w:body>
</w:document>`;

    const internPruned = pruneDocxXmlConditions(sampleXml, {
      ROLE: "Sales and Marketing intern",
      LETTER_TYPE: "intern",
      STIPEND_AMOUNT: "8000",
    });

    expect(internPruned).not.toContain("<w:t>APPOINTMENT LETTER</w:t>");
    expect(internPruned).toContain("<w:t>INTERNSHIP APPOINTMENT LETTER</w:t>");
    expect(internPruned).not.toContain("We are pleased to offer you the fulltime position.");
    expect(internPruned).toContain("We are pleased to offer you an internship position.");
    expect(internPruned).not.toContain("2. Compensation &amp; Benefits");
    expect(internPruned).not.toContain("<w:tbl");
    expect(internPruned).toContain("2. Compensation");
    expect(internPruned).toContain("Monthly Stipend");
    expect(internPruned).not.toContain("30 days notice");
    expect(internPruned).toContain("15 days notice");
    expect(internPruned).not.toContain("Show this section only when");

    const fulltimePruned = pruneDocxXmlConditions(sampleXml, {
      ROLE: "Software Engineer",
      LETTER_TYPE: "fulltime",
      BASIC_SALARY: "50000",
    });

    expect(fulltimePruned).toContain("APPOINTMENT LETTER");
    expect(fulltimePruned).not.toContain("INTERNSHIP APPOINTMENT LETTER");
    expect(fulltimePruned).toContain("We are pleased to offer you the fulltime position.");
    expect(fulltimePruned).not.toContain("We are pleased to offer you an internship position.");
    expect(fulltimePruned).toContain("2. Compensation &amp; Benefits");
    expect(fulltimePruned).toContain("<w:tbl");
    expect(fulltimePruned).not.toContain("Monthly Stipend");
    expect(fulltimePruned).toContain("30 days notice");
    expect(fulltimePruned).not.toContain("15 days notice");
    expect(fulltimePruned).not.toContain("Show this section only when");
  });

  it("extracts real template text and tables from DOCX XML without [Raw DOCX Template]", () => {
    const sampleXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
  <w:p><w:r><w:t>Ref: {{REF_NO}} | Date: {{ISSUE_DATE}}</w:t></w:r></w:p>
  <w:p><w:r><w:t>INTERNSHIP APPOINTMENT LETTER</w:t></w:r></w:p>
  <w:p><w:r><w:t>Dear {{CANDIDATE_NAME}},</w:t></w:r></w:p>
  <w:p><w:r><w:t>We are pleased to offer you a {{DURATION}} internship as {{ROLE}}.</w:t></w:r></w:p>
  <w:p><w:r><w:t>2. Compensation</w:t></w:r></w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:t>#</w:t></w:p></w:tc><w:tc><w:p><w:t>Component</w:t></w:p></w:tc><w:tc><w:p><w:t>Monthly</w:t></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:t>1</w:t></w:p></w:tc><w:tc><w:p><w:t>Stipend</w:t></w:p></w:tc><w:tc><w:p><w:t>{{STIPEND_AMOUNT}}</w:t></w:p></w:tc></w:tr>
  </w:tbl>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
</w:body>
</w:document>`;

    const text = extractDocumentTextFromDocxXml(sampleXml, {
      REF_NO: "SP/2026/01",
      ISSUE_DATE: "Nov 17, 2026",
      CANDIDATE_NAME: "Manish Gandla",
      DURATION: "6 Months",
      ROLE: "Sales and Marketing intern",
      STIPEND_AMOUNT: "8000",
    });

    expect(text).not.toContain("[Raw DOCX Template]");
    expect(text).toContain("Ref: SP/2026/01 | Date: Nov 17, 2026");
    expect(text).toContain("Dear Manish Gandla,");
    expect(text).toContain("6 Months internship as Sales and Marketing intern");
    expect(text).toContain("| # | Component | Monthly |");
    expect(text).toContain("| 1 | Stipend | 8000 |");
  });

  it("identifies template placeholders correctly via isOfferTemplatePlaceholder", () => {
    expect(isOfferTemplatePlaceholder(null)).toBe(true);
    expect(isOfferTemplatePlaceholder("")).toBe(true);
    expect(isOfferTemplatePlaceholder("[Raw DOCX Template]")).toBe(true);
    expect(isOfferTemplatePlaceholder("[Reusable DOCX Template]")).toBe(true);
    expect(isOfferTemplatePlaceholder("[Finished Letter]")).toBe(true);
    expect(isOfferTemplatePlaceholder("[Finished Letter - Sent As-Is]")).toBe(true);
    expect(
      isOfferTemplatePlaceholder(
        "Employment Offer & Agreement\n\nDear John,\n\nWe are pleased to extend this offer",
      ),
    ).toBe(true);
    expect(
      isOfferTemplatePlaceholder("APPOINTMENT LETTER\n\nDear Harika Adepu,\n\nTERMS OF ENGAGEMENT"),
    ).toBe(false);
  });

  it("generates full structured ScalePods offer letter text matching dashboard view", () => {
    const fulltimeLetter = generateStandardOfferLetterText({
      isIntern: false,
      candidateName: "Adepu Harika",
      positionTitle: "ML Engineer",
      companyName: "ScalePods Partner",
      salary: "60000",
      currency: "INR",
      refNo: "SP/2026/OFFER/101",
      issueDate: "November 19, 2026",
      joiningDate: "09 November 2026",
      signatoryName: "Manish",
      signatoryTitle: "Talent Acquisition Lead",
    });

    expect(fulltimeLetter).toContain("Ref: SP/2026/OFFER/101");
    expect(fulltimeLetter).toContain("Date: November 19, 2026");
    expect(fulltimeLetter).toContain("Dear Adepu Harika, | Starting Date: 09 November 2026");
    expect(fulltimeLetter).toContain("APPOINTMENT LETTER");
    expect(fulltimeLetter).toContain("TERMS OF ENGAGEMENT");
    expect(fulltimeLetter).toContain("1. Role & Scope");
    expect(fulltimeLetter).toContain("You will be engaged as ML Engineer.");
    expect(fulltimeLetter).toContain("2. Compensation & Benefits");
    expect(fulltimeLetter).toContain(
      "Your gross annual compensation will be INR 60000 /- (Sixty Thousand Rupees Only)",
    );
    expect(fulltimeLetter).toContain("3. Working Hours & Leave");
    expect(fulltimeLetter).toContain("4. Confidentiality");
    expect(fulltimeLetter).toContain("5. Intellectual Property");
    expect(fulltimeLetter).toContain("6. Code of Conduct");
    expect(fulltimeLetter).toContain("7. Termination");
    expect(fulltimeLetter).toContain("For ScalePods Partner");
    expect(fulltimeLetter).toContain("Manish");
    expect(fulltimeLetter).toContain("Talent Acquisition Lead");
    expect(fulltimeLetter).toContain("ACKNOWLEDGEMENT");
    expect(fulltimeLetter).toContain("I, Adepu Harika, accept the above terms");
    expect(fulltimeLetter).toContain(
      "| Signature: __________________ | Date: __________________ | Place: __________________ |",
    );
  });

  it("replaces square-bracketed placeholders like [COMPANY NAME], [Company Website], and [HR Email Address]", () => {
    const rawTemplate = `[COMPANY NAME]
[Company Address]
[Company Website] | [HR Email Address]
Dear [Candidate Name],
We offer you [Role] with salary [Salary].
Sincerely,
[HR Manager Name]
[Company Name]`;

    const rendered = renderOfferTemplateText(rawTemplate, {
      COMPANY_NAME: "ScalePods",
      COMPANY_WEBSITE: "https://www.scalepods.co",
      HR_EMAIL_ADDRESS: "aqib@scalepods.tech",
      CANDIDATE_NAME: "Harika Adepu",
      ROLE: "Frontend Developer",
      SALARY: "₹4,00,000",
      HR_MANAGER_NAME: "Aqib Firdous Khan",
    });

    expect(rendered).toContain("ScalePods");
    expect(rendered).toContain("https://www.scalepods.co");
    expect(rendered).toContain("aqib@scalepods.tech");
    expect(rendered).toContain("Harika Adepu");
    expect(rendered).toContain("Frontend Developer");
    expect(rendered).toContain("₹4,00,000");
    expect(rendered).toContain("Aqib Firdous Khan");
    expect(rendered).not.toContain("[COMPANY NAME]");
    expect(rendered).not.toContain("[Company Website]");
    expect(rendered).not.toContain("[HR Email Address]");
  });

  it("preserves all sections of standard offer letter when isIntern is true", () => {
    const template = `{{COMPANY_NAME}}
{{COMPANY_ADDRESS}}
{{COMPANY_WEBSITE}} | {{HR_EMAIL_ADDRESS}}
Date: {{OFFER_DATE}}

OFFER OF EMPLOYMENT
To, {{CANDIDATE_NAME}}
Email: {{CANDIDATE_EMAIL}}
{{CANDIDATE_LOCATION}}

Subject: Offer of Employment for the Position of {{ROLE}}

Dear {{CANDIDATE_NAME}},

We are pleased to offer you the position of {{ROLE}} at {{COMPANY_NAME}}. Based on your qualifications, technical knowledge, and potential, we believe you would be a valuable addition to our organization.

We are excited about the possibility of having you join our team and contribute to our software development projects.

1. Employment Details
Designation: {{ROLE}}
Department: {{DEPARTMENT}}
Employment Type: {{EMPLOYMENT_TYPE}}
Work Location: {{WORK_LOCATION}}
Date of Joining: {{JOINING_DATE}}
Reporting To: {{REPORTING_TO}}

2. Compensation
Your annual Cost to Company (CTC) will be {{SALARY}} ({{SALARY_WORDS}}).
The salary will be paid {{PAYMENT_FREQUENCY}}, subject to applicable statutory deductions.

3. Roles and Responsibilities
Your responsibilities will include:
- Developing responsive and user-friendly web applications.
- Collaborating with team members.

4. Terms and Conditions
You will undergo a probation period of {{PROBATION_PERIOD}}.

5. Acceptance of Offer
Sincerely,
{{HR_MANAGER_NAME}}
{{COMPANY_NAME}}
{{HR_CONTACT_DETAILS}}

CANDIDATE ACCEPTANCE
I, {{CANDIDATE_NAME}}, hereby accept the offer of employment for the position of {{ROLE}} under the terms and conditions mentioned above.
Candidate Signature: ______________________
Date: ______________________`;

    const cleaned = cleanOfferTemplateDirectives(template, { isIntern: true });
    expect(cleaned).toContain("1. Employment Details");
    expect(cleaned).toContain("2. Compensation");
    expect(cleaned).toContain("3. Roles and Responsibilities");
    expect(cleaned).toContain("4. Terms and Conditions");
    expect(cleaned).toContain("5. Acceptance of Offer");

    const rendered = renderOfferTemplateText(template, {
      COMPANY_NAME: "Scalepods",
      COMPANY_ADDRESS: "GCR, Road No 3, Mumbai",
      COMPANY_WEBSITE: "https://www.scalepods.co",
      HR_EMAIL_ADDRESS: "aqib@scalepods.tech",
      OFFER_DATE: "20-11-2026",
      CANDIDATE_NAME: "Manish Gandla",
      CANDIDATE_EMAIL: "manishgandla22@gmail.com",
      CANDIDATE_LOCATION: "Remote",
      ROLE: "AI Automation Intern",
      DEPARTMENT: "Engineering",
      EMPLOYMENT_TYPE: "Internship",
      WORK_LOCATION: "Remote",
      JOINING_DATE: "04-12-2026",
      REPORTING_TO: "Aqib Firdous Khan",
      SALARY: "5000",
      SALARY_WORDS: "Five Thousand Only",
      PAYMENT_FREQUENCY: "1st to 3rd of each month",
      PROBATION_PERIOD: "3 Months",
      HR_MANAGER_NAME: "Aqib",
      HR_CONTACT_DETAILS: "aqib@scalepods.tech",
      LETTER_TYPE: "intern",
    });

    expect(rendered).toContain("Scalepods");
    expect(rendered).toContain("Manish Gandla");
    expect(rendered).toContain("AI Automation Intern");
    expect(rendered).toContain("1. Employment Details");
    expect(rendered).toContain("2. Compensation");
    expect(rendered).toContain("5000 (Five Thousand Only)");
    expect(rendered).toContain("3. Roles and Responsibilities");
    expect(rendered).toContain("4. Terms and Conditions");
    expect(rendered).toContain("5. Acceptance of Offer");
    expect(rendered).toContain("Aqib");
  });
});
