/**
 * Domain restriction and anti-abuse policies for recruiter registration & access.
 *
 * Rules:
 * 1. scalepods.co (and *.scalepods.co) is permanently exempt: unlimited accounts,
 *    never locked by domain-level free tier exhaustion.
 * 2. Public / consumer webmail providers (Gmail, Yahoo, Outlook, etc.) and disposable
 *    domains are forbidden for recruiter registrations.
 * 3. Corporate domains: Exactly one recruiter account per company on the Free tier.
 * 4. Free tier exhaustion: If a company domain exhausts its free tier, all logins/signups
 *    under that domain are locked until an upgrade is completed.
 */

import type { Tier } from "./types";

export const EXEMPT_DOMAINS = new Set(["scalepods.co"]);

/**
 * Maximum allowed accounts per company domain based on the plan/tier:
 * - Free: 3 accounts
 * - Basic: 3 accounts
 * - Growth: 5 accounts
 * - Enterprise: 10 accounts
 */
export const DOMAIN_TIER_ACCOUNT_LIMITS: Record<Tier, number> = {
  free: 3,
  basic: 3,
  growth: 5,
  enterprise: 10,
};

/**
 * Returns the maximum accounts permitted for a given tier.
 */
export function getMaxAccountsForTier(tier: Tier | string | null | undefined): number {
  if (!tier) return 3;
  const normalized = tier.toLowerCase().trim() as Tier;
  return DOMAIN_TIER_ACCOUNT_LIMITS[normalized] ?? 3;
}

export const BLOCKED_CONSUMER_DOMAINS = new Set([
  // Google
  "gmail.com",
  "googlemail.com",

  // Microsoft
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "passport.com",

  // Yahoo
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "yahoo.ca",
  "ymail.com",
  "rocketmail.com",

  // Apple
  "icloud.com",
  "me.com",
  "mac.com",

  // Other major public providers
  "aol.com",
  "zoho.com",
  "zohomail.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "yandex.com",
  "yandex.ru",
  "tutanota.com",
  "tuta.io",
  "fastmail.com",
  "rediffmail.com",

  // Common disposable email providers
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "trashmail.com",
  "throwawaymail.com",
  "sharklasers.com",
  "getairmail.com",
  "dispostable.com",
  "burnermail.io",
]);

/**
 * Extracts and normalizes the domain from an email or domain string.
 */
export function extractDomain(emailOrDomain: string): string {
  if (!emailOrDomain) return "";
  const trimmed = emailOrDomain.trim().toLowerCase();
  if (trimmed.includes("@")) {
    const parts = trimmed.split("@");
    return parts[parts.length - 1] ?? "";
  }
  return trimmed;
}

/**
 * Checks if the given domain or email is exempt from all domain restrictions.
 * `scalepods.co` and its subdomains are permanently exempt.
 */
export function isDomainExempt(emailOrDomain: string): boolean {
  const domain = extractDomain(emailOrDomain);
  if (!domain) return false;
  if (EXEMPT_DOMAINS.has(domain)) return true;
  if (domain.endsWith(".scalepods.co")) return true;
  return false;
}

/**
 * Checks if a domain is a known consumer or temporary email provider.
 */
export function isBlockedConsumerDomain(emailOrDomain: string): boolean {
  const domain = extractDomain(emailOrDomain);
  if (!domain) return false;
  if (isDomainExempt(domain)) return false;
  return BLOCKED_CONSUMER_DOMAINS.has(domain);
}

export interface RecruiterEmailValidationResult {
  allowed: boolean;
  domain: string;
  isExempt: boolean;
  reason?: string;
  code?: "INVALID_EMAIL" | "BLOCKED_CONSUMER" | "OK";
}

/**
 * Validates whether an email is admissible for recruiter registration.
 * Allows corporate domains and exempt domains (scalepods.co); rejects consumer domains.
 */
export function validateRecruiterEmail(email: string): RecruiterEmailValidationResult {
  if (!email || typeof email !== "string") {
    return {
      allowed: false,
      domain: "",
      isExempt: false,
      reason: "Please enter a valid email address.",
      code: "INVALID_EMAIL",
    };
  }

  const trimmed = email.trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return {
      allowed: false,
      domain: "",
      isExempt: false,
      reason: "Please enter a valid email address.",
      code: "INVALID_EMAIL",
    };
  }

  const domain = extractDomain(trimmed);

  // 1. Exemption check (scalepods.co)
  if (isDomainExempt(domain)) {
    return {
      allowed: true,
      domain,
      isExempt: true,
      code: "OK",
    };
  }

  // 2. Blocked consumer domains check
  if (isBlockedConsumerDomain(domain)) {
    return {
      allowed: false,
      domain,
      isExempt: false,
      reason:
        "Please sign up with your official company work email (e.g., name@yourcompany.com). Personal email providers like Gmail and Yahoo are not permitted for recruiter accounts.",
      code: "BLOCKED_CONSUMER",
    };
  }

  return {
    allowed: true,
    domain,
    isExempt: false,
    code: "OK",
  };
}
