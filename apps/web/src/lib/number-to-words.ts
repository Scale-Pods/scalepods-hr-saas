/**
 * Convert numbers (integer or string) to Indian currency words format.
 * Pure mathematical utility — safe for both client and server components.
 * E.g., 5000 -> "Five Thousand Rupees Only"
 *       120000 -> "One Lakh Twenty Thousand Rupees Only"
 */
export function numberToWords(num: number | string): string {
  const n = parseInt(String(num).replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(n) || n === 0) return "Zero Rupees Only";

  const units = [
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
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convertBelowThousand(val: number): string {
    let str = "";
    if (val >= 100) {
      str += `${units[Math.floor(val / 100)]} Hundred `;
      val %= 100;
    }
    if (val >= 20) {
      str += `${tens[Math.floor(val / 10)]} `;
      val %= 10;
    }
    if (val > 0) {
      str += `${units[val]} `;
    }
    return str.trim();
  }

  let remaining = n;
  let result = "";

  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  if (crore > 0) {
    result += `${convertBelowThousand(crore)} Crore `;
  }

  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  if (lakh > 0) {
    result += `${convertBelowThousand(lakh)} Lakh `;
  }

  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  if (thousand > 0) {
    result += `${convertBelowThousand(thousand)} Thousand `;
  }

  if (remaining > 0) {
    result += `${convertBelowThousand(remaining)} `;
  }

  return `${result.trim()} Rupees Only`.replace(/\s+/g, " ");
}
