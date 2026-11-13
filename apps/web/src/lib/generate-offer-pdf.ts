import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

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
  s = s.replace(/1 \.952941 \.803922 rg\s*n [0-9. -]+ re f\*/g, "n 0 0 0 0 re");
  s = s.replace(/\.933333 \.956863 1 rg\s*n [0-9. -]+ re f\*/g, "n 0 0 0 0 re");
  s = s.replace(/\.941176 \.941176 \.941176 rg\s*n [0-9. -]+ re f\*/g, "n 0 0 0 0 re");
  s = s.replace(/1 \.756863 \.027451 RG[\s\S]*?n 511\.2756 0 m 511\.2756 25 l S/g, "n");
  s = s.replace(/\.101961 \.235294 \.431373 RG[\s\S]*?n 511\.2756 0 m 511\.2756 40 l S/g, "n");
  s = s.replace(/\.666667 \.666667 \.666667 RG[\s\S]*?n 511\.2756 0 m 511\.2756 21 l S/g, "n");
  s = s.replace(/([0-9.-]+)\s+Tw/g, "0 Tw");
  s = s.replace(/\.490196 \.290196 0 rg/g, "0 0 0 rg");
  return s;
}

function setBlockY(blockStr: string, newY: number): string {
  return blockStr.replace(/1 0 0 1 ([0-9.-]+) ([0-9.-]+) cm/, `1 0 0 1 $1 ${newY.toFixed(4)} cm`);
}

function parsePageBlocks(streamStr: string): {
  header: string;
  blocks: Array<{ y: number; block: string }>;
} {
  const firstBlockIdx = streamStr.search(/q\r?\n1 0 0 1 42/);
  if (firstBlockIdx === -1) {
    return { header: streamStr, blocks: [] };
  }
  const header = streamStr.slice(0, firstBlockIdx);
  const rest = streamStr.slice(firstBlockIdx);
  const blockRegex = /q\r?\n1 0 0 1 42 ([0-9.-]+) cm[\s\S]*?\r?\nQ/g;
  const blocks: Array<{ y: number; block: string }> = [];
  for (const m of rest.matchAll(blockRegex)) {
    blocks.push({ y: parseFloat(m[1]), block: m[0] });
  }
  return { header, blocks };
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
  const companyName = data.company_name || "Scalepods";
  const candidateName = data.candidate_name || "Candidate";
  const rawSalary = String(data.salary || (isIntern ? "10000" : "1200000"));
  const numSalary = parseFloat(rawSalary.replace(/[^0-9.]/g, "")) || 0;
  const startDate = formatDateString(data.start_date || "2026-11-09");
  const refNo =
    data.ref_no ||
    `SP/${new Date().getFullYear()}/OFFER/${Math.floor(1000 + Math.random() * 9000)}`;
  const issueDate = formatDateString(data.issue_date || new Date().toISOString().split("T")[0]);
  const signatoryName = data.signatory_name || "Manish";
  const signatoryTitle = data.signatory_title || "Talent Acquisition Lead";
  const dynamicVars = (data.dynamic_variables || {}) as Record<string, string>;

  const department = dynamicVars.DEPARTMENT || dynamicVars.department || "Engineering";
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

  function substituteStandardVars(content: string): string {
    let s = content;
    s = s.split("{{COMPANY_NAME}}").join(companyName);
    s = s.split("{{COMPANY_WEBSITE}}").join("www.scalepods.tech");
    s = s.split("{{COMPANY_EMAIL}}").join("info@scalepods.tech");
    s = s.split("{{REF_NO}}").join(refNo);
    s = s.split("{{ISSUE_DATE}}").join(issueDate);
    s = s.split("{{CANDIDATE_NAME}}").join(candidateName);
    s = s.split("{{ROLE}}").join(role);
    s = s.split("{{JOINING_DATE}}").join(startDate);
    s = s.split("{{DURATION}}").join(duration);
    s = s.split("{{DEPARTMENT}}").join(department);
    s = s.split("{{LOCATION}}").join(location);
    s = s.split("{{WORKING_DAYS}}").join(workingDays);
    s = s.split("{{STIPEND_AMOUNT}}").join(stipendAmountStr);
    s = s.split("{{STIPEND_WORDS}}").join(stipendWordsStr);
    s = s.split("{{SIGNATORY_NAME}}").join(signatoryName);
    s = s.split("{{SIGNATORY_TITLE}}").join(signatoryTitle);
    s = s.split("{{PROBATION_PERIOD}}").join(probationPeriod);
    s = s.split("{{NOTICE_PERIOD}}").join(noticePeriod);
    s = s.split("{{BASIC_SALARY} }").join(basicMonthlyStr);
    s = s.split("{{BASIC_SALARY}}").join(basicMonthlyStr);
    s = s.split("{{BASIC_SALARY_ ANNUAL}}").join(basicAnnualStr);
    s = s.split("{{BASIC_SALARY_ANNUAL}}").join(basicAnnualStr);
    s = s.split("{{HRA}}").join(hraMonthlyStr);
    s = s.split("{{HRA_ANNUAL}}").join(hraAnnualStr);
    s = s.split("{{SPECIAL_ALLO WANCE}}").join(specialMonthlyStr);
    s = s.split("{{SPECIAL_ALLOWANCE}}").join(specialMonthlyStr);
    s = s.split("{{SPECIAL_ALLO WANCE_ANNUAL} }").join(specialAnnualStr);
    s = s.split("{{SPECIAL_ALLOWANCE_ANNUAL}}").join(specialAnnualStr);
    s = s.split("{{GROSS_MONTHL Y}}").join(grossMonthlyStr);
    s = s.split("{{GROSS_MONTHLY}}").join(grossMonthlyStr);
    s = s.split("{{GROSS_ANNUAL }}").join(grossAnnualStr);
    s = s.split("{{GROSS_ANNUAL}}").join(grossAnnualStr);
    s = s.split("{{GROSS_ANNUAL_WORDS}}").join(grossAnnualWordsStr);
    if (incentiveNote) {
      s = s.split("{{INCENTIVE_NOTE}}").join(incentiveNote);
    }
    s = applyCustomDynamicReplacements(s);
    s = cleanGeneralTemplateArtifacts(s);
    return s;
  }

  const str = templateBuffer.toString("latin1");

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

  const raw14 = getStreamData(14);
  const raw15 = getStreamData(15);
  const raw16 = getStreamData(16);

  const p14 = parsePageBlocks(raw14);
  const p15 = parsePageBlocks(raw15);
  const p16 = parsePageBlocks(raw16);

  const b14 = p14.blocks.map((b) => b.block);
  const b15 = p15.blocks.map((b) => b.block);
  const b16 = p16.blocks.map((b) => b.block);

  let kept14: string[];
  let kept15: string[];
  let kept16: string[];

  if (isIntern) {
    // Page 1 Intern: clean natural layout, no gap between Dear Candidate and Intern appointment
    kept14 = [
      setBlockY(b14[5], 670), // Ref: {{REF_NO}} | Date: {{ISSUE_DATE}}
      setBlockY(b14[11], 630), // INTERNSHIP APPOINTMENT LETTER
      setBlockY(b14[15], 580), // Dear {{CANDIDATE_NAME}}, | Starting Date: {{JOINING_DATE}}
      setBlockY(b14[21], 520), // We are pleased to offer you a {{DURATION}} internship position...
      setBlockY(b14[23], 440), // TERMS OF ENGAGEMENT
      setBlockY(b14[27], 395), // 1. Role & Scope
      setBlockY(b14[29], 365), // * Designation...
      setBlockY(b14[31], 340), // * Working Days...
      setBlockY(b14[32], 315), // * Roles & responsibilities...
    ];

    // Page 2 Intern: starts at top, full code of conduct fits on page 2!
    kept15 = [
      setBlockY(b15[7], 710), // 2. Compensation
      setBlockY(b15[9], 680), // * Monthly Stipend: INR {{STIPEND_AMOUNT}}...
      setBlockY(b15[19], 630), // 3. Internship Status
      setBlockY(b15[21], 605), // * This is a full-time internship...
      setBlockY(b15[22], 585), // * You are expected...
      setBlockY(b15[23], 550), // * Based on your performance...
      setBlockY(b15[25], 505), // 4. Confidentiality & Non-Disclosure
      setBlockY(b15[27], 480), // You agree to maintain...
      setBlockY(b15[28], 458), // * Client data...
      setBlockY(b15[29], 440), // * Proprietary workflows...
      setBlockY(b15[30], 422), // * Internal strategies...
      setBlockY(b15[31], 404), // * Any information...
      setBlockY(b15[33], 375), // Breach of this obligation...
      setBlockY(b15[35], 335), // 5. Intellectual Property
      setBlockY(b15[37], 290), // All work, code...
      setBlockY(b15[39], 235), // 6. Code of Conduct
      setBlockY(b15[41], 210), // * You shall conduct yourself...
      setBlockY(b15[42], 192), // * You shall not engage...
      setBlockY(b16[0], 174), // * Any misconduct... (Moved from Page 3 to keep 6 together!)
    ];

    // Page 3 Intern: starts right at top with 7. Termination, followed by closing & signatures
    kept16 = [
      setBlockY(b16[2], 710), // 7. Termination
      setBlockY(b16[7], 675), // Either party may terminate this internship with 15 days...
      setBlockY(b16[9], 615), // We look forward to welcoming you...
      setBlockY(b16[11], 555), // For {{COMPANY_NAME}}
      setBlockY(b16[13], 520), // {{SIGNATORY_NAME}}
      setBlockY(b16[14], 502), // {{SIGNATORY_TITLE}}
      setBlockY(b16[16], 470), // Signature line
      setBlockY(b16[20], 410), // ACKNOWLEDGEMENT
      setBlockY(b16[22], 370), // I, {{CANDIDATE_NAME}}, accept...
      setBlockY(b16[24], 310), // Candidate Signature / Date / Place
    ];
  } else {
    // Fulltime Page 1
    kept14 = [
      setBlockY(b14[5], 670), // Ref & Date
      setBlockY(b14[8], 630), // APPOINTMENT LETTER
      setBlockY(b14[15], 580), // Dear Candidate / Starting Date
      setBlockY(b14[18], 525), // We are pleased to offer you the position of {{ROLE}}...
      setBlockY(b14[23], 450), // TERMS OF ENGAGEMENT
      setBlockY(b14[27], 410), // 1. Role & Scope
      setBlockY(b14[29], 385), // * Designation...
      setBlockY(b14[31], 365), // * Working Days...
      setBlockY(b14[32], 345), // * Roles & responsibilities...
      setBlockY(b14[35], 305), // 2. Compensation & Benefits
      setBlockY(b14[37], 165), // CTC Table (shifted up to fit Page 1 perfectly)
    ];

    const hasIncentive = Boolean(incentiveNote);
    const p2Offset = hasIncentive ? 0 : 35;

    // Fulltime Page 2
    kept15 = [
      setBlockY(b15[0], 715), // Total CTC row
      setBlockY(b15[2], 680), // * Gross Annual CTC...
      ...(hasIncentive ? [setBlockY(b15[4], 650)] : []),
      setBlockY(b15[12], 605 + p2Offset), // 3. Employment Status
      setBlockY(b15[14], 580 + p2Offset), // * This is a full-time position.
      setBlockY(b15[15], 550 + p2Offset), // * The first {{PROBATION_PERIOD}}...
      setBlockY(b15[16], 530 + p2Offset), // * On confirmation...
      setBlockY(b15[25], 485 + p2Offset), // 4. Confidentiality & Non-Disclosure
      setBlockY(b15[27], 460 + p2Offset), // You agree to maintain...
      setBlockY(b15[28], 438 + p2Offset), // * Client data...
      setBlockY(b15[29], 420 + p2Offset), // * Proprietary workflows...
      setBlockY(b15[30], 402 + p2Offset), // * Internal strategies...
      setBlockY(b15[31], 384 + p2Offset), // * Any information...
      setBlockY(b15[33], 355 + p2Offset), // Breach of this obligation...
      setBlockY(b15[35], 315 + p2Offset), // 5. Intellectual Property
      setBlockY(b15[37], 270 + p2Offset), // All work, code...
      setBlockY(b15[39], 215 + p2Offset), // 6. Code of Conduct
      setBlockY(b15[41], 190 + p2Offset), // * You shall conduct yourself...
      setBlockY(b15[42], 172 + p2Offset), // * You shall not engage...
      setBlockY(b16[0], 154 + p2Offset), // * Any misconduct... (Moved from Page 3)
    ];

    // Fulltime Page 3
    kept16 = [
      setBlockY(b16[2], 710), // 7. Termination
      setBlockY(b16[5], 675), // Either party may terminate this engagement...
      setBlockY(b16[9], 615), // We look forward to welcoming you...
      setBlockY(b16[11], 555), // For {{COMPANY_NAME}}
      setBlockY(b16[13], 520), // {{SIGNATORY_NAME}}
      setBlockY(b16[14], 502), // {{SIGNATORY_TITLE}}
      setBlockY(b16[16], 470), // Signature line
      setBlockY(b16[20], 410), // ACKNOWLEDGEMENT
      setBlockY(b16[22], 370), // I, {{CANDIDATE_NAME}}, accept...
      setBlockY(b16[24], 310), // Candidate Signature / Date / Place
    ];
  }

  const s14 = substituteStandardVars(p14.header + kept14.join("\n"));
  const s15 = substituteStandardVars(p15.header + kept15.join("\n"));
  const s16 = substituteStandardVars(p16.header + kept16.join("\n"));

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

  const obj14Start = str.indexOf("\n14 0 obj");
  const headerPart = templateBuffer.slice(0, obj14Start + 1);

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
