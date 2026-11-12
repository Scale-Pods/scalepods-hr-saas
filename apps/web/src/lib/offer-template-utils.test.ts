import { describe, expect, it } from "vitest";
import {
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
});
