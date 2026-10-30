import { describe, expect, it } from "vitest";
import { applicationIntakeSchema, updateApplicationContactSchema } from "./schemas";

describe("Application Schemas - WhatsApp Opt-In Default", () => {
  it("defaults whatsapp_opt_in to true in applicationIntakeSchema when omitted", () => {
    const parsed = applicationIntakeSchema.parse({
      campaign_id: "11111111-1111-1111-1111-111111111111",
      candidate_name: "John Doe",
      candidate_email: "john@example.com",
      resume_path: "resumes/sample.pdf",
      resume_text: "Software Engineer with 5 years experience.",
    });

    expect(parsed.whatsapp_opt_in).toBe(true);
  });

  it("respects explicit false for whatsapp_opt_in in applicationIntakeSchema", () => {
    const parsed = applicationIntakeSchema.parse({
      campaign_id: "11111111-1111-1111-1111-111111111111",
      candidate_name: "John Doe",
      candidate_email: "john@example.com",
      resume_path: "resumes/sample.pdf",
      resume_text: "Software Engineer with 5 years experience.",
      whatsapp_opt_in: false,
    });

    expect(parsed.whatsapp_opt_in).toBe(false);
  });

  it("defaults whatsapp_opt_in to true in updateApplicationContactSchema when omitted", () => {
    const parsed = updateApplicationContactSchema.parse({
      application_id: "22222222-2222-2222-2222-222222222222",
      candidate_name: "Jane Smith",
      candidate_email: "jane@example.com",
    });

    expect(parsed.whatsapp_opt_in).toBe(true);
  });

  it("respects explicit false for whatsapp_opt_in in updateApplicationContactSchema", () => {
    const parsed = updateApplicationContactSchema.parse({
      application_id: "22222222-2222-2222-2222-222222222222",
      candidate_name: "Jane Smith",
      candidate_email: "jane@example.com",
      whatsapp_opt_in: false,
    });

    expect(parsed.whatsapp_opt_in).toBe(false);
  });
});
