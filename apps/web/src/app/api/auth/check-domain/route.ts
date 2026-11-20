import { extractDomain, isBlockedConsumerDomain, isDomainExempt } from "@scalepods/core";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const domainParam = searchParams.get("domain");

  return handleDomainCheck(email, domainParam);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, domain: domainParam } = body;

  return handleDomainCheck(email, domainParam);
}

async function handleDomainCheck(email?: string | null, domainParam?: string | null) {
  const rawTarget = domainParam || email;
  if (!rawTarget || typeof rawTarget !== "string") {
    return NextResponse.json(
      {
        allowed: false,
        code: "INVALID_INPUT",
        reason: "Please provide a valid email or domain.",
      },
      { status: 400 },
    );
  }

  const domain = extractDomain(rawTarget);
  if (!domain?.includes(".")) {
    return NextResponse.json(
      {
        allowed: false,
        code: "INVALID_DOMAIN",
        reason: "Please provide a valid company domain.",
      },
      { status: 400 },
    );
  }

  // 1. scalepods.co is permanently exempt
  if (isDomainExempt(domain)) {
    return NextResponse.json({
      allowed: true,
      domain,
      isExempt: true,
      isExhausted: false,
      tier: "enterprise",
    });
  }

  // 2. Reject blocked consumer webmail providers
  if (isBlockedConsumerDomain(domain)) {
    return NextResponse.json({
      allowed: false,
      domain,
      isExempt: false,
      isExhausted: false,
      code: "BLOCKED_CONSUMER",
      reason:
        "Personal email providers like Gmail and Yahoo are not permitted for recruiter accounts. Please use your official company work email (e.g. name@yourcompany.com).",
    });
  }

  // 3. Query existing company domain from database
  try {
    const supabase = await supabaseServer();
    const { data: domainRow, error } = await supabase
      .from("company_domains")
      .select("domain, tier, is_free_tier_exhausted, is_exempt, primary_account_id")
      .eq("domain", domain)
      .maybeSingle();

    if (error) {
      console.error("[check-domain] Database check error:", error);
      // Fallback: if table does not exist yet in local development, allow through
      return NextResponse.json({
        allowed: true,
        domain,
        isExempt: false,
        isExhausted: false,
        tier: "free",
      });
    }

    if (domainRow) {
      // If free tier is exhausted
      if (domainRow.is_free_tier_exhausted && domainRow.tier === "free") {
        return NextResponse.json({
          allowed: false,
          domain,
          isExempt: false,
          isExhausted: true,
          tier: domainRow.tier,
          code: "FREE_TIER_EXHAUSTED",
          reason: `Your organization (${domain}) has exhausted its free tier trial. No new accounts can be created under this domain. Please upgrade to a paid plan.`,
        });
      }

      // If free tier and company already registered
      if (domainRow.tier === "free") {
        return NextResponse.json({
          allowed: false,
          domain,
          isExempt: false,
          isExhausted: false,
          tier: "free",
          code: "DOMAIN_EXISTS_FREE",
          reason: `An account for ${domain} already exists. On the Free tier, only one recruiter account is allowed per company. Please sign in with the primary registered email.`,
        });
      }

      // Paid tier
      return NextResponse.json({
        allowed: true,
        domain,
        isExempt: false,
        isExhausted: false,
        tier: domainRow.tier,
      });
    }

    // New unassigned company domain
    return NextResponse.json({
      allowed: true,
      domain,
      isExempt: false,
      isExhausted: false,
      tier: "free",
    });
  } catch (err) {
    console.error("[check-domain] Unexpected error:", err);
    return NextResponse.json({
      allowed: true,
      domain,
      isExempt: false,
      isExhausted: false,
      tier: "free",
    });
  }
}
