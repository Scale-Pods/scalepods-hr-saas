import fs from "fs";
import path from "path";
import zlib from "zlib";

function decodeAscii85(a: string): Buffer {
  let s = a.replace(/\s+/g, "");
  if (s.startsWith("<~")) s = s.slice(2);
  if (s.endsWith("~>")) s = s.slice(0, -2);
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 122 && count === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 33 || c > 117) continue;
    tuple = tuple * 85 + (c - 33);
    count++;
    if (count === 5) {
      out.push((tuple >> 24) & 255, (tuple >> 16) & 255, (tuple >> 8) & 255, tuple & 255);
      tuple = 0;
      count = 0;
    }
  }
  if (count > 0) {
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
    for (let i = 0; i < count - 1; i++) out.push((tuple >> ((3 - i) * 8)) & 255);
  }
  return Buffer.from(out);
}

export interface OfferPdfData {
  candidate_name: string;
  position_title: string;
  salary: string;
  currency?: string;
  start_date?: string;
  company_name?: string;
  signatory_name?: string;
  signatory_title?: string;
  ref_no?: string;
  issue_date?: string;
}

export function generateBrandedOfferPdf(data: OfferPdfData): Buffer {
  const templatePath = path.join(
    process.cwd(),
    "public",
    "brand",
    "ScalePods_Offer_Letter_TEMPLATE.pdf",
  );

  let templateBuffer: Buffer;
  try {
    templateBuffer = fs.readFileSync(templatePath);
  } catch {
    // Fallback if running in standalone bundle or alternate directory
    const altPath = path.join(
      process.cwd(),
      "apps",
      "web",
      "public",
      "brand",
      "ScalePods_Offer_Letter_TEMPLATE.pdf",
    );
    templateBuffer = fs.readFileSync(altPath);
  }

  const isIntern = (data.position_title || "").toLowerCase().includes("intern");
  const role = data.position_title || "Ai Automation Intern";
  const companyName = data.company_name || "ScalePods Technologies";
  const candidateName = data.candidate_name || "Candidate";
  const salary = data.salary || "10,000";
  const startDate = data.start_date || "09-11-2026";
  const refNo =
    data.ref_no ||
    `SP/${new Date().getFullYear()}/OFFER/${Math.floor(1000 + Math.random() * 9000)}`;
  const issueDate = data.issue_date || new Date().toISOString().split("T")[0];
  const signatoryName = data.signatory_name || "Manish";
  const signatoryTitle = data.signatory_title || "Head of Talent Acquisition";

  function processPage1(text: string): string {
    let s = text;
    s = s.split("{{COMPANY_NAME}}").join(companyName);
    s = s.split("{{COMPANY_WEBSITE}}").join("www.scalepods.tech");
    s = s.split("{{COMPANY_EMAIL}}").join("info@scalepods.tech");
    s = s.split("{{REF_NO}}").join(refNo);
    s = s.split("{{ISSUE_DATE}}").join(issueDate);
    s = s.split("{{CANDIDATE_NAME}}").join(candidateName);
    s = s.split("{{JOINING_DATE}}").join(startDate);
    s = s.split("{{ROLE}}").join(role);
    s = s.split("{{DURATION}}").join("6 Months");
    s = s.split("{{DEPARTMENT}}").join("AI & Automation");
    s = s.split("{{LOCATION}}").join("Remote");
    s = s.split("{{WORKING_DAYS}}").join("Mon - Fri (5 Days/Wk)");

    // Clear instruction headers & yellow/blue guidance boxes
    const toBlank = [
      "{{VARIABLE}} ",
      "= dynamic field \\227 replace at generation time. All highlighted fields are required inputs in the form/API.",
      "LETTERHEAD / LOGO AREA",
      "Attach client letterhead as background image (A4 JPG/PNG), or place company logo here. Variable:",
      "{{COMPANY_LOGO_PATH}}",
      "Show this section only when: ",
      "LETTER_TYPE = fulltime ",
      "\\256",
      " show 'APPOINTMENT LETTER'",
      " show 'INTERNSHIP APPOINTMENT LETTER'",
      "LETTER_TYPE = intern ",
      "LETTER_TYPE = fulltime",
      "LETTER_TYPE = intern",
    ];
    for (const m of toBlank) {
      s = s.split("(" + m + ") Tj").join("() Tj");
    }

    if (isIntern) {
      s = s.split("(APPOINTMENT LETTER) Tj").join("() Tj");
      s = s.split("(We are pleased to offer you the position of ) Tj").join("() Tj");
      s = s.split("(at ) Tj").join("() Tj");
      s = s
        .split(
          "(This offer reflects our confidence in your abilities and your potential to contribute to our growth.) Tj",
        )
        .join("() Tj");
      const tableRuns = [
        "2. Compensation & Benefits",
        "#",
        "Component",
        "1",
        "Basic Salary",
        "{{BASIC_SALARY}",
        "}",
        "{{BASIC_SALARY_",
        "ANNUAL}}",
        "2",
        "{{HRA}}",
        "{{HRA_ANNUAL}}",
        "3",
        "Special Allowance",
        "{{SPECIAL_ALLO",
        "WANCE}}",
        "WANCE_ANNUAL}",
      ];
      for (const t of tableRuns) {
        s = s.split("(" + t + ") Tj").join("() Tj");
      }
    }

    return s;
  }

  function processPage2(text: string): string {
    let s = text;
    s = s.split("{{COMPANY_NAME}}").join(companyName);
    s = s.split("{{COMPANY_WEBSITE}}").join("www.scalepods.tech");
    s = s.split("{{COMPANY_EMAIL}}").join("info@scalepods.tech");
    s = s.split("{{STIPEND_AMOUNT}}").join(salary);
    s = s.split("{{STIPEND_WORDS}}").join("Ten Thousand Rupees Only");
    s = s.split("{{DURATION}}").join("6 Months");

    const toBlank = [
      "Show this section only when: ",
      "Show incentive line only when INCENTIVE_NOTE is non-empty",
      "* Incentive / Variable Pay: ",
      "{{INCENTIVE_NOTE}}",
      "LETTER_TYPE = intern",
      "LETTER_TYPE = fulltime",
    ];
    for (const m of toBlank) {
      s = s.split("(" + m + ") Tj").join("() Tj");
    }

    if (isIntern) {
      const ctcRuns = [
        "Total",
        "CTC",
        "{{GROSS_MONTHL",
        "Y}}",
        "{{GROSS_ANNUAL",
        "}}",
        "* Gross Annual CTC: ",
        "INR ",
        "{{GROSS_ANNUAL}} ",
        " {{GROSS_ANNUAL_WORDS}} ",
      ];
      for (const t of ctcRuns) {
        s = s.split("(" + t + ") Tj").join("() Tj");
      }
      const empRuns = [
        "3. Employment Status",
        "* This is a ",
        "full-time",
        " position.",
        "* The first ",
        "{{PROBATION_PERIOD}} ",
        "will be a probationary period. Either party may terminate during probation with",
        "{{NOTICE_PERIOD}} ",
        "written notice.",
        "* On confirmation, standard notice period of ",
        "applies.",
      ];
      for (const e of empRuns) {
        s = s.split("(" + e + ") Tj").join("() Tj");
      }
    }

    return s;
  }

  function processPage3(text: string): string {
    let s = text;
    s = s.split("{{COMPANY_NAME}}").join(companyName);
    s = s.split("{{COMPANY_WEBSITE}}").join("www.scalepods.tech");
    s = s.split("{{COMPANY_EMAIL}}").join("info@scalepods.tech");
    s = s.split("{{SIGNATORY_NAME}}").join(signatoryName);
    s = s.split("{{SIGNATORY_TITLE}}").join(signatoryTitle);
    s = s.split("{{CANDIDATE_NAME}}").join(candidateName);
    s = s.split("{{ROLE}}").join(role);

    const toBlank = [
      "Show this section only when: ",
      "LETTER_TYPE = fulltime",
      "LETTER_TYPE = intern",
    ];
    for (const m of toBlank) {
      s = s.split("(" + m + ") Tj").join("() Tj");
    }

    if (isIntern) {
      const termRuns = [
        "Either party may terminate this engagement with ",
        "{{NOTICE_PERIOD}} ",
        "prior written notice",
      ];
      for (const tr of termRuns) {
        s = s.split("(" + tr + ") Tj").join("() Tj");
      }
    }

    return s;
  }

  const str = templateBuffer.toString("latin1");
  const obj14Start = str.indexOf("\n14 0 obj");
  const headerPart = templateBuffer.slice(0, obj14Start + 1);

  function getStreamData(objNum: number): string {
    const objTag = `${objNum} 0 obj`;
    const start = str.indexOf(objTag);
    let sStart = str.indexOf("stream", start) + 6;
    while (str.charCodeAt(sStart) === 10 || str.charCodeAt(sStart) === 13) sStart++;
    const end = str.indexOf("endstream", sStart);
    const raw = str.slice(sStart, end).trim();
    const d = decodeAscii85(raw);
    return zlib.inflateSync(d).toString("latin1");
  }

  const s14 = processPage1(getStreamData(14));
  const s15 = processPage2(getStreamData(15));
  const s16 = processPage3(getStreamData(16));

  const def14 = zlib.deflateSync(Buffer.from(s14, "latin1"));
  const def15 = zlib.deflateSync(Buffer.from(s15, "latin1"));
  const def16 = zlib.deflateSync(Buffer.from(s16, "latin1"));

  const o14 = Buffer.concat([
    Buffer.from(
      `14 0 obj\n<<\n/Filter /FlateDecode /Length ${def14.length}\n>>\nstream\n`,
      "latin1",
    ),
    def14,
    Buffer.from(`\nendstream\nendobj\n`, "latin1"),
  ]);
  const o15 = Buffer.concat([
    Buffer.from(
      `15 0 obj\n<<\n/Filter /FlateDecode /Length ${def15.length}\n>>\nstream\n`,
      "latin1",
    ),
    def15,
    Buffer.from(`\nendstream\nendobj\n`, "latin1"),
  ]);
  const o16 = Buffer.concat([
    Buffer.from(
      `16 0 obj\n<<\n/Filter /FlateDecode /Length ${def16.length}\n>>\nstream\n`,
      "latin1",
    ),
    def16,
    Buffer.from(`\nendstream\nendobj\n`, "latin1"),
  ]);

  const xrefIdx = str.lastIndexOf("xref\n0 17\n");
  const xrefLines = str
    .slice(xrefIdx + 10, str.indexOf("trailer", xrefIdx))
    .trim()
    .split("\n");

  const parts = [headerPart];
  const offset14 = headerPart.length;
  parts.push(o14);
  const offset15 = offset14 + o14.length;
  parts.push(o15);
  const offset16 = offset15 + o15.length;
  parts.push(o16);
  const xrefOffset = offset16 + o16.length;

  let newXref = `xref\n0 17\n`;
  for (let i = 0; i < 14; i++) {
    newXref += xrefLines[i] + "\n";
  }
  newXref += String(offset14).padStart(10, "0") + " 00000 n \n";
  newXref += String(offset15).padStart(10, "0") + " 00000 n \n";
  newXref += String(offset16).padStart(10, "0") + " 00000 n \n";

  const trailerIdx = str.indexOf("trailer", xrefIdx);
  const trailerBlock = str.slice(trailerIdx, str.indexOf("startxref", trailerIdx));
  const newTrailer = `${newXref}${trailerBlock}startxref\n${xrefOffset}\n%%EOF\n`;

  parts.push(Buffer.from(newTrailer, "latin1"));
  return Buffer.concat(parts);
}
