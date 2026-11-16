export interface DashboardAgentActionButton {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface DashboardAgentResponse {
  reply: string;
  suggestions?: string[];
  actionButtons?: DashboardAgentActionButton[];
  ticketId?: string;
}

export const PLATFORM_KNOWLEDGE = {
  campaigns: {
    title: "Hiring Campaigns & Drives",
    summary:
      "Campaigns allow you to define job specifications, create multiple evaluation stages, and track candidate pipelines automatically.",
    steps: [
      "Navigate to Campaigns in the sidebar.",
      "Click 'New Campaign' in the top-right toolbar.",
      "Step 0 (Basics): Enter role name, openings (0 to infinite), hiring dates, and paste or upload the Job Description document.",
      "Step 1 (Rounds): Choose evaluation formats (AI Resume Screen, DialNexa Voice Phone Call, AI Video Interview, Human Interview, Practical Assignment) and set cutoff threshold scores (0-100).",
      "Step 2 (Channels & Cadence): Configure touchpoint intervals across Email, WhatsApp, and SMS.",
    ],
    limits: {
      free: "1 open campaign",
      basic: "5 open campaigns",
      growth: "Unlimited open campaigns",
      enterprise: "Unlimited open campaigns",
    },
  },
  resumeScreening: {
    title: "AI Resume Screening & Ranking",
    summary:
      "Automated extraction and evaluation of candidate CVs benchmarked directly against your campaign's Job Description.",
    features: [
      "Accepts single PDF documents or bulk ZIP archives containing multiple candidate resumes.",
      "Scores each applicant on a 0-100 scale based on technical skills, experience relevance, and role qualifications.",
      "Detects key strengths, missing prerequisites, and provides hiring manager summary notes.",
    ],
  },
  voiceScreening: {
    title: "DialNexa AI Voice Phone Screening",
    summary:
      "ScalePods proprietary conversational Voice AI engine that autonomously calls candidates on the phone to conduct verbal pre-screening.",
    features: [
      "Select voice persona (Maya, David, etc.) and calibrate speech speed (0.7x to 1.3x).",
      "Custom screening topics and behavioral questions tailored per role.",
      "Automated call recording playback, sentiment scoring, and verbatim transcripts inside the candidate details page.",
      "Available on Basic (20 calls/mo), Growth (100 calls/mo), and Enterprise plans.",
    ],
  },
  interviews: {
    title: "AI & Human Interview Stages",
    summary:
      "Multi-stage evaluation support including vision-proctored AI video interviews and recruiter calendar bookings.",
    features: [
      "AI Video Interviews: Real-time webcam proctoring monitoring gaze direction, multi-face presence, and candidate spoken answers.",
      "Human Recruiter Interviews: Direct Google Calendar sync with self-serve candidate booking slots.",
      "Practical Assignments: Configurable project briefs, deadline countdowns, and automated AI scoring upon submission.",
    ],
  },
  offers: {
    title: "Offer AI Generation & Dispatch",
    summary:
      "Transform employment agreements into automated templates with AI variable extraction and candidate email dispatch.",
    features: [
      "Upload custom Word/PDF offer letters or select pre-built master templates.",
      "AI automatically extracts dynamic placeholders like {{CANDIDATE_NAME}}, {{ROLE}}, {{SALARY}}, {{START_DATE}}.",
      "Interactive in-browser editing before compiling to a verified PDF and emailing to the candidate.",
    ],
  },
  billing: {
    title: "Subscription Plans & Razorpay Billing",
    summary:
      "Transparent pricing tiers supporting high-growth recruiting teams. Upgrade anytime via Razorpay.",
    plans: [
      { name: "Free Tier", price: "$0/mo", limit: "10 resume screens, 1 active campaign" },
      {
        name: "Basic Plan",
        price: "$149/mo",
        limit: "250 resume screens, 50 AI interviews, 20 voice screening calls",
      },
      {
        name: "Growth Plan",
        price: "$349/mo",
        limit:
          "Unlimited resume screens, 200 AI interviews, 100 voice calls, assignments, calendar sync",
      },
      {
        name: "Enterprise Plan",
        price: "$1,099/mo or custom",
        limit:
          "Unlimited resume screens, 6+ custom stages, dedicated RBAC team workspaces, 24/7 SLA",
      },
    ],
  },
};

export function getScalePodsDashboardAnswer(message: string): DashboardAgentResponse {
  const q = message.toLowerCase().trim();

  // Support / Help request
  if (
    q.includes("support") ||
    q.includes("human") ||
    q.includes("contact") ||
    q.includes("email") ||
    q.includes("ticket") ||
    q.includes("issue") ||
    q.includes("bug") ||
    q.includes("error") ||
    q.includes("not working") ||
    q.includes("help")
  ) {
    return {
      reply:
        "I'm here to help! If you're encountering an issue or need assistance from our engineering and support team, click **'Email Support'** below or let me know what you need, and I will dispatch a support ticket directly to our engineers.\n\n" +
        "You can also reach our team directly on WhatsApp at **+91 98672 71848** or email **info@scalepods.co**.",
      suggestions: [
        "Submit support ticket",
        "How do I create a campaign?",
        "What are the plan limits?",
      ],
      actionButtons: [
        { label: "Open Campaigns", href: "/campaigns" },
        {
          label: "WhatsApp Support (+91 98672 71848)",
          href: "https://wa.me/919867271848",
          isExternal: true,
        },
      ],
    };
  }

  // Voice screening / DialNexa
  if (
    q.includes("voice") ||
    q.includes("dialnexa") ||
    q.includes("phone") ||
    q.includes("call") ||
    q.includes("audio")
  ) {
    return {
      reply:
        "### DialNexa AI Voice Phone Screening\n\n" +
        "ScalePods features an autonomous Voice AI screening engine that places phone calls to candidates:\n\n" +
        "- **Voice Persona & Speed:** Configure custom voices (e.g. Maya, David) and adjust cadence from 0.7x to 1.3x.\n" +
        "- **Custom Screening Prompts:** Define mandatory questions and technical topics for the role.\n" +
        "- **Test Calls:** Recruiter can test the call live before triggering calls to applicants.\n" +
        "- **Recordings & Transcripts:** Every call is recorded with verbatim transcript and sentiment analysis on the candidate's profile.\n\n" +
        "Voice screening is included on **Basic** (20 calls/mo), **Growth** (100 calls/mo), and **Enterprise** plans.",
      suggestions: [
        "How do I add voice screening to a campaign?",
        "What happens if candidate doesn't pick up?",
        "View plan pricing",
      ],
      actionButtons: [
        { label: "Configure in Campaigns", href: "/campaigns" },
        { label: "View Billing Tiers", href: "/billing" },
      ],
    };
  }

  // Campaigns / Creating
  if (
    q.includes("campaign") ||
    q.includes("create") ||
    q.includes("wizard") ||
    q.includes("job description") ||
    q.includes("jd") ||
    q.includes("opening")
  ) {
    return {
      reply:
        "### Hiring Campaigns Overview\n\n" +
        "To launch a new hiring campaign:\n\n" +
        "1. Go to **Campaigns** in the sidebar.\n" +
        "2. Click the **+ New Campaign** button in the top-right toolbar.\n" +
        "3. **Step 0 (Basics):** Enter role title, location, number of openings (0 to infinite), and upload or paste the Job Description.\n" +
        "4. **Step 1 (Rounds):** Set up your evaluation stages (Resume Screen, Voice Call, Video Interview, Human Interview, Practical Assignment) and define cutoff scores.\n" +
        "5. **Step 2 (Cadence):** Configure candidate reminder intervals across Email and WhatsApp.\n\n" +
        "*Tip:* Campaign drafts are auto-saved locally so you won't lose your progress if you step away.",
      suggestions: [
        "How do I bulk upload resumes?",
        "How many campaigns can I run?",
        "How does scoring work?",
      ],
      actionButtons: [
        { label: "Go to Campaigns", href: "/campaigns" },
        { label: "Launch New Campaign", href: "/campaigns?tab=new" },
      ],
    };
  }

  // Resume screening
  if (
    q.includes("resume") ||
    q.includes("cv") ||
    q.includes("score") ||
    q.includes("scoring") ||
    q.includes("rubric") ||
    q.includes("upload")
  ) {
    return {
      reply:
        "### AI Resume Screening & Scoring\n\n" +
        "ScalePods automatically evaluates candidate CVs against your campaign's Job Description:\n\n" +
        "- **Bulk Upload:** Upload a `.zip` archive containing multiple PDF resumes or drop single files directly.\n" +
        "- **0–100% Alignment Score:** AI assesses core skills, years of relevant experience, and role qualifications.\n" +
        "- **Strengths & Gaps:** Highlights candidate proficiencies and missing prerequisites.\n" +
        "- **Cutoff Thresholds:** Filter candidates automatically above your specified pass mark to advance them to the next interview round.",
      suggestions: [
        "What formats are supported?",
        "How do I bulk advance candidates?",
        "Guide to resume scoring",
      ],
      actionButtons: [
        { label: "How We Score Guide", href: "/guide/resume-scoring" },
        { label: "View Campaigns", href: "/campaigns" },
      ],
    };
  }

  // Offers
  if (
    q.includes("offer") ||
    q.includes("letter") ||
    q.includes("salary") ||
    q.includes("contract") ||
    q.includes("agreement")
  ) {
    return {
      reply:
        "### Offer AI Generation & Dispatch\n\n" +
        "ScalePods provides an end-to-end offer letter workflow:\n\n" +
        "1. **Template Selection:** Upload your organization's custom Word (`.docx`), PDF, or HTML offer letter, or pick a master template.\n" +
        "2. **AI Variable Extraction:** The AI detects placeholders like `{{CANDIDATE_NAME}}`, `{{ROLE}}`, `{{SALARY}}`, and `{{START_DATE}}`.\n" +
        "3. **Interactive Editor:** Fine-tune terms and review live preview.\n" +
        "4. **PDF & Email Dispatch:** Generates a high-resolution branded PDF and emails it directly to the hired candidate.",
      suggestions: [
        "How do I upload custom templates?",
        "Can I edit offer variables?",
        "Connect with support",
      ],
      actionButtons: [{ label: "View Campaigns", href: "/campaigns" }],
    };
  }

  // Pricing / Billing
  if (
    q.includes("pricing") ||
    q.includes("plan") ||
    q.includes("tier") ||
    q.includes("cost") ||
    q.includes("price") ||
    q.includes("billing") ||
    q.includes("upgrade")
  ) {
    return {
      reply:
        "### ScalePods Subscription Plans\n\n" +
        "- **Free Tier ($0/mo):** 10 resume screens/mo, 1 active campaign, basic tracking.\n" +
        "- **Basic Plan ($149/mo):** 250 resume screens, 50 AI interviews, 20 AI voice screening calls, WhatsApp updates, up to 2 interview rounds.\n" +
        "- **Growth Plan ($349/mo):** Unlimited resume screens, 200 AI interviews, 100 AI voice calls, take-home assignments, Google Calendar sync, up to 4 interview rounds.\n" +
        "- **Enterprise Plan ($1,099/mo or custom):** Unlimited resume screens, 6+ custom stages, dedicated RBAC team workspaces, custom cutoffs, priority 24/7 SLA.\n\n" +
        "Subscriptions are billed securely through Razorpay with cards, UPI, and international methods.",
      suggestions: [
        "What happens if I exceed limits?",
        "How do I upgrade my plan?",
        "Contact sales team",
      ],
      actionButtons: [{ label: "Go to Billing", href: "/billing" }],
    };
  }

  // Default General Fallback
  return {
    reply:
      "I am your **ScalePods Talent Intelligence Assistant**. I can help you with anything inside this dashboard, including:\n\n" +
      "- Creating and managing **Hiring Campaigns**\n" +
      "- Configuring **DialNexa AI Voice screening calls**\n" +
      "- Running **AI Resume Screening** and reviewing candidate scores\n" +
      "- Generating and sending **AI Offer Letters**\n" +
      "- Managing your **Subscription Plan & Billing**\n\n" +
      "If you have a question that isn't answered here or need technical support, you can click **'Contact Support'** to dispatch an email ticket directly to our engineering team.",
    suggestions: [
      "How do I create a new campaign?",
      "How does DialNexa voice screening work?",
      "Contact support team",
    ],
    actionButtons: [
      { label: "New Campaign", href: "/campaigns?tab=new" },
      { label: "View Billing", href: "/billing" },
    ],
  };
}
