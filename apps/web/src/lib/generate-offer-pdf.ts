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

function cleanGeneralTemplateArtifacts(s: string): string {
  // Strip yellow top guidance banner
  s = s.replace(
    /q\s*\r?\n\s*1 \.952941 \.803922 rg\s*\r?\n\s*n 0 25 511\.2756 -25 re f\*[\s\S]*?n 511\.2756 0 m 511\.2756 25 l S\s*Q\s*Q\s*Q/g,
    "",
  );
  // Strip blue letterhead guidance banner
  s = s.replace(
    /q\s*\r?\n\s*\.933333 \.956863 1 rg\s*\r?\n\s*n 0 40 511\.2756 -40 re f\*[\s\S]*?n 511\.2756 0 m 511\.2756 40 l S\s*Q\s*Q\s*Q/g,
    "",
  );
  // Strip all gray instruction/condition banners and their stroke borders
  s = s.replace(
    /q\s*\r?\n\s*\.941176 \.941176 \.941176 rg[\s\S]*?n 511\.2756 0 m 511\.2756 21 l S\s*Q\s*Q(\s*Q)?/g,
    "",
  );
  // Strip all 62 yellow highlight rectangles behind dynamic variables
  s = s.replace(/1 \.952941 \.803922 rg\s*n [0-9. -]+ re f\*/g, "");
  // Replace template brown/yellow text color with crisp black text
  s = s.replace(/\.490196 \.290196 0 rg/g, "0 0 0 rg");
  // Reset justified word spacing Tw to 0 Tw to eliminate awkward stretching/bunching
  s = s.replace(/([0-9.-]+)\s+Tw/g, "0 Tw");
  // Blank remaining template instruction texts if any
  s = s.replace(/\(Show this section only when: [^)]*\) Tj/g, "() Tj");
  s = s.replace(/\(LETTER_TYPE = [^)]*\) Tj/g, "() Tj");
  s = s.replace(/\(LETTERHEAD \/ LOGO AREA\) Tj/g, "() Tj");
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
      s = s.replace(
        /q\s*1 0 0 1 42 602\.8898 cm[\s\S]*?\(APPOINTMENT LETTER\) Tj[\s\S]*?Q\s*Q/g,
        "",
      );
      s = s.replace(
        /q\s*1 0 0 1 42 463\.4898 cm[\s\S]*?\(This offer reflects our confidence in your abilities and your potential to contribute to our growth\.\) Tj T\* ET\s*Q\s*Q/g,
        "",
      );
      // Hide entire Section 2 compensation table on Page 1
      s = s.replace(
        /q\s*1 0 0 1 42 219\.0898 cm[\s\S]*?n 411\.2756 0 m 411\.2756 137 l S\s*Q\s*Q\s*Q/g,
        "",
      );
    } else {
      // Hide intern title & opening paragraph
      s = s.replace(
        /q\s*1 0 0 1 42 561\.8898 cm[\s\S]*?\(INTERNSHIP APPOINTMENT LETTER\) Tj[\s\S]*?Q\s*Q/g,
        "",
      );
      s = s.replace(
        /q\s*1 0 0 1 42 388\.4898 cm[\s\S]*?\(contribute meaningfully to our initiatives\.\) Tj T\* ET\s*Q\s*Q/g,
        "",
      );

      // Populate table cells with perfectly aligned single-line text
      s = s.replace(
        /q\s*1 0 0 1 317\.2756 80 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 317.2756 80 cm\nq\nBT 1 0 0 1 0 13 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${basicMonthlyStr}) Tj T* ET\nQ\nQ`,
      );
      s = s.replace(
        /q\s*1 0 0 1 417\.2756 80 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 417.2756 80 cm\nq\nBT 1 0 0 1 0 13 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${basicAnnualStr}) Tj T* ET\nQ\nQ`,
      );
      s = s.replace(
        /q\s*1 0 0 1 317\.2756 57 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 317.2756 57 cm\nq\nBT 1 0 0 1 0 5.5 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${hraMonthlyStr}) Tj T* ET\nQ\nQ`,
      );
      s = s.replace(
        /q\s*1 0 0 1 417\.2756 57 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 417.2756 57 cm\nq\nBT 1 0 0 1 0 5.5 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${hraAnnualStr}) Tj T* ET\nQ\nQ`,
      );
      s = s.replace(
        /q\s*1 0 0 1 317\.2756 11\.5 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 317.2756 11.5 cm\nq\nBT 1 0 0 1 0 13 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${specialMonthlyStr}) Tj T* ET\nQ\nQ`,
      );
      s = s.replace(
        /q\s*1 0 0 1 417\.2756 4 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 417.2756 4 cm\nq\nBT 1 0 0 1 0 20.5 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${specialAnnualStr}) Tj T* ET\nQ\nQ`,
      );
    }

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
      s = s.replace(
        /q\s*1 0 0 1 42 713\.8898 cm[\s\S]*?n 411\.2756 0 m 411\.2756 38 l S\s*Q\s*Q\s*Q/g,
        "",
      );
      // Strip Gross Annual CTC line
      s = s.replace(
        /q\s*1 0 0 1 42 694\.8898 cm[\s\S]*?\(\* Gross Annual CTC: \) Tj[\s\S]*?Q\s*Q/g,
        "",
      );
      // Strip Incentive line
      s = s.replace(
        /q\s*1 0 0 1 42 658\.8898 cm[\s\S]*?\(\* Incentive \/ Variable Pay: \) Tj[\s\S]*?Q\s*Q/g,
        "",
      );
      // Strip full-time Employment Status
      s = s.replace(/q\s*1 0 0 1 42 525\.8898 cm[\s\S]*?\(applies\.\) Tj T\* ET\s*Q\s*Q/g, "");
      // Fill stipend
      s = s.split("{{STIPEND_AMOUNT}}").join(stipendAmountStr);
      s = s.split("{{STIPEND_WORDS}}").join(stipendWordsStr);
    } else {
      // Fill Total CTC row cells with cleanly aligned values
      s = s.replace(
        /q\s*1 0 0 1 317\.2756 4 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 317.2756 4 cm\nq\nBT 1 0 0 1 0 13 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${grossMonthlyStr}) Tj T* ET\nQ\nQ`,
      );
      s = s.replace(
        /q\s*1 0 0 1 417\.2756 4 cm[\s\S]*?Q\s*Q/,
        `q\n1 0 0 1 417.2756 4 cm\nq\nBT 1 0 0 1 0 13 Tm 15 TL /F2 9.5 Tf 0 0 0 rg (${grossAnnualStr}) Tj T* ET\nQ\nQ`,
      );
      s = s.split("{{GROSS_ANNUAL}}").join(grossAnnualStr);
      s = s.split("{{GROSS_ANNUAL_WORDS}}").join(grossAnnualWordsStr);
      if (incentiveNote) {
        s = s.split("{{INCENTIVE_NOTE}}").join(incentiveNote);
      } else {
        s = s.replace(
          /q\s*1 0 0 1 42 658\.8898 cm[\s\S]*?\(\* Incentive \/ Variable Pay: \) Tj[\s\S]*?Q\s*Q/g,
          "",
        );
      }
      // Strip intern compensation (stipend)
      s = s.replace(/q\s*1 0 0 1 42 609\.8898 cm[\s\S]*?\(month\.\) Tj T\* ET\s*Q\s*Q/g, "");
      // Strip intern engagement details
      s = s.replace(
        /q\s*1 0 0 1 42 411\.8898 cm[\s\S]*?\(successful completion of the internship\.\) Tj T\* ET\s*Q\s*Q/g,
        "",
      );
    }

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
      s = s.replace(
        /q\s*1 0 0 1 42 652\.8898 cm[\s\S]*?\(reserves the right to terminate immediately without notice in cases of misconduct or breach of confidentiality\.\) Tj T\* ET\s*Q\s*Q/g,
        "",
      );
    } else {
      s = s.replace(
        /q\s*1 0 0 1 42 596\.8898 cm[\s\S]*?\(terminate immediately without notice in cases of misconduct or breach of confidentiality\.\) Tj T\* ET\s*Q\s*Q/g,
        "",
      );
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
