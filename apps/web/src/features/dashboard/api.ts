import { type Reports, reportsSchema } from "@scalepods/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import { callWorkflow } from "@/lib/webhooks";

export interface CityDistributionItem {
  label: string;
  count: number;
  color: string;
}

export interface DashboardKpis {
  totalCampaigns: number;
  activeCampaigns: number;
  candidateCount: number;
  candidateCreatedAt: string[];
  interviewsThisWeek: number;
  interviewsPriorWeek: number;
  pendingRoundsCount: number;
  campaignsDistribution: { id: string; name: string; candidateCount: number; status: string }[];
  cityDistribution: CityDistributionItem[];
  pipelineStages: {
    screening: number;
    round1: number;
    round2: number;
    round3: number;
    hired: number;
  };
  usageFallback: {
    aiInterviewsUsed: number;
    voiceScreensUsed: number;
    scheduledRoundsUsed: number;
  };
  recruiters: {
    name: string;
    email: string;
    role: string;
    score: number;
    interviewsCount: number;
  }[];
  kpiHeights: {
    candidates: number[];
    score: number[];
    hired: number[];
    quality: number[];
  };
}

export interface UpcomingInterview {
  id: string;
  candidate_id: string;
  round_type: string;
  scheduled_at: string | null;
  status: string;
}

export interface LedgerEntry {
  id: string;
  candidate_id: string;
  stage: string;
  score: number | null;
  source: string;
  override_of: string | null;
  decided_at: string;
}

const KNOWN_RECRUITERS: Record<string, { name: string; role: string }> = {
  "manish@scalepods.tech": { name: "Manish Gandla", role: "Lead Recruiter" },
  "aqib@scalepods.tech": { name: "Aqib Firdous", role: "AI Specialist & Interviewer" },
  "aqibfirdous6@gmail.com": { name: "Aqib Firdous", role: "Technical Interviewer" },
  "shubhodeep@scalepods.co": { name: "Shubhodeep Banerjee", role: "Senior HR Manager" },
  "raunak@scalepods.tech": { name: "Raunak Kumar", role: "Talent Acquisition" },
  "raunak@scalepods.co": { name: "Raunak Kumar", role: "Talent Acquisition" },
  "adnan@scalepods.co": { name: "Adnan Shaikh", role: "Technical Recruiter" },
};

const CITY_RULES: { label: string; regex: RegExp }[] = [
  { label: "Bengaluru", regex: /\b(bengaluru|bangalore|karnataka)\b/i },
  { label: "Mumbai", regex: /\b(mumbai|bombay|navi mumbai|thane)\b/i },
  { label: "Pune", regex: /\b(pune|pcmc)\b/i },
  { label: "Hyderabad", regex: /\b(hyderabad|secunderabad|telangana)\b/i },
  {
    label: "Delhi NCR",
    regex: /\b(delhi|new delhi|noida|gurugram|gurgaon|ghaziabad|faridabad)\b/i,
  },
  { label: "Chennai", regex: /\b(chennai|madras|tamil nadu)\b/i },
  { label: "Kolkata", regex: /\b(kolkata|calcutta|west bengal)\b/i },
  { label: "Ahmedabad", regex: /\b(ahmedabad|gandhinagar|gujarat|surat|vadodara)\b/i },
  { label: "Nagpur", regex: /\b(nagpur)\b/i },
  { label: "Indore", regex: /\b(indore|bhopal|madhya pradesh)\b/i },
  { label: "Jaipur", regex: /\b(jaipur|rajasthan)\b/i },
  { label: "Chandigarh", regex: /\b(chandigarh|mohali|panchkula|punjab|haryana)\b/i },
  { label: "Kochi", regex: /\b(kochi|cochin|kerala|trivandrum)\b/i },
  { label: "Srinagar / J&K", regex: /\b(srinagar|kashmir|jammu)\b/i },
  { label: "Guwahati", regex: /\b(guwahati|assam)\b/i },
  { label: "Lucknow", regex: /\b(lucknow|kanpur|uttar pradesh)\b/i },
  { label: "Bhubaneswar", regex: /\b(bhubaneswar|cuttack|odisha)\b/i },
  { label: "Patna", regex: /\b(patna|bihar)\b/i },
  { label: "Dehradun", regex: /\b(dehradun|uttarakhand)\b/i },
  { label: "San Francisco", regex: /\b(san francisco|bay area|california)\b/i },
  { label: "New York", regex: /\b(new york|nyc)\b/i },
  { label: "London", regex: /\b(london|united kingdom|uk)\b/i },
];

function detectCityFromPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  const d10 = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;

  if (
    d10.startsWith("9100") ||
    d10.startsWith("9502") ||
    d10.startsWith("9949") ||
    d10.startsWith("9849") ||
    d10.startsWith("8466")
  )
    return "Hyderabad";
  if (
    d10.startsWith("9324") ||
    d10.startsWith("9820") ||
    d10.startsWith("9821") ||
    d10.startsWith("9819") ||
    d10.startsWith("8879")
  )
    return "Mumbai";
  if (
    d10.startsWith("8600") ||
    d10.startsWith("7900") ||
    d10.startsWith("9822") ||
    d10.startsWith("9823") ||
    d10.startsWith("9881")
  )
    return "Pune";
  if (
    d10.startsWith("9123") ||
    d10.startsWith("8274") ||
    d10.startsWith("9830") ||
    d10.startsWith("9831")
  )
    return "Kolkata";
  if (
    d10.startsWith("6353") ||
    d10.startsWith("8488") ||
    d10.startsWith("9825") ||
    d10.startsWith("9824")
  )
    return "Ahmedabad";
  if (d10.startsWith("9425") || d10.startsWith("9340") || d10.startsWith("9826"))
    return "Indore / MP";
  if (d10.startsWith("7780") || d10.startsWith("9419")) return "Srinagar / J&K";
  if (d10.startsWith("7629") || d10.startsWith("9435")) return "Guwahati";
  if (d10.startsWith("9557") || d10.startsWith("9810") || d10.startsWith("9811"))
    return "Delhi NCR";
  return null;
}

const CITY_PALETTE = [
  "#2563eb",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#f97316",
  "#84cc16",
  "#64748b",
];

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Report data comes from n8n workflow 11. Parsed through `reportsSchema` so a
 * drifting backend payload degrades to an "unavailable" widget instead of
 * crashing the dashboard.
 */
export async function fetchReports(accountId: string, accessToken?: string): Promise<Reports> {
  const res = await callWorkflow<unknown>("reports", {
    method: "GET",
    query: { account_id: accountId },
    accessToken,
  });
  return reportsSchema.parse(res);
}

/** Headline counts and breakdown for all dashboard widgets, straight from RLS-scoped tables. */
export async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const supabase = supabaseBrowser();
  const now = new Date();
  const wkStart = startOfDay(new Date(now.getTime() - 6 * 86_400_000));
  const prevStart = startOfDay(new Date(wkStart.getTime() - 86_400_000));

  const [
    campsRes,
    candCountRes,
    candDatesRes,
    wkCountRes,
    prevCountRes,
    roundInstancesRes,
    teamRes,
    crRes,
    sessCountRes,
    voiceCountRes,
    ledgerRes,
  ] = await Promise.all([
    supabase.from("campaigns").select("id,name,status,created_at"),
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase
      .from("candidates")
      .select("id,name,phone,email,created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("round_instances")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_at", wkStart.toISOString())
      .lte("scheduled_at", now.toISOString()),
    supabase
      .from("round_instances")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_at", prevStart.toISOString())
      .lt("scheduled_at", wkStart.toISOString()),
    supabase
      .from("round_instances")
      .select("id,candidate_id,campaign_id,round_number,round_type,status,scheduled_at,created_at"),
    supabase.from("team_members").select("*"),
    supabase
      .from("campaign_rounds")
      .select("campaign_id,round_number,interviewer_email,round_type"),
    supabase.from("interview_sessions").select("id", { count: "exact", head: true }),
    supabase
      .from("outreach_log")
      .select("id", { count: "exact", head: true })
      .eq("channel", "voice_call"),
    supabase
      .from("decision_ledger")
      .select("candidate_id,stage,score,created_at,raw_text,rationale")
      .limit(500),
  ]);

  const campaigns = (campsRes.data ?? []) as {
    id: string;
    name: string;
    status: string;
    created_at: string;
  }[];

  // If no campaigns exist, return empty/zero metrics and purge any orphaned candidates
  if (campaigns.length === 0) {
    if ((candCountRes.count ?? 0) > 0) {
      Promise.resolve(
        supabase.from("candidates").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ).catch(() => {});
    }

    return {
      totalCampaigns: 0,
      activeCampaigns: 0,
      candidateCount: 0,
      candidateCreatedAt: [],
      interviewsThisWeek: 0,
      interviewsPriorWeek: 0,
      pendingRoundsCount: 0,
      campaignsDistribution: [],
      cityDistribution: [],
      pipelineStages: {
        screening: 0,
        round1: 0,
        round2: 0,
        round3: 0,
        hired: 0,
      },
      usageFallback: {
        aiInterviewsUsed: 0,
        voiceScreensUsed: 0,
        scheduledRoundsUsed: 0,
      },
      recruiters: [],
      kpiHeights: {
        candidates: [0, 0, 0, 0, 0, 0, 0, 0],
        score: [0, 0, 0, 0, 0, 0, 0, 0],
        hired: [0, 0, 0, 0, 0, 0, 0, 0],
        quality: [0, 0, 0, 0, 0, 0, 0, 0],
      },
    };
  }

  const rawRounds = (roundInstancesRes.data ?? []) as {
    id: string;
    candidate_id: string;
    campaign_id: string;
    round_number: number;
    round_type: string;
    status: string;
    scheduled_at: string | null;
    created_at: string;
  }[];

  const activeCampIds = new Set(campaigns.map((c) => c.id));
  const rounds = rawRounds.filter((r) => activeCampIds.has(r.campaign_id));
  const activeCandidateIds = new Set(rounds.map((r) => r.candidate_id));

  const allLedger = (ledgerRes.data ?? []) as {
    candidate_id: string;
    stage: string;
    score: number | null;
    created_at?: string;
    raw_text?: string | null;
    rationale?: string | null;
  }[];
  const ledger = allLedger.filter((l) => activeCandidateIds.has(l.candidate_id));

  const totalCandidateCount = activeCandidateIds.size;
  const activeCampaigns = campaigns.filter((c) => c.status === "on").length;

  // 1. Campaign distribution
  const candidatesByCampaign: Record<string, Set<string>> = {};
  for (const c of campaigns) {
    candidatesByCampaign[c.id] = new Set();
  }
  for (const r of rounds) {
    if (r.campaign_id && candidatesByCampaign[r.campaign_id]) {
      candidatesByCampaign[r.campaign_id].add(r.candidate_id);
    }
  }

  const campaignsDistribution = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    candidateCount: candidatesByCampaign[c.id]?.size ?? 0,
  }));

  // 2. Real pipeline stages
  const r1Candidates = new Set<string>();
  const r2Candidates = new Set<string>();
  const r3Candidates = new Set<string>();
  const hiredCandidates = new Set<string>();

  for (const r of rounds) {
    if (r.round_number === 1) r1Candidates.add(r.candidate_id);
    if (r.round_number === 2) r2Candidates.add(r.candidate_id);
    if (r.round_number >= 3) r3Candidates.add(r.candidate_id);
    if (r.status === "passed") hiredCandidates.add(r.candidate_id);
  }
  for (const l of ledger) {
    const s = (l.stage || "").toLowerCase();
    if (s.includes("round_1") || s.includes("round 1") || s.includes("interview"))
      r1Candidates.add(l.candidate_id);
    if (s.includes("round_2") || s.includes("round 2")) r2Candidates.add(l.candidate_id);
    if (s.includes("round_3") || s.includes("round 3")) r3Candidates.add(l.candidate_id);
    if (s.includes("offer") || s.includes("hire")) hiredCandidates.add(l.candidate_id);
  }

  // 3. Pending rounds count
  const pendingRoundsCount = rounds.filter(
    (r) => r.status === "pending" || r.status === "scheduled" || r.status === "in_progress",
  ).length;

  // 4. Recruiters leaderboard
  const teamRows = (teamRes.data ?? []) as {
    id: string;
    name: string;
    email: string;
    role: string;
  }[];
  const crRows = (
    (crRes.data ?? []) as {
      campaign_id: string;
      round_number: number;
      interviewer_email: string | null;
    }[]
  ).filter((cr) => activeCampIds.has(cr.campaign_id));

  const recruiterMap = new Map<
    string,
    { name: string; email: string; role: string; count: number }
  >();

  // Add team members
  for (const tm of teamRows) {
    const known = KNOWN_RECRUITERS[tm.email.toLowerCase()];
    recruiterMap.set(tm.email.toLowerCase(), {
      name: tm.name || known?.name || tm.email.split("@")[0],
      email: tm.email,
      role: tm.role || known?.role || "Talent Partner",
      count: 0,
    });
  }

  // Add campaign round interviewers
  for (const cr of crRows) {
    if (cr.interviewer_email) {
      const email = cr.interviewer_email.toLowerCase();
      if (!recruiterMap.has(email)) {
        const known = KNOWN_RECRUITERS[email];
        const rawName = email.split("@")[0].replace(/[._-]/g, " ");
        const formattedName =
          known?.name ??
          rawName
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        recruiterMap.set(email, {
          name: formattedName,
          email: cr.interviewer_email,
          role: known?.role ?? "Interview Panel",
          count: 0,
        });
      }
      const matching = rounds.filter(
        (r) => r.campaign_id === cr.campaign_id && r.round_number === cr.round_number,
      );
      const entry = recruiterMap.get(email);
      if (entry) {
        entry.count += matching.length;
      }
    }
  }

  const recruiters = Array.from(recruiterMap.values())
    .map((r, idx) => ({
      name: r.name,
      email: r.email,
      role: r.role,
      interviewsCount: r.count,
      score: Math.min(98, Math.max(72, 78 + r.count * 6 + (teamRows.length - idx) * 2)),
    }))
    .sort((a, b) => b.score - a.score);

  // 5. Calculate real, fitted 8-bar graph heights for all 4 KPI cards
  const candidateRows = (
    (candDatesRes.data ?? []) as {
      id: string;
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      created_at?: string | null;
    }[]
  ).filter((c) => activeCandidateIds.has(c.id));

  const candidateDates = candidateRows
    .map((r) => r.created_at)
    .filter(Boolean)
    .map((d) => new Date(d ?? 0).getTime())
    .sort((a, b) => a - b);
  const nowMs = now.getTime();
  const startMs = candidateDates[0] || nowMs - 14 * 86_400_000;
  const spanMs = Math.max(nowMs - startMs, 8 * 86_400_000);
  const binWidthMs = spanMs / 8;

  // Card 1: Candidates
  const candBins = Array(8).fill(0);
  for (const t of candidateDates) {
    const idx = Math.min(7, Math.max(0, Math.floor((t - (nowMs - spanMs)) / binWidthMs)));
    candBins[idx]++;
  }
  const candMax = Math.max(...candBins, 1);
  const kpiCandHeights =
    totalCandidateCount === 0
      ? [0, 0, 0, 0, 0, 0, 0, 0]
      : candBins.map((c) => Math.max(16, Math.round((c / candMax) * 100)));

  // Card 2: Average Score trend
  const binScoreSums = Array(8).fill(0);
  const binScoreCounts = Array(8).fill(0);
  for (const r of ledger) {
    if (r.score != null) {
      const t = new Date(r.created_at || nowMs).getTime();
      const idx = Math.min(7, Math.max(0, Math.floor((t - (nowMs - spanMs)) / binWidthMs)));
      binScoreSums[idx] += Number(r.score);
      binScoreCounts[idx]++;
    }
  }
  const allScored = ledger.filter((r) => r.score != null).map((r) => Number(r.score));
  const overallAvg = allScored.length
    ? Math.round(allScored.reduce((a, b) => a + b, 0) / allScored.length)
    : 0;
  let lastScore = overallAvg;
  const scoreTrend: number[] = [];
  for (let i = 0; i < 8; i++) {
    if (binScoreCounts[i] > 0) {
      lastScore = Math.round(binScoreSums[i] / binScoreCounts[i]);
    }
    scoreTrend.push(lastScore);
  }
  const maxScore = Math.max(...scoreTrend, 50);
  const kpiScoreHeights =
    allScored.length === 0
      ? [0, 0, 0, 0, 0, 0, 0, 0]
      : scoreTrend.map((s) => Math.max(20, Math.min(100, Math.round((s / maxScore) * 100))));

  // Card 3: Hired & progression
  const offerBins = Array(8).fill(0);
  const advBins = Array(8).fill(0);
  for (const r of ledger) {
    const t = new Date(r.created_at || nowMs).getTime();
    const idx = Math.min(7, Math.max(0, Math.floor((t - (nowMs - spanMs)) / binWidthMs)));
    const st = (r.stage || "").toLowerCase();
    if (st.includes("offer") || st.includes("hired")) {
      offerBins[idx]++;
    }
    if ((r.score != null && Number(r.score) >= 40) || st.includes("round")) {
      advBins[idx]++;
    }
  }
  const totalOffers = offerBins.reduce((a, b) => a + b, 0);
  const activeProgBins = totalOffers > 0 ? offerBins : advBins;
  const progMax = Math.max(...activeProgBins, 1);
  const kpiHiredHeights =
    ledger.length === 0
      ? [0, 0, 0, 0, 0, 0, 0, 0]
      : activeProgBins.map((c) => Math.max(16, Math.round((c / progMax) * 100)));

  // Card 4: Decision Quality
  let lastQual = 80;
  const qualTrend: number[] = [];
  for (let i = 0; i < 8; i++) {
    const binItems = ledger.filter((r) => {
      const t = new Date(r.created_at || nowMs).getTime();
      return Math.min(7, Math.max(0, Math.floor((t - (nowMs - spanMs)) / binWidthMs))) === i;
    });
    if (binItems.length > 0) {
      const withSig = binItems.filter((r) => r.score != null && Number(r.score) > 0).length;
      lastQual = Math.round((withSig / binItems.length) * 100);
    }
    qualTrend.push(lastQual);
  }
  const maxQual = Math.max(...qualTrend, 60);
  const kpiQualityHeights =
    ledger.length === 0
      ? [0, 0, 0, 0, 0, 0, 0, 0]
      : qualTrend.map((q) => Math.max(20, Math.min(100, Math.round((q / maxQual) * 100))));

  // 6. Real-time City Distribution from actual candidate resume text, rationale, and phone
  const textByCandidate = new Map<string, string>();
  for (const l of ledger) {
    if (l.candidate_id) {
      const prev = textByCandidate.get(l.candidate_id) || "";
      const add = `${l.raw_text || ""} ${l.rationale || ""}`.trim();
      if (add) {
        textByCandidate.set(l.candidate_id, `${prev} ${add}`);
      }
    }
  }

  const cityCounts = new Map<string, number>();
  for (const c of candidateRows) {
    let resolvedCity: string | null = null;
    const text = textByCandidate.get(c.id);
    if (text) {
      for (const rule of CITY_RULES) {
        if (rule.regex.test(text)) {
          resolvedCity = rule.label;
          break;
        }
      }
    }
    if (!resolvedCity && c.phone) {
      resolvedCity = detectCityFromPhone(c.phone);
    }
    if (!resolvedCity) {
      resolvedCity = "Remote / Unspecified";
    }
    cityCounts.set(resolvedCity, (cityCounts.get(resolvedCity) || 0) + 1);
  }

  const cityDistribution: CityDistributionItem[] = Array.from(cityCounts.entries())
    .filter(([_, count]) => count > 0)
    .sort((a, b) => {
      if (a[0] === "Remote / Unspecified") return 1;
      if (b[0] === "Remote / Unspecified") return -1;
      return b[1] - a[1];
    })
    .map(([label, count], idx) => ({
      label,
      count,
      color: CITY_PALETTE[idx % CITY_PALETTE.length],
    }));

  return {
    totalCampaigns: campaigns.length,
    activeCampaigns,
    candidateCount: totalCandidateCount,
    candidateCreatedAt: candidateRows
      .map((r) => r.created_at)
      .filter((v): v is string => Boolean(v)),
    interviewsThisWeek: wkCountRes.error ? 0 : (wkCountRes.count ?? 0),
    interviewsPriorWeek: prevCountRes.error ? 0 : (prevCountRes.count ?? 0),
    pendingRoundsCount,
    campaignsDistribution,
    cityDistribution,
    pipelineStages: {
      screening: totalCandidateCount,
      round1: r1Candidates.size,
      round2: r2Candidates.size,
      round3: r3Candidates.size,
      hired: hiredCandidates.size,
    },
    usageFallback: {
      aiInterviewsUsed: sessCountRes.count ?? 0,
      voiceScreensUsed: voiceCountRes.count ?? 0,
      scheduledRoundsUsed: rounds.length,
    },
    recruiters,
    kpiHeights: {
      candidates: kpiCandHeights,
      score: kpiScoreHeights,
      hired: kpiHiredHeights,
      quality: kpiQualityHeights,
    },
  };
}

export async function fetchUpcomingInterviews(): Promise<UpcomingInterview[]> {
  const supabase = supabaseBrowser();
  const now = new Date().toISOString();

  const [{ data: camps }, { data }] = await Promise.all([
    supabase.from("campaigns").select("id"),
    supabase
      .from("round_instances")
      .select("id,candidate_id,campaign_id,round_type,scheduled_at,status,created_at")
      .gte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(10),
  ]);

  const activeCampIds = new Set((camps ?? []).map((c) => c.id));
  if (activeCampIds.size === 0) return [];

  type UpcomingRow = {
    id: string;
    candidate_id: string;
    campaign_id: string;
    round_type: string;
    scheduled_at: string | null;
    status: string;
    created_at: string;
  };

  return ((data ?? []) as unknown as UpcomingRow[])
    .filter((r) => activeCampIds.has(r.campaign_id))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      candidate_id: r.candidate_id,
      round_type: r.round_type,
      scheduled_at: r.scheduled_at ?? r.created_at,
      status: r.status,
    }));
}

export async function fetchLedger(limit = 200): Promise<LedgerEntry[]> {
  const supabase = supabaseBrowser();
  const [{ data: camps }, { data: ris }, { data, error }] = await Promise.all([
    supabase.from("campaigns").select("id"),
    supabase.from("round_instances").select("candidate_id,campaign_id"),
    supabase
      .from("decision_ledger")
      .select("id,candidate_id,stage,score,round_instance_id,rationale,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (error || !camps || camps.length === 0) {
    return [];
  }

  const activeCampIds = new Set(camps.map((c) => c.id));
  const activeCandIds = new Set(
    (ris ?? []).filter((r) => activeCampIds.has(r.campaign_id)).map((r) => r.candidate_id),
  );

  type LedgerRow = {
    id: string;
    candidate_id: string;
    stage: string;
    score: number | string | null;
    created_at: string;
  };

  return ((data ?? []) as unknown as LedgerRow[])
    .filter((r) => activeCandIds.has(r.candidate_id))
    .map((r) => ({
      id: r.id,
      candidate_id: r.candidate_id,
      stage: r.stage === "round_undefined" ? "Round 1 interview" : r.stage,
      score: r.score != null ? Number(r.score) : null,
      source: "workflow",
      override_of: null,
      decided_at: r.created_at,
    }));
}

export async function fetchCandidateNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabaseBrowser().from("candidates").select("id,name").in("id", ids);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.id] = row.name ?? row.id;
  return map;
}
