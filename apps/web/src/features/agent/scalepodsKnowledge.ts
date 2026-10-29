export interface AgentActionButton {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface AgentResponse {
  reply: string;
  suggestions?: string[];
  actionButtons?: AgentActionButton[];
}

export interface CrawledArticle {
  title: string;
  category: string;
  date: string;
  summary: string;
  url: string;
}

export interface CrawledCaseStudy {
  client: string;
  location: string;
  scope: string;
  metrics: string[];
  description: string;
  url: string;
}

export const CRAWLED_BLOG_ARTICLES: CrawledArticle[] = [
  {
    title: "The Future of Workflows: Why AI Automation Sets the Standard in 2026",
    category: "AI Automation",
    date: "September 8, 2026",
    summary:
      "How connected systems replaced manual admin work — and why sitting this one out is turning into a real operational risk.",
    url: "https://www.scalepods.co/blog/the-future-of-workflows-why-ai-automation-sets-the-standard-in-2026",
  },
  {
    title: "Operations Automation: The Complete Guide for 2026 (Benefits, AI & Best Practices)",
    category: "AI Automation",
    date: "September 4, 2026",
    summary:
      "A practical guide to operations automation in 2026 — AI-powered audit workflows, purchase and sales verification, compliance automation, implementation strategy, and best practices for modern operations teams.",
    url: "https://www.scalepods.co/blog/operations-automation-guide",
  },
  {
    title: "5 Ways AI Assistants Are Transforming Operations (And How to Implement Them)",
    category: "AI Automation",
    date: "August 22, 2026",
    summary:
      "Every growing company reaches a critical tipping point where operational friction threatens to stall revenue growth. Discover 5 high-impact ways AI assistants are transforming enterprise operations.",
    url: "https://www.scalepods.co/blog/5-ways-ai-assistants-transforming-operations",
  },
  {
    title: "AI Employees: Meet the Digital Workforce Changing How Businesses Get Work Done",
    category: "AI Automation",
    date: "August 12, 2026",
    summary:
      "A practical look at how AI employees work, and how four of them — Alex (Sales), Maya (Marketing), Harper (HR), and Orion (Operations) — cover operations without ever clocking out.",
    url: "https://www.scalepods.co/blog/ai-employees-digital-workforce-guide",
  },
  {
    title: "The AI Marketing Edge: How AI Is Reshaping Marketing in 2026",
    category: "Marketing",
    date: "August 6, 2026",
    summary:
      "See how AI is transforming email, content, lead gen, social, chatbots & personalization in marketing with 2026 data and real ROI figures.",
    url: "https://www.scalepods.co/blog/the-ai-marketing-edge-how-ai-is-reshaping-marketing-in-2026",
  },
  {
    title: "AI Automation ROI: Real Business Impact for Sales, Marketing & HR",
    category: "ROI & Impact",
    date: "August 1, 2026",
    summary:
      "See how AI automation drives measurable ROI in sales, marketing, and HR – backed by 2025-2026 data. Explore ScalePods done-for-you automation pods.",
    url: "https://www.scalepods.co/blog/ai-automation-roi-real-business-impact",
  },
  {
    title: "How to Implement Sales Workflow Automation (Step-by-Step)",
    category: "Sales Automation",
    date: "July 27, 2026",
    summary:
      "A 4-step framework for rolling out sales workflow automation without breaking your process — plus the 5 most common mistakes to avoid.",
    url: "https://www.scalepods.co/blog/how-to-implement-sales-workflow-automation",
  },
  {
    title: "Sales Automation: The Complete Guide for 2026",
    category: "Sales Automation",
    date: "July 20, 2026",
    summary:
      "Sales teams in 2026 lose up to 60% of their time to manual data entry, prospecting, and chasing follow-ups. Learn how modern AI-powered sales automation scales pipelines without headcount expansion.",
    url: "https://www.scalepods.co/blog/sales-workflow-automation-complete-guide-2026",
  },
  {
    title: "HR Automation: The Complete Guide for 2026",
    category: "HR & Recruitment",
    date: "July 15, 2026",
    summary:
      "HR teams face unprecedented hiring pressures, compliance complexity, and employee expectations. Learn how workflow automation cuts administrative screening burden by 80%.",
    url: "https://www.scalepods.co/blog/hr-automation-complete-guide-2026",
  },
  {
    title: "Marketing Automation: The Complete Guide for 2026",
    category: "Marketing",
    date: "July 8, 2026",
    summary:
      "Marketing teams manage more channels, higher acquisition costs, and more content demands. Learn how AI-powered automation helps you launch campaigns faster and scale results without scaling headcount.",
    url: "https://www.scalepods.co/blog/marketing-automation-complete-guide-2026",
  },
  {
    title: "How to Automate Your SDR Workflow with AI (Step-by-Step Guide for 2026)",
    category: "Sales Automation",
    date: "May 20, 2026",
    summary:
      "Prospecting, cold email personalization, and follow-ups can consume up to 70% of an SDR's day. Learn how to combine AI workflows with human oversight to qualify leads and book 3x more meetings.",
    url: "https://www.scalepods.co/blog/how-to-automate-your-sdr-workflow-with-ai",
  },
  {
    title: "Top 10 Automation Tools Every Agency Needs in 2025",
    category: "Insights",
    date: "April 21, 2026",
    summary:
      "A breakdown of the essential stack: Make, Zapier, Clay, and the new wave of AI agents.",
    url: "https://www.scalepods.co/blog/top-10-automation-tools-every-agency-needs-in-2025-mo8qym7y",
  },
  {
    title: "The ROI of AI: Measuring the Impact of Automation",
    category: "Insights",
    date: "April 21, 2026",
    summary:
      "Calculate your actual dollar value saved from AI-driven workflows and streamline enterprise cost centers.",
    url: "https://www.scalepods.co/blog/the-roi-of-ai-measuring-the-impact-of-automation-mo8mk8hu",
  },
  {
    title: "Beyond Bots: Real Business Impact from AI Integration",
    category: "Insights",
    date: "January 1, 2025",
    summary:
      "Explore real-world examples of how AI automation goes beyond simple chatbots to deliver measurable business value across teams.",
    url: "https://www.scalepods.co/blog/beyond-bots-real-business-impact-ai-integration",
  },
];

export const CRAWLED_CASE_STUDIES: CrawledCaseStudy[] = [
  {
    client: "ZV Steels",
    location: "India",
    scope: "Autonomous HR Recruitment, 3-Way Logistics Audits & Wholesale Cadence",
    metrics: [
      "80% reduction in HR candidate screening effort",
      "Automated CV scoring against Job Descriptions using Claude AI",
      "3-way logistics audit cross-referencing Supplier Invoices, E-Way Bills & Lorry Receipts (within ±300kg tolerance)",
      "6-day wholesale follow-up cadence orchestrating Email, WhatsApp & automated AI Voice calls",
    ],
    description:
      "A 4-generation steel giant replaced manual bottlenecks across recruitment, freight audits, and wholesale outreach with four purpose-built automated engines from ScalePods.",
    url: "https://www.scalepods.co/case-study/zv-steels-recruitment-automation-tool",
  },
  {
    client: "Lotus Manor Real Estate",
    location: "Dubai, UAE",
    scope: "Omnichannel Real Estate Sales Automation",
    metrics: [
      "1,000+ property prospects reached",
      "7,000+ automated follow-ups sent across WhatsApp, Email & AI Voice",
      "229 direct qualified responses generated",
      "21% overall engagement and response rate",
    ],
    description:
      "ScalePods implemented an AI-enabled sales workflow coordinating multi-channel outreach and bi-directional CRM sync for high-value Dubai real estate leads.",
    url: "https://www.scalepods.co/case-study/lotus-manor-real-estate-sales-automation-dubai",
  },
  {
    client: "Lootah Group of Companies",
    location: "Dubai, UAE",
    scope: "Enterprise Procurement & Logistics Workflow Automation",
    metrics: [
      "Automated vendor invoice validation and purchase order matching",
      "Elimination of reconciliation bottlenecks across ERP systems",
      "End-to-end operational visibility and automated audit trails",
    ],
    description:
      "Large enterprise procurement automation streamlining complex purchase and sales verification for the Lootah Group.",
    url: "https://www.scalepods.co",
  },
  {
    client: "A Squared Real Estate",
    location: "Dubai, UAE",
    scope: "Automated Lead-to-Booking Pipeline",
    metrics: [
      "Instant lead intake from portal inquiries",
      "Automated 24/7 calendar booking & WhatsApp engagement",
      "3x acceleration in viewing slot confirmations",
    ],
    description:
      "End-to-end sales workflow automation capturing inquiries, qualifying buyers, and scheduling viewing slots automatically.",
    url: "https://www.scalepods.co",
  },
];

export const SCALEPODS_COMPANY = {
  name: "ScalePods",
  tagline: "Growth, Automated. Automate the Busywork. Unlock Growth.",
  website: "https://www.scalepods.co",
  globalUrl: "https://www.scalepods.co/global",
  blogUrl: "https://www.scalepods.co/blog",
  contactEmail: "info@scalepods.co",
  supportEmail: "support@scalepods.co",
  whatsAppPhone: "+91 98672 71848",
  whatsAppLink:
    "https://wa.me/919867271848?text=Hi%20ScalePods!%20I'm%20interested%20in%20discussing%20custom%20workflow%20automation%20solutions.",
  linkedIn: "https://www.linkedin.com/company/scalepods-co/",
  instagram: "https://www.instagram.com/scalepods.co/",
  mission:
    "Architecting the future of enterprise operations through autonomous Agentic AI ecosystems, enterprise process automation, and intelligent automation.",
  claudePartnership: {
    status: "Official Services Partner in the Claude Partner Network Services Track (by Anthropic)",
    description:
      "ScalePods works directly with Claude to help organizations design, deploy, and scale intelligent workflows, combining AI workflow automation with secure implementation to automate operations and accelerate growth.",
    pillars: [
      "Built for Enterprise: Secure, scalable, and compliant AI solutions built for complex business environments.",
      "Certified Claude Expertise: Certified team delivering Claude solutions with proven methodologies and best practices.",
      "End-to-End Implementation: Managing workflow strategy, design, deployment, and optimization end-to-end.",
      "Measurable Impact: Boosting workflow efficiency by 30%+ and delivering real ROI without headcount bloat.",
    ],
  },
  aiEmployees: [
    {
      name: "Alex",
      role: "AI Sales Representative",
      focus: "B2B prospecting, lead enrichment, personalized multichannel outreach, and CRM sync.",
    },
    {
      name: "Maya",
      role: "AI Marketing Strategist",
      focus:
        "Automated campaign generation, audience segmentation, content, and cross-channel distribution.",
    },
    {
      name: "Harper",
      role: "AI HR Specialist",
      focus:
        "Resume parsing, JD match scoring, voice screening calls, and zero-chase interview scheduling.",
    },
    {
      name: "Orion",
      role: "AI Operations Director",
      focus: "3-way logistics invoice reconciliation, procurement audit automation, and ERP sync.",
    },
  ],
  podSolutions: [
    {
      name: "HR & Recruitment Automation Pod (This Platform)",
      desc: "Source, screen & schedule top talent on autopilot with AI resume scoring, conversational voice screening, and proctored interview rounds.",
      url: "https://www.scalepods.co/solution/hr-workflow-automation",
    },
    {
      name: "Sales Workflow Automation Pod",
      desc: "Convert leads into booked customers with AI-powered outreach, CRM enrichment, and automated pipeline acceleration.",
      url: "https://www.scalepods.co/solution/sales-workflow-automation",
    },
    {
      name: "Ops & Customer Care Automation Pod",
      desc: "Deliver 24/7 intelligent customer care, procurement workflows, and ticketing without scaling headcount.",
      url: "https://www.scalepods.co/solution/ops-workflow-automation",
    },
    {
      name: "Industry-Specific AI Pods",
      desc: "Custom AI automation for Real Estate, Manufacturing & Procurement, Energy, and High-Growth Tech Startups.",
      url: "https://www.scalepods.co/global",
    },
  ],
  trustedBrands: [
    "BECO Capital",
    "GammaCode",
    "Krafty",
    "Lotus Manor Dubai",
    "Lootah Group of Companies",
    "ZV Steels India",
    "A Squared Dubai",
    "eEquals",
    "PropertyGeld",
    "Passionfruit",
    "Suphal Media",
    "Victory Energy",
    "HobbyFi",
    "Break The Code",
    "Guileo AI",
    "Aspen Real Estate",
    "Naples Homes",
    "Bennett Realty Solutions",
  ],
};

export const SCALEPODS_HR_TOOL = {
  name: "ScalePods Talent Intelligence Platform",
  description:
    "ScalePods' AI-powered hiring automation platform designed to help lean recruiting teams and fast-growing organizations automate candidate screening, evaluate competencies against Job Descriptions, conduct automated AI voice and live interview rounds, and streamline hiring pipelines without complexity.",
  plans: [
    {
      name: "Free Tier",
      price: "$0 / month",
      highlights: "10 resume screens, 1 active campaign, basic applicant tracking.",
    },
    {
      name: "Basic Plan",
      price: "$149 / month",
      highlights:
        "250 resume screens/mo, 50 AI interviews, WhatsApp updates, AI voice phone screening, up to 2 interview rounds.",
    },
    {
      name: "Growth Plan",
      price: "$299 / month",
      highlights:
        "1,000 resume screens/mo, 200 AI interviews, assignment rounds, Google Calendar sync, up to 4 interview rounds.",
    },
    {
      name: "Enterprise Plan",
      price: "$599 / month or custom",
      highlights:
        "Unlimited resume screens, up to 6+ custom stages, dedicated RBAC team workspaces, custom cutoffs, priority 24/7 SLA.",
    },
  ],
};

export function getScalePodsAnswer(userInput: string): AgentResponse {
  const query = userInput.toLowerCase().trim();

  // ── Blogs / Articles & Pagination ──
  if (
    query.includes("blog") ||
    query.includes("article") ||
    query.includes("insight") ||
    query.includes("post") ||
    query.includes("news")
  ) {
    const isPage2 = query.includes("page 2") || query.includes("more") || query.includes("next");
    const isPage3 = query.includes("page 3");

    let pageItems: CrawledArticle[];
    let pageTitle = "Page 1 of 3";
    let nextSuggestions: string[];

    if (isPage3) {
      pageItems = CRAWLED_BLOG_ARTICLES.slice(10, 14);
      pageTitle = "Page 3 of 3 (Latest)";
      nextSuggestions = ["Show Blog Page 1", "Show Case Studies", "What is ScalePods?"];
    } else if (isPage2) {
      pageItems = CRAWLED_BLOG_ARTICLES.slice(5, 10);
      pageTitle = "Page 2 of 3";
      nextSuggestions = ["Show Blog Page 3", "Show Blog Page 1", "Show Case Studies"];
    } else {
      pageItems = CRAWLED_BLOG_ARTICLES.slice(0, 5);
      pageTitle = "Page 1 of 3";
      nextSuggestions = ["Show Blog Page 2", "Show Case Studies", "Tell me about AI Employees"];
    }

    const itemsText = pageItems
      .map(
        (b, i) =>
          `${i + 1}. **[${b.title}](${b.url})**\n   *${b.category} • ${b.date}*\n   ${b.summary}`,
      )
      .join("\n\n");

    return {
      reply:
        `### ScalePods Insights & Playbooks (${pageTitle})\n\n` +
        `Here are the latest guides and playbooks from the [ScalePods Blog](https://www.scalepods.co/blog):\n\n` +
        `${itemsText}\n\n` +
        `*Click any title above to read the full guide on ScalePods.*`,
      suggestions: nextSuggestions,
      actionButtons: [
        { label: "Visit ScalePods Blog", href: "https://www.scalepods.co/blog", isExternal: true },
        { label: "Book Strategy Call", href: "https://www.scalepods.co/contact", isExternal: true },
      ],
    };
  }

  // ── AI Employees (Alex, Maya, Harper, Orion) ──
  if (
    query.includes("employee") ||
    query.includes("digital workforce") ||
    query.includes("alex") ||
    query.includes("maya") ||
    query.includes("harper") ||
    query.includes("orion")
  ) {
    return {
      reply:
        "### Meet ScalePods' Digital Workforce (AI Employees)\n\n" +
        "From our playbook *'AI Employees: Meet the Digital Workforce Changing How Businesses Get Work Done'*, ScalePods deploys autonomous agents covering 4 core business pillars 24/7:\n\n" +
        "1. **Alex — AI Sales Representative**\n" +
        "   - Sourcing B2B leads, deep prospect research, personalized multichannel follow-ups, and calendar booking.\n\n" +
        "2. **Maya — AI Marketing Strategist**\n" +
        "   - Automated campaign rollout, cross-channel social distribution, and dynamic copy generation.\n\n" +
        "3. **Harper — AI HR Specialist (Powers This Tool)**\n" +
        "   - Automated resume scoring against open JDs, AI voice phone screening, and interview scheduling on autopilot.\n\n" +
        "4. **Orion — AI Operations Director**\n" +
        "   - 3-way logistics audit cross-referencing, procurement reconciliation, and ERP data pipelines without error.\n\n" +
        "Would you like to learn how to deploy an AI employee in your company?",
      suggestions: [
        "How does Harper HR work in this platform?",
        "Tell me about the ZV Steels Case Study",
        "What are the pricing plans?",
      ],
      actionButtons: [
        {
          label: "Read AI Employees Guide",
          href: "https://www.scalepods.co/blog/ai-employees-digital-workforce-guide",
          isExternal: true,
        },
        { label: "Try HR Screening Free", href: "/auth?mode=signup" },
      ],
    };
  }

  // ── Case Studies & Pagination (Lotus Manor, ZV Steels, Lootah Group, A Squared) ──
  if (
    query.includes("case study") ||
    query.includes("case studies") ||
    query.includes("zv steels") ||
    query.includes("lotus manor") ||
    query.includes("lootah") ||
    query.includes("a squared") ||
    query.includes("results") ||
    query.includes("metrics")
  ) {
    if (query.includes("zv steels")) {
      const cs = CRAWLED_CASE_STUDIES[0];
      return {
        reply:
          `### ZV Steels Case Study: ${cs.scope}\n\n` +
          `**Background**: A 4-generation steel powerhouse partnered with ScalePods to automate recruitment, freight reconciliation, and wholesale outreach.\n\n` +
          `**Key Outcomes & Verified Metrics**:\n` +
          cs.metrics.map((m) => `- **${m}**`).join("\n") +
          `\n\n` +
          `ScalePods replaced manual bottlenecks with custom Claude-powered CV evaluations and autonomous outreach.`,
        suggestions: [
          "Show Lotus Manor Case Study",
          "Show All Case Studies",
          "Try HR Screening Tool",
        ],
        actionButtons: [
          { label: "Read Full ZV Steels Story", href: cs.url, isExternal: true },
          { label: "Create Free Account", href: "/auth?mode=signup" },
        ],
      };
    }

    if (query.includes("lotus manor")) {
      const cs = CRAWLED_CASE_STUDIES[1];
      return {
        reply:
          `### Lotus Manor Real Estate Case Study: ${cs.scope}\n\n` +
          `**Background**: Luxury real estate firm in Dubai had thousands of qualified leads but struggled with manual follow-up latency.\n\n` +
          `**Key Outcomes & Verified Metrics**:\n` +
          cs.metrics.map((m) => `- **${m}**`).join("\n") +
          `\n\n` +
          `Coordinated outreach across WhatsApp, email, and conversational AI phone calls achieved a verified 21% response rate.`,
        suggestions: ["Show ZV Steels Case Study", "Show All Blogs", "Book a Strategy Call"],
        actionButtons: [
          { label: "Read Lotus Manor Story", href: cs.url, isExternal: true },
          { label: "Visit ScalePods.co", href: "https://www.scalepods.co", isExternal: true },
        ],
      };
    }

    const allCs = CRAWLED_CASE_STUDIES.map(
      (c, idx) =>
        `${idx + 1}. **[${c.client} (${c.location})](${c.url})**\n   *${c.scope}*\n   - ${c.metrics[0]}\n   - ${c.metrics[1]}`,
    ).join("\n\n");

    return {
      reply:
        `### ScalePods Client Case Studies & Verified Results\n\n` +
        `Here are our verified enterprise client results and deployments:\n\n` +
        `${allCs}\n\n` +
        `*Ask about any specific case study (e.g. "Tell me about ZV Steels" or "Tell me about Lotus Manor") for deep metrics!*`,
      suggestions: [
        "Tell me about ZV Steels",
        "Tell me about Lotus Manor",
        "Show ScalePods Blog Articles",
        "What are the pricing plans?",
      ],
      actionButtons: [
        { label: "Explore ScalePods.co", href: "https://www.scalepods.co", isExternal: true },
        { label: "Start Free Screening", href: "/auth?mode=signup" },
      ],
    };
  }

  // ── Claude Partnership / Anthropic ──
  if (
    query.includes("claude") ||
    query.includes("anthropic") ||
    query.includes("partner") ||
    query.includes("partnership")
  ) {
    return {
      reply:
        "### Official Claude Partner Network Services Track\n\n" +
        "**ScalePods is an official Services Partner in the Claude Partner Network** (by Anthropic)!\n\n" +
        "We collaborate directly with Claude to help organizations design, deploy, and scale intelligent AI workflows:\n\n" +
        "- **Built for Enterprise**: Secure, scalable, and compliant AI solutions engineered for complex business environments.\n" +
        "- **Certified Claude Expertise**: Our engineers are certified to deliver Claude-powered architectures with proven prompt & agent methodologies.\n" +
        "- **End-to-End Implementation**: From workflow strategy and AI agent design to full deployment and monitoring.\n" +
        "- **Measurable Impact**: Proven to improve workflow efficiency by 30%+ and eliminate operational bottlenecks.\n\n" +
        "You can book a Claude Strategy Session directly with the ScalePods engineering team!",
      suggestions: [
        "What other solutions does ScalePods offer?",
        "What is this HR platform?",
        "Show ScalePods Blog Articles",
      ],
      actionButtons: [
        { label: "Book Strategy Call", href: "https://www.scalepods.co/contact", isExternal: true },
        { label: "Explore ScalePods.co", href: "https://www.scalepods.co", isExternal: true },
      ],
    };
  }

  // ── General "What is this tool" / Clarify HR tool vs other ScalePods tools ──
  if (
    query.includes("what is this tool") ||
    query.includes("about this tool") ||
    query.includes("what tool is this") ||
    query.includes("which tool is this") ||
    query.includes("what is this tool all about") ||
    query.includes("what is this all about") ||
    query.includes("tell me about this tool") ||
    query.includes("what does this tool") ||
    query.includes("what is this platform about") ||
    query.includes("which platform is this") ||
    query.includes("hr tool or any other") ||
    query.includes("hr tool or other") ||
    query.includes("this tool or other") ||
    query === "what is this tool" ||
    query === "what is this tool all about" ||
    query === "what is this tool all about?" ||
    query === "what is this?" ||
    query === "what is this" ||
    query === "this tool"
  ) {
    return {
      reply:
        "### ScalePods: Platform Overview\n\n" +
        "Are you asking about **this HR Talent Intelligence tool**, or **any other ScalePods tool**?\n\n" +
        "ScalePods provides specialized AI automation across two primary focus areas:\n\n" +
        "1. **This HR Talent Intelligence Tool**:\n" +
        "   - Automated AI resume screening and JD competency fit scoring (0–100%)\n" +
        "   - Autonomous pre-screening phone calls powered by conversational Voice AI\n" +
        "   - Interactive live video assessments with automated vision proctoring\n" +
        "   - Direct two-way Google Calendar candidate scheduling\n\n" +
        "2. **Other ScalePods Enterprise Tools**:\n" +
        "   - Sales & B2B outreach automation (AI agent Alex)\n" +
        "   - Operations, logistics & 3-way freight auditing (AI agent Orion)\n" +
        "   - Marketing automation and campaign execution (AI agent Maya)\n" +
        "   - Custom Claude-powered enterprise workflows for specialized industries\n\n" +
        "Which tool would you like to explore?",
      suggestions: ["This HR tool", "Other ScalePods tools", "What are the pricing plans?"],
      actionButtons: [
        { label: "Try HR Tool Free", href: "/auth?mode=signup" },
        { label: "Explore ScalePods.co", href: "https://www.scalepods.co", isExternal: true },
      ],
    };
  }

  // ── Other ScalePods Tools / Non-HR Workflows ──
  if (
    query.includes("other scalepods tool") ||
    query.includes("other scalepods tools") ||
    query.includes("other tool") ||
    query.includes("other tools") ||
    query.includes("other solution") ||
    query.includes("other solutions") ||
    query.includes("other products") ||
    query.includes("other product") ||
    query.includes("what other") ||
    query.includes("different tool")
  ) {
    return {
      reply:
        "### Other ScalePods Automation Solutions\n\n" +
        "Beyond our HR Talent Intelligence platform, **ScalePods** ([scalepods.co](https://www.scalepods.co)) architects full-stack AI automation and digital employees for growing businesses:\n\n" +
        "1. **Sales Workflow Automation (Alex)**:\n" +
        "   - Sourcing B2B prospects, intent discovery, and personalized outbound sequences across Email and LinkedIn.\n\n" +
        "2. **Operations & Freight Auditing (Orion)**:\n" +
        "   - Automated 3-way logistics reconciliation cross-referencing Supplier Invoices, E-Way Bills, and Lorry Receipts (within +/-300kg tolerance).\n\n" +
        "3. **Marketing & Copywriting (Maya)**:\n" +
        "   - Multi-channel content syndication, social distribution, and automated campaign tracking.\n\n" +
        "4. **Custom Claude Enterprise Deployments**:\n" +
        "   - As an official Claude Partner Network Services Partner, ScalePods designs secure, production-grade AI architectures tailored to your stack.\n\n" +
        "You can deploy dedicated pods or integrate them into your existing CRM, ERP, and communication channels.",
      suggestions: ["This HR tool", "Show Client Case Studies", "Talk to a sales expert"],
      actionButtons: [
        { label: "Explore ScalePods.co", href: "https://www.scalepods.co", isExternal: true },
        { label: "Book Strategy Call", href: "https://www.scalepods.co/contact", isExternal: true },
      ],
    };
  }

  // ── This HR Tool Specific Query ──
  if (
    query === "this hr tool" ||
    query.includes("this hr tool") ||
    query.includes("tell me about this hr tool") ||
    query.includes("about this hr tool") ||
    query.includes("hr talent intelligence") ||
    query.includes("hiring platform") ||
    query.includes("talent intelligence")
  ) {
    return {
      reply:
        "### ScalePods HR Talent Intelligence Platform\n\n" +
        "This platform acts as an autonomous hiring copilot designed for recruiters, founders, and hiring teams:\n\n" +
        "1. **AI Resume Screening & Fit Scoring**: Upload PDF or Word resumes to receive an instant 0–100% JD alignment score, candidate summary, and skill breakdown.\n" +
        "2. **Conversational Voice Screening**: The AI dials candidates to screen them on salary expectations, domain background, and notice periods.\n" +
        "3. **Video Assessments & Vision Proctoring**: Secure candidate video rounds with automated multi-face detection, tab-switching tracking, and answer transcription.\n" +
        "4. **Self-Serve Calendar Scheduling**: Seamlessly integrates with Google Calendar to let qualified candidates book available interviewer slots.\n" +
        "5. **Applicant Tracking Ledger**: Filter candidates into Strong Match, Qualified, or Review Required, with zero training on your applicant data.",
      suggestions: [
        "Can I try for free first?",
        "What are the pricing plans?",
        "Other ScalePods tools",
      ],
      actionButtons: [
        { label: "Start Free Screening", href: "/auth?mode=signup" },
        { label: "Sign In to Dashboard", href: "/auth?mode=signin" },
      ],
    };
  }

  // ── Who is ScalePods / Company overview ──
  if (
    query.includes("what is scalepods") ||
    query.includes("about scalepods") ||
    query.includes("who is scalepods") ||
    query.includes("company background")
  ) {
    return {
      reply:
        "### About ScalePods — Growth, Automated.\n\n" +
        "**ScalePods** ([scalepods.co](https://www.scalepods.co)) architects the future of enterprise operations through autonomous **Agentic AI ecosystems** and intelligent workflow automation.\n\n" +
        "**ScalePods Core Focus Areas:**\n" +
        "1. **Plug-and-Play AI Pods**: Workflows accelerating **Hiring**, **Sales**, and **Operations** for growing businesses.\n" +
        "2. **ScalePods HR SaaS (This Platform)**: Dedicated talent intelligence automating resume scoring, phone voice screening, and multi-round AI interviews.\n" +
        "3. **Digital Workforce (AI Employees)**: Alex (Sales), Maya (Marketing), Harper (HR), and Orion (Operations).\n" +
        "4. **Claude Partner Network**: Official Services Partner delivering state-of-the-art Claude deployments.\n" +
        "5. **Global Enterprise Reach**: Operations across India, Dubai / GCC, and global clients.\n\n" +
        "We help companies eliminate 80%+ of repetitive busywork and scale without headcount bloat.",
      suggestions: ["This HR tool", "Other ScalePods tools", "What are the pricing plans?"],
      actionButtons: [
        { label: "Start Free Screening", href: "/auth?mode=signup" },
        { label: "Official ScalePods Website", href: "https://www.scalepods.co", isExternal: true },
      ],
    };
  }

  // ── Greetings ──
  if (
    query === "hi" ||
    query === "hello" ||
    query === "hey" ||
    query.startsWith("hi ") ||
    query.startsWith("hello ") ||
    query.startsWith("hey ") ||
    query.includes("good morning") ||
    query.includes("good afternoon") ||
    query.includes("good evening")
  ) {
    return {
      reply:
        "**Hello and welcome to ScalePods!**\n\n" +
        "I'm here to help you navigate our **Talent Intelligence Platform** and candidate automation workflows.\n\n" +
        "**How can I assist your team today?**\n" +
        "- **Try Free**: 10 resume screens & 1 campaign on our Free Tier (no credit card required)\n" +
        "- **Resume Scoring**: Automated 0–100% JD alignment parsing\n" +
        "- **AI Voice Screening**: Autonomous pre-screening phone calls\n" +
        "- **Subscription Plans**: Transparent rates ($0, $149/mo, $299/mo, Enterprise)\n" +
        "- **Case Studies**: Real-world results from ZV Steels and Lotus Manor",
      suggestions: [
        "Can I try for free first?",
        "What are the pricing plans?",
        "How does Resume Scoring work?",
        "Show Client Case Studies",
      ],
      actionButtons: [
        { label: "Start Free Screening", href: "/auth?mode=signup" },
        { label: "Sign In to Dashboard", href: "/auth?mode=signin" },
      ],
    };
  }

  // ── Talk to a Sales Expert / Find a Plan / Direct Instant Chat ──
  if (
    query.includes("sales expert") ||
    query.includes("talk to a sales") ||
    query.includes("talk to sales") ||
    query.includes("speak with sales") ||
    query.includes("speak to sales") ||
    query.includes("contact sales") ||
    query.includes("find a plan") ||
    query.includes("custom plan") ||
    query.includes("sales team")
  ) {
    return {
      reply:
        "### Chat Directly with Our Sales Team\n\n" +
        "You can connect directly with our sales team on WhatsApp right now:\n\n" +
        "- **Instant WhatsApp Chat**: [Click to chat on WhatsApp (+91 98672 71848)](https://wa.me/919867271848?text=Hi%20ScalePods%20team%2C%20I'd%20like%20to%20talk%20to%20a%20sales%20expert%20about%20finding%20the%20right%20plan) — Instant 1-on-1 replies for custom quotes, volume candidate screening, and enterprise rollouts.\n" +
        "- **Chat Right Here**: Tell me your monthly hiring volume or required features, and I can recommend the best plan for you right here in this chat!\n" +
        "- **Book a Video Call**: Prefer a scheduled walkthrough? [Book a Strategy Call on ScalePods.co](https://www.scalepods.co/contact).\n\n" +
        "Click a button below to connect with us, or ask your question right here!",
      suggestions: [
        "What are the pricing plans?",
        "Can I try for free first?",
        "How does Resume Scoring work?",
      ],
      actionButtons: [
        {
          label: "Chat on WhatsApp (+91 98672 71848)",
          href: "https://wa.me/919867271848?text=Hi%20ScalePods%20team%2C%20I'd%20like%20to%20talk%20to%20a%20sales%20expert%20about%20finding%20the%20right%20plan",
          isExternal: true,
        },
        {
          label: "Book Strategy Call",
          href: "https://www.scalepods.co/contact",
          isExternal: true,
        },
      ],
    };
  }

  // ── Free Tier / Try For Free / Free Trial ──
  if (
    query.includes("free") ||
    query.includes("trial") ||
    query.includes("try") ||
    query.includes("test it") ||
    query.includes("demo")
  ) {
    return {
      reply:
        "### Yes, You Can Try ScalePods 100% Free!\n\n" +
        "You can start evaluating candidates immediately with our **Free Tier** — **no credit card required**:\n\n" +
        "**What's included in the Free Tier:**\n" +
        "- **10 AI Resume Screens/Month**: Upload candidate resumes (PDF/DOCX) and get instant 0–100% JD alignment match scores.\n" +
        "- **1 Active Campaign**: Set your custom qualifications, scoring thresholds, and requirements.\n" +
        "- **Candidate Leaderboard**: Automatically categorize candidates into *Strong Match*, *Qualified*, or *Review Required*.\n" +
        "- **Enterprise-Grade Privacy**: Your applicant data is securely isolated with zero public model training.\n\n" +
        "**How to get started in 30 seconds:**\n" +
        "1. Click **[Start Free Now](/auth?mode=signup)** and sign up with your email.\n" +
        "2. Create your first campaign and paste your Job Description.\n" +
        "3. Upload resumes to see live AI competency scoring in real time!\n\n" +
        "When you're ready to unlock automated phone voice screening, Google Calendar booking, and multi-round video assessments, you can upgrade to Basic ($149/mo) or Growth ($349/mo) anytime.",
      suggestions: [
        "What are the pricing plans?",
        "How does Resume Scoring work?",
        "How does AI Voice Screening work?",
        "How do I sign up?",
      ],
      actionButtons: [
        { label: "Start Free Now (No CC)", href: "/auth?mode=signup" },
        { label: "Sign In to Dashboard", href: "/auth?mode=signin" },
      ],
    };
  }

  // ── Sign Up / Login / Account Access ──
  if (
    query.includes("sign up") ||
    query.includes("register") ||
    query.includes("login") ||
    query.includes("log in") ||
    query.includes("signin") ||
    query.includes("sign in") ||
    query.includes("account") ||
    query.includes("get started")
  ) {
    return {
      reply:
        "### Get Started with ScalePods in Seconds\n\n" +
        "Accessing the platform is fast, seamless, and free:\n\n" +
        "- **New User?** [Sign up for a Free Account](/auth?mode=signup) to launch your first hiring campaign and screen up to 10 resumes with zero upfront cost.\n" +
        "- **Already Have an Account?** [Sign in to your Dashboard](/auth?mode=signin) to manage active campaigns, review voice screening recordings, and schedule candidate rounds.\n\n" +
        "Need dedicated team onboarding or enterprise RBAC? You can also message our team directly on [WhatsApp (+91 98672 71848)](https://wa.me/919867271848).",
      suggestions: [
        "Can I try for free first?",
        "What are the pricing plans?",
        "How does Resume Scoring work?",
      ],
      actionButtons: [
        { label: "Create Free Account", href: "/auth?mode=signup" },
        { label: "Sign In", href: "/auth?mode=signin" },
      ],
    };
  }

  // ── Pricing & Plans ──
  if (
    query.includes("pricing") ||
    query.includes("price") ||
    query.includes("cost") ||
    query.includes("plan") ||
    query.includes("subscription") ||
    query.includes("tier")
  ) {
    return {
      reply:
        "### Transparent & Flexible Subscription Plans\n\n" +
        "1. **Free Tier ($0/month)**\n" +
        "   - 10 resume screens/month, 1 active campaign, standard candidate tracking.\n\n" +
        "2. **Basic Plan ($149/month)**\n" +
        "   - 250 resume screens, 50 AI interviews, 20 AI voice screening calls, WhatsApp notifications, up to 4 interview stages.\n\n" +
        "3. **Growth Plan ($349/month)**\n" +
        "   - Unlimited resume screens, 200 AI interviews, 100 AI voice screening calls, take-home assignments, Google Calendar sync, up to 6 interview stages, metered overage.\n\n" +
        "4. **Enterprise Plan ($1,099/month or custom)**\n" +
        "   - Unlimited resume screens, 6+ custom stages, full SMS cadence, dedicated RBAC workspaces, custom scoring rubrics, priority 24/7 SLA.\n\n" +
        "*Payments are processed securely with enterprise-grade encryption and instant invoice generation.*",
      suggestions: [
        "Can I try for free first?",
        "Show Case Studies",
        "How does Resume Scoring work?",
      ],
      actionButtons: [
        { label: "Start Free Now", href: "/auth?mode=signup" },
        { label: "Sign In to Dashboard", href: "/auth?mode=signin" },
      ],
    };
  }

  // ── Resume Scoring & Parsing ──
  if (
    query.includes("resume") ||
    query.includes("cv") ||
    query.includes("parsing") ||
    query.includes("scoring") ||
    query.includes("score") ||
    query.includes("jd match")
  ) {
    return {
      reply:
        "### AI Resume Screening & Match Scoring\n\n" +
        "ScalePods automates resume screening so your recruiters can focus solely on top qualified talent:\n\n" +
        "- **Multi-Format Extraction**: Parses PDF, DOCX, and raw text resumes using intelligent NLP.\n" +
        "- **JD Alignment Scoring**: Evaluates candidate experience, key technologies, and qualifications against your Job Description (JD) to compute a 0–100% competency match score.\n" +
        "- **Automated Leaderboard**: Instantly ranks candidates and categorizes them into *Strong Match*, *Qualified*, or *Review Required*.\n" +
        "- **Configurable Cutoffs**: Set cutoff thresholds (e.g. 75%) to automatically advance top applicants to the next interview round.",
      suggestions: [
        "How does AI Voice Screening work?",
        "Can I try for free first?",
        "What are the pricing tiers?",
        "Show ZV Steels Case Study",
      ],
      actionButtons: [
        { label: "Try Campaign Builder", href: "/auth?mode=signup" },
        { label: "View Feature Showcase", href: "#features" },
      ],
    };
  }

  // ── Voice Screening / Phone Call ──
  if (query.includes("voice") || query.includes("phone") || query.includes("call")) {
    return {
      reply:
        "### AI Voice Phone Screening\n\n" +
        "ScalePods conducts automated phone screening calls powered by our **Autonomous Voice AI Engine**:\n\n" +
        "- **Automated Candidate Dialing**: The AI calls candidates directly at their scheduled time or on application.\n" +
        "- **Conversational Screening**: Conducts structured dialogs on salary expectations, location/visas, domain experience, and notice periods.\n" +
        "- **Real-time Speech Intelligence**: High-accuracy speech transcription with automatic background noise filtering and intent extraction.\n" +
        "- **Recruiter Review**: Transcripts, audio recordings, and evaluated answers appear right inside your candidate dashboard.",
      suggestions: [
        "How does Resume Scoring work?",
        "How does the video interview work?",
        "What are the pricing plans?",
      ],
      actionButtons: [{ label: "Start Free Trial", href: "/auth?mode=signup" }],
    };
  }

  // ── Video Assessments & AI Proctoring ──
  if (
    query.includes("video") ||
    query.includes("proctor") ||
    query.includes("assessment") ||
    query.includes("camera")
  ) {
    return {
      reply:
        "### Interactive Video Assessments & AI Proctoring\n\n" +
        "ScalePods provides secure, AI-evaluated video interview rounds:\n\n" +
        "- **Dynamic Interview Prompts**: Questions align precisely with the competencies required by your Job Description.\n" +
        "- **Automated Vision Proctoring**: Detects multi-face presence, gaze drift away from screen, and tab switching to ensure candidate authenticity.\n" +
        "- **Instant Transcripts & Analysis**: Every answer is transcribed with confidence scores and sentiment indicators.\n" +
        "- **Recruiter Playback**: Review candidate video recordings and AI summaries at 1.5x speed directly in the dashboard.",
      suggestions: [
        "How does AI Voice Screening work?",
        "Can I try for free first?",
        "What are the pricing plans?",
      ],
      actionButtons: [{ label: "Try Free Screening", href: "/auth?mode=signup" }],
    };
  }

  // ── Google Calendar & Scheduling ──
  if (
    query.includes("calendar") ||
    query.includes("schedule") ||
    query.includes("scheduling") ||
    query.includes("booking") ||
    query.includes("sync")
  ) {
    return {
      reply:
        "### Google Calendar Sync & Self-Serve Booking\n\n" +
        "ScalePods eliminates scheduling delays for busy hiring managers:\n\n" +
        "- **Two-Way Google Calendar Sync**: Connects directly with hiring managers' calendars to show real-time slot availability.\n" +
        "- **Self-Serve Candidate Booking**: Shortlisted candidates receive an automated link to pick their preferred interview time.\n" +
        "- **Instant Invites & Meet Links**: Automatically generates Google Meet / video conference links and adds them to both parties' calendars.\n" +
        "- **Automated Reminders**: Delivers WhatsApp and email reminders to reduce candidate no-show rates.",
      suggestions: [
        "Can I try for free first?",
        "What are the pricing plans?",
        "How does Resume Scoring work?",
      ],
      actionButtons: [
        { label: "Start Free Trial", href: "/auth?mode=signup" },
        { label: "Sign In to Dashboard", href: "/auth?mode=signin" },
      ],
    };
  }

  // ── Security & Privacy ──
  if (
    query.includes("security") ||
    query.includes("privacy") ||
    query.includes("safe") ||
    query.includes("soc-2") ||
    query.includes("gdpr") ||
    query.includes("compliance") ||
    query.includes("data")
  ) {
    return {
      reply:
        "### Enterprise Security & Data Privacy\n\n" +
        "ScalePods is engineered with institutional-grade data safeguards:\n\n" +
        "- **Zero Data Training Policy**: Candidate resumes and assessment data are NEVER used to train public or external AI models.\n" +
        "- **Encryption in Transit & at Rest**: TLS 1.3 across all network requests and AES-256 database encryption.\n" +
        "- **Role-Based Access Control (RBAC)**: Fine-grained permissions for recruiters, hiring managers, and interviewers.\n" +
        "- **Audit Trails & Decision Ledger**: Full transparency and immutable audit logs on all hiring decisions and candidate evaluations.",
      suggestions: [
        "Can I try for free first?",
        "What are the pricing plans?",
        "How does Resume Scoring work?",
      ],
      actionButtons: [
        { label: "Start Free Screening", href: "/auth?mode=signup" },
        { label: "Official ScalePods Website", href: "https://www.scalepods.co", isExternal: true },
      ],
    };
  }

  // ── Platform Features / How it works (General Overview) ──
  if (
    query.includes("how does") ||
    query.includes("feature") ||
    query.includes("platform") ||
    query.includes("hr tool") ||
    query.includes("capabilities") ||
    query.includes("harper") ||
    query.includes("what does")
  ) {
    return {
      reply:
        "### ScalePods Talent Intelligence Platform: How It Works\n\n" +
        "ScalePods acts as your autonomous hiring copilot, eliminating manual bottlenecks across the recruitment lifecycle:\n\n" +
        "1. **AI Resume Parsing & Match Scoring**: Automatically parses PDF/Word resumes and evaluates qualifications against your Job Description to produce a 0–100% competency fit score.\n" +
        "2. **Conversational AI Phone Screening**: Autonomous voice calls screen applicants on salary expectations, notice periods, and role alignment.\n" +
        "3. **Interactive Video Assessments**: Real-time video interviews with automated AI proctoring, behavioral tracking, and transcript analysis.\n" +
        "4. **Self-Serve Google Calendar Booking**: Shortlisted candidates pick available recruiter slots without scheduling back-and-forth.\n" +
        "5. **Multichannel WhatsApp Updates**: Automatic notifications keep candidates informed at every step.\n" +
        "6. **Comprehensive Candidate Ledger**: Review full transcripts, audio playbacks, and AI scoring rubrics in one unified dashboard.",
      suggestions: [
        "Can I try for free first?",
        "What are the pricing plans?",
        "How does AI Voice Screening work?",
        "Show Client Case Studies",
      ],
      actionButtons: [
        { label: "Start Free Screening", href: "/auth?mode=signup" },
        { label: "Explore Case Studies", href: "https://www.scalepods.co", isExternal: true },
      ],
    };
  }

  // ── Contact & WhatsApp ──
  if (
    query.includes("contact") ||
    query.includes("whatsapp") ||
    query.includes("email") ||
    query.includes("support") ||
    query.includes("reach") ||
    query.includes("sales")
  ) {
    return {
      reply:
        "### Connect with the ScalePods Team\n\n" +
        "We're here to help you automate hiring and enterprise workflows:\n\n" +
        `- **WhatsApp**: [Chat on WhatsApp (+91 98672 71848)](${SCALEPODS_COMPANY.whatsAppLink})\n` +
        `- **General Inquiries**: [info@scalepods.co](mailto:info@scalepods.co)\n` +
        `- **Platform Support**: [support@scalepods.co](mailto:support@scalepods.co)\n` +
        `- **Official Website**: [www.scalepods.co](https://www.scalepods.co)\n` +
        `- **Global Hubs**: Serving clients across India, Dubai / GCC, and globally.\n` +
        `- **LinkedIn**: [ScalePods on LinkedIn](https://www.linkedin.com/company/scalepods-co/)`,
      suggestions: [
        "Show ScalePods Blog Articles",
        "What are the pricing plans?",
        "How do I sign up?",
      ],
      actionButtons: [
        { label: "Chat on WhatsApp", href: SCALEPODS_COMPANY.whatsAppLink, isExternal: true },
        { label: "Visit ScalePods.co", href: "https://www.scalepods.co", isExternal: true },
      ],
    };
  }

  // ── Default / Off-Topic Boundary Fallback ──
  return {
    reply:
      "I can only assist with questions related to **ScalePods** and our **Talent Intelligence Platform** (such as AI resume screening, phone voice screening, video proctoring, and subscription plans).\n\n" +
      "How can I help you with your candidate screening or hiring automation needs today?",
    suggestions: [
      "What are the pricing plans?",
      "Can I try for free first?",
      "How does Resume Scoring work?",
    ],
    actionButtons: [
      { label: "Start Free Screening", href: "/auth?mode=signup" },
      {
        label: "Chat on WhatsApp (+91 98672 71848)",
        href: "https://wa.me/919867271848?text=Hi%20ScalePods%20team%2C%20I'd%20like%20to%20learn%20more%20about%20the%20platform",
        isExternal: true,
      },
    ],
  };
}
