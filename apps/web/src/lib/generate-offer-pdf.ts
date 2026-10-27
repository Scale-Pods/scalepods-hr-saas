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

function formatIndianCurrency(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return s;
  const lastThree = s.slice(-3);
  const otherNumbers = s.slice(0, -3);
  return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
}

function numberToWords(num: number): string {
  num = Math.round(num);
  if (num === 0) return "Zero Rupees Only";
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function inWords(n: number): string {
    if (n < 20) return a[n];
    const tens = b[Math.floor(n / 10)];
    const unit = n % 10;
    return tens + (unit ? " " + a[unit] : "");
  }
  let words = "";
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = Math.floor(num / 100);
  const rest = num % 100;
  if (crore > 0) words += inWords(crore) + " Crore ";
  if (lakh > 0) words += inWords(lakh) + " Lakh ";
  if (thousand > 0) words += inWords(thousand) + " Thousand ";
  if (hundred > 0) words += inWords(hundred) + " Hundred ";
  if (rest > 0) words += inWords(rest) + " ";
  return words.trim() + " Rupees Only";
}

function formatDateString(val?: string): string {
  if (!val) return "";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return String(val);
}

function hideTjText(s: string, target: string): string {
  return s.split(`(${target}) Tj`).join("() Tj");
}

function cleanGeneralTemplateArtifacts(s: string): string {
  // Neutralize yellow, blue, and gray banner fills by replacing 're f*' with no-op 're n'
  s = s.replace(/1 \.952941 \.803922 rg\s*n [0-9. -]+ re f\*/g, "n 0 0 0 0 re");
  s = s.replace(/\.933333 \.956863 1 rg\s*n [0-9. -]+ re f\*/g, "n 0 0 0 0 re");
  s = s.replace(/\.941176 \.941176 \.941176 rg\s*n [0-9. -]+ re f\*/g, "n 0 0 0 0 re");

  // Neutralize banner border strokes by replacing the stroke commands with no-op 'n'
  s = s.replace(/1 \.756863 \.027451 RG[\s\S]*?n 511\.2756 0 m 511\.2756 25 l S/g, "n");
  s = s.replace(/\.101961 \.235294 \.431373 RG[\s\S]*?n 511\.2756 0 m 511\.2756 40 l S/g, "n");
  s = s.replace(/\.666667 \.666667 \.666667 RG[\s\S]*?n 511\.2756 0 m 511\.2756 21 l S/g, "n");

  // Blank all guidance / instruction banner texts
  s = hideTjText(s, "{{VARIABLE}} ");
  s = hideTjText(
    s,
    "= dynamic field \\227 replace at generation time. All highlighted fields are required inputs in the form/API.",
  );
  s = hideTjText(s, "LETTERHEAD / LOGO AREA");
  s = hideTjText(
    s,
    "Attach client letterhead as background image \\(A4 JPG/PNG\\), or place company logo here. Variable:",
  );
  s = hideTjText(s, "{{COMPANY_LOGO_PATH}}");
  s = hideTjText(s, "Show this section only when: ");
  s = hideTjText(s, "LETTER_TYPE = fulltime ");
  s = hideTjText(s, "LETTER_TYPE = fulltime");
  s = hideTjText(s, "LETTER_TYPE = intern ");
  s = hideTjText(s, "LETTER_TYPE = intern");
  s = hideTjText(s, "\\256");
  s = s.replace(/\( show '[^']*'\) Tj/g, "() Tj");
  s = hideTjText(s, "Show incentive line only when INCENTIVE_NOTE is non-empty");

  // Reset justified word spacing Tw to 0 Tw
  s = s.replace(/([0-9.-]+)\s+Tw/g, "0 Tw");
  // Replace template brown/yellow text color with crisp black text
  s = s.replace(/\.490196 \.290196 0 rg/g, "0 0 0 rg");

  return s;
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
  dynamic_variables?: Record<string, string>;
  [key: string]: unknown;
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
    // Fallback if running in standalone bundle or monorepo package root
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

  const isIntern =
    (data.position_title || "").toLowerCase().includes("intern") ||
    String(data.dynamic_variables?.LETTER_TYPE || "")
      .toLowerCase()
      .includes("intern") ||
    String(data.dynamic_variables?.letter_type || "")
      .toLowerCase()
      .includes("intern");

  const role = data.position_title || (isIntern ? "Ai Automation Intern" : "Full Stack Engineer");
  const companyName = data.company_name || "ScalePods Technologies";
  const candidateName = data.candidate_name || "Candidate";
  const rawSalary = String(data.salary || (isIntern ? "10000" : "1200000"));
  const numSalary = parseFloat(rawSalary.replace(/[^0-9.]/g, "")) || 0;
  const startDate = formatDateString(data.start_date || "2026-11-09");
  const refNo =
    data.ref_no ||
    `SP/${new Date().getFullYear()}/OFFER/${Math.floor(1000 + Math.random() * 9000)}`;
  const issueDate = formatDateString(data.issue_date || new Date().toISOString().split("T")[0]);
  const signatoryName = data.signatory_name || "Manish";
  const signatoryTitle = data.signatory_title || "Head of Talent Acquisition";
  const dynamicVars = (data.dynamic_variables || {}) as Record<string, string>;

  // Resolve dynamic variable overrides with clean sensible defaults
  const department = dynamicVars.DEPARTMENT || dynamicVars.department || "AI & Automation";
  const location = dynamicVars.LOCATION || dynamicVars.location || "Remote";
  const duration =
    dynamicVars.DURATION || dynamicVars.duration || (isIntern ? "6 Months" : "Full-time");
  const workingDays =
    dynamicVars.WORKING_DAYS || dynamicVars.working_days || "Mon - Fri (5 Days/Wk)";
  const probationPeriod =
    dynamicVars.PROBATION_PERIOD || dynamicVars.probation_period || "3 Months";
  const noticePeriod =
    dynamicVars.NOTICE_PERIOD || dynamicVars.notice_period || (isIntern ? "15 Days" : "30 Days");
  const incentiveNote = dynamicVars.INCENTIVE_NOTE || dynamicVars.incentive_note || "";

  // Salary calculations and breakdown
  const annualGross = numSalary >= 100000 ? numSalary : numSalary > 0 ? numSalary * 12 : 600000;
  const monthlyGross = Math.round(annualGross / 12);
  const basicAnnual = Math.round(annualGross * 0.5);
  const basicMonthly = Math.round(basicAnnual / 12);
  const hraAnnual = Math.round(annualGross * 0.2);
  const hraMonthly = Math.round(hraAnnual / 12);
  const specialAnnual = annualGross - basicAnnual - hraAnnual;
  const specialMonthly = monthlyGross - basicMonthly - hraMonthly;

  const grossAnnualStr = dynamicVars.GROSS_ANNUAL || formatIndianCurrency(annualGross);
  const grossMonthlyStr = dynamicVars.GROSS_MONTHLY || formatIndianCurrency(monthlyGross);
  const grossAnnualWordsStr = dynamicVars.GROSS_ANNUAL_WORDS || numberToWords(annualGross);
  const basicMonthlyStr = dynamicVars.BASIC_SALARY || formatIndianCurrency(basicMonthly);
  const basicAnnualStr = dynamicVars.BASIC_SALARY_ANNUAL || formatIndianCurrency(basicAnnual);
  const hraMonthlyStr = dynamicVars.HRA || formatIndianCurrency(hraMonthly);
  const hraAnnualStr = dynamicVars.HRA_ANNUAL || formatIndianCurrency(hraAnnual);
  const specialMonthlyStr = dynamicVars.SPECIAL_ALLOWANCE || formatIndianCurrency(specialMonthly);
  const specialAnnualStr =
    dynamicVars.SPECIAL_ALLOWANCE_ANNUAL || formatIndianCurrency(specialAnnual);

  const stipendNum = numSalary > 0 ? numSalary : 10000;
  const stipendAmountStr = dynamicVars.STIPEND_AMOUNT || formatIndianCurrency(stipendNum);
  const stipendWordsStr = dynamicVars.STIPEND_WORDS || numberToWords(stipendNum);

  function applyCustomDynamicReplacements(text: string): string {
    let s = text;
    for (const [k, v] of Object.entries(dynamicVars)) {
      if (v != null && v !== "") {
        const cleanKey = k.replace(/[{}]/g, "").trim().toUpperCase();
        s = s.split(`{{${cleanKey}}}`).join(String(v));
        s = s.split(`{{${k}}}`).join(String(v));
      }
    }
    return s;
  }

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
    s = s.split("{{DURATION}}").join(duration);
    s = s.split("{{DEPARTMENT}}").join(department);
    s = s.split("{{LOCATION}}").join(location);
    s = s.split("{{WORKING_DAYS}}").join(workingDays);
    s = applyCustomDynamicReplacements(s);

    if (isIntern) {
      // Hide fulltime title & opening paragraph
      s = hideTjText(s, "APPOINTMENT LETTER");
      s = hideTjText(s, "We are pleased to offer you the position of ");
      s = hideTjText(s, "at ");
      s = hideTjText(
        s,
        "This offer reflects our confidence in your abilities and your potential to contribute to our growth.",
      );

      // Hide entire Section 2 compensation table on Page 1
      s = hideTjText(s, "2. Compensation & Benefits");
      s = hideTjText(s, "#");
      s = hideTjText(s, "Component");
      s = hideTjText(s, "Monthly \\(INR\\)");
      s = hideTjText(s, "Annual \\(INR\\)");
      s = hideTjText(s, "1");
      s = hideTjText(s, "Basic Salary");
      s = hideTjText(s, "2");
      s = hideTjText(s, "House Rent Allowance \\(HRA\\)");
      s = hideTjText(s, "3");
      s = hideTjText(s, "Special Allowance");
      s = hideTjText(s, "{{BASIC_SALARY}");
      s = hideTjText(s, "{{BASIC_SALARY_");
      s = hideTjText(s, "ANNUAL}}");
      s = hideTjText(s, "{{HRA}}");
      s = hideTjText(s, "{{HRA_ANNUAL}}");
      s = hideTjText(s, "{{SPECIAL_ALLO");
      s = hideTjText(s, "WANCE}}");
      s = hideTjText(s, "WANCE_ANNUAL}");

      // Neutralize table grid lines on page 1 without removing q/Q
      s = s.replace(/n 411\.2756 0 m 411\.2756 137 l S/g, "n");
      s = s.replace(/n [0-9.]+ 0 m [0-9.]+ 137 l S/g, "n");
    } else {
      // Hide intern title & opening paragraph
      s = hideTjText(s, "INTERNSHIP APPOINTMENT LETTER");
      s = hideTjText(s, "We are pleased to offer you a ");
      s = hideTjText(s, "internship");
      s = hideTjText(s, " position with ");
      s = hideTjText(s, "in the capacity of ");
      s = hideTjText(
        s,
        ". This offer is extended with confidence in your skills and enthusiasm to",
      );
      s = hideTjText(s, "contribute meaningfully to our initiatives.");

      // Populate table cells
      s = s.replace(/\(\{\{BASIC_SALARY\}\}\) Tj/g, `(${basicMonthlyStr}) Tj`);
      s = s.replace(/\(\{\{BASIC_SALARY\}\) Tj/g, `(${basicMonthlyStr}) Tj`);
      s = s.replace(/\(\{\{BASIC_SALARY_\) Tj/g, `(${basicAnnualStr}) Tj`);
      s = hideTjText(s, "ANNUAL}}");
      s = s.replace(/\(\{\{HRA\}\}\) Tj/g, `(${hraMonthlyStr}) Tj`);
      s = s.replace(/\(\{\{HRA_ANNUAL\}\}\) Tj/g, `(${hraAnnualStr}) Tj`);
      s = s.replace(/\(\{\{SPECIAL_ALLO\) Tj/, `(${specialMonthlyStr}) Tj`);
      s = hideTjText(s, "WANCE}}");
      s = s.replace(/\(\{\{SPECIAL_ALLO\) Tj/, `(${specialAnnualStr}) Tj`);
      s = hideTjText(s, "WANCE_ANNUAL}");
    }

    s = s.split("(}) Tj").join("() Tj");
    s = cleanGeneralTemplateArtifacts(s);
    return s;
  }

  function processPage2(text: string): string {
    let s = text;
    s = s.split("{{COMPANY_NAME}}").join(companyName);
    s = s.split("{{COMPANY_WEBSITE}}").join("www.scalepods.tech");
    s = s.split("{{COMPANY_EMAIL}}").join("info@scalepods.tech");
    s = s.split("{{DURATION}}").join(duration);
    s = s.split("{{PROBATION_PERIOD}}").join(probationPeriod);
    s = s.split("{{NOTICE_PERIOD}}").join(noticePeriod);
    s = applyCustomDynamicReplacements(s);

    if (isIntern) {
      // Strip Total CTC table row
      s = hideTjText(s, "Total");
      s = hideTjText(s, "CTC");
      s = hideTjText(s, "{{GROSS_MONTHL");
      s = hideTjText(s, "Y}}");
      s = hideTjText(s, "{{GROSS_ANNUAL");
      s = hideTjText(s, "}}");
      s = hideTjText(s, "* Gross Annual CTC: ");
      s = hideTjText(s, "INR ");
      s = hideTjText(s, "{{GROSS_ANNUAL}} ");
      s = hideTjText(s, "/- \\(");
      s = hideTjText(s, " {{GROSS_ANNUAL_WORDS}} ");
      s = hideTjText(s, "\\)");
      s = hideTjText(s, "* Incentive / Variable Pay: ");
      s = hideTjText(s, "{{INCENTIVE_NOTE}}");
      s = hideTjText(s, "3. Employment Status");
      s = hideTjText(s, "* This is a ");
      s = hideTjText(s, "full-time");
      s = hideTjText(s, " position.");
      s = hideTjText(s, "* The first ");
      s = hideTjText(
        s,
        "will be a probationary period. Either party may terminate during probation with",
      );
      s = hideTjText(s, "written notice.");
      s = hideTjText(s, "* On confirmation, standard notice period of ");
      s = hideTjText(s, "applies.");
      s = s.replace(/n 411\.2756 0 m 411\.2756 38 l S/g, "n");

      // Fill stipend
      s = s.split("{{STIPEND_AMOUNT}}").join(stipendAmountStr);
      s = s.split("{{STIPEND_WORDS}}").join(stipendWordsStr);
    } else {
      // Full time: populate Total CTC row
      s = s.replace(/\(\{\{GROSS_MONTHL\) Tj/, `(${grossMonthlyStr}) Tj`);
      s = hideTjText(s, "Y}}");
      s = s.replace(/\(\{\{GROSS_ANNUAL\) Tj/, `(${grossAnnualStr}) Tj`);
      s = hideTjText(s, "}}");
      s = s.split("{{GROSS_ANNUAL}}").join(grossAnnualStr);
      s = s.split("{{GROSS_ANNUAL_WORDS}}").join(grossAnnualWordsStr);
      if (incentiveNote) {
        s = s.split("{{INCENTIVE_NOTE}}").join(incentiveNote);
      } else {
        s = hideTjText(s, "* Incentive / Variable Pay: ");
        s = hideTjText(s, "{{INCENTIVE_NOTE}}");
      }

      // Hide intern compensation (stipend) & intern engagement details
      s = hideTjText(s, "2. Compensation");
      s = hideTjText(s, "* Monthly Stipend: ");
      s = hideTjText(s, "{{STIPEND_AMOUNT}} ");
      s = hideTjText(s, "{{STIPEND_WORDS}} ");
      s = hideTjText(s, ", paid between the 1st to 3rd of each");
      s = hideTjText(s, "month.");
      s = hideTjText(s, "3. Internship Status");
      s = hideTjText(s, "* This is a ");
      s = hideTjText(s, "full-time internship");
      s = hideTjText(s, " engagement for a fixed duration of ");
      s = hideTjText(s, "* You are expected to dedicate your full working capacity to ");
      s = hideTjText(s, "during this period.");
      s = hideTjText(s, "* Based on your performance, ");
      s = s.replace(/\(may offer a full-time role at the Company's discretion upon\) Tj/g, "() Tj");
      s = hideTjText(s, "successful completion of the internship.");
    }

    s = s.split("(}) Tj").join("() Tj");
    s = cleanGeneralTemplateArtifacts(s);
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
    s = s.split("{{NOTICE_PERIOD}}").join(noticePeriod);
    s = applyCustomDynamicReplacements(s);

    if (isIntern) {
      s = hideTjText(s, "Either party may terminate this engagement with ");
      s = hideTjText(s, "prior written notice");
    } else {
      s = hideTjText(s, "Either party may terminate this internship with ");
      s = hideTjText(s, "15 days' prior written notice");
    }

    s = cleanGeneralTemplateArtifacts(s);
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
    newXref += `${xrefLines[i]}\n`;
  }
  newXref += `${String(offset14).padStart(10, "0")} 00000 n \n`;
  newXref += `${String(offset15).padStart(10, "0")} 00000 n \n`;
  newXref += `${String(offset16).padStart(10, "0")} 00000 n \n`;

  const trailerIdx = str.indexOf("trailer", xrefIdx);
  const trailerBlock = str.slice(trailerIdx, str.indexOf("startxref", trailerIdx));
  const newTrailer = `${newXref}${trailerBlock}startxref\n${xrefOffset}\n%%EOF\n`;

  parts.push(Buffer.from(newTrailer, "latin1"));
  return Buffer.concat(parts);
}
