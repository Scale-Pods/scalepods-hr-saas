export interface LegalSection {
  title: string;
  subsections?: { title: string; content: string }[];
  paragraphs?: string[];
  listItems?: string[];
}

export interface LegalDocument {
  id: "privacy" | "terms";
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
  contactEmail: string;
}

export const PRIVACY_POLICY: LegalDocument = {
  id: "privacy",
  title: "Privacy Policy",
  lastUpdated: "23 Jan 2025",
  intro:
    'Welcome to ScalePods ("we" or "us"). This Privacy Policy is designed to help you understand how we collect, use, disclose, and safeguard your personal information when you use our website and related services.',
  contactEmail: "info@scalepods.tech",
  sections: [
    {
      title: "1. Information We Collect",
      subsections: [
        {
          title: "1.1 Personal Information",
          content:
            "We may collect personal information, such as your name, email address, and other contact details when you voluntarily provide it to us, such as when you register for an account, subscribe to newsletters, or contact us through the website.",
        },
        {
          title: "1.2 Usage Information",
          content:
            "We may collect information about your use of the website, including your IP address, browser type, device information, and pages visited. This information helps us analyze trends, administer the site, and improve user experience.",
        },
      ],
    },
    {
      title: "2. How We Use Your Information",
      paragraphs: ["We use the collected information for various purposes, including:"],
      listItems: [
        "Providing and maintaining the website and talent intelligence services",
        "Communicating with you about your account, candidate workflows, and platform updates",
        "Sending newsletters, promotional materials, and other information you request",
        "Analyzing platform usage to improve screening accuracy and user experience",
      ],
    },
    {
      title: "3. Sharing Your Information",
      paragraphs: [
        "We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this Privacy Policy. We may share information with trusted third-party service providers who assist us in operating our website or conducting our business.",
      ],
    },
    {
      title: "4. Cookies and Similar Technologies",
      paragraphs: [
        "We use cookies and similar technologies to enhance your experience on our website. You can control cookies through your browser settings, but disabling them may affect your ability to use certain features of the site.",
      ],
    },
    {
      title: "5. Your Choices",
      paragraphs: [
        "You can manage your communication preferences by unsubscribing from newsletters or adjusting your account settings. You may also contact us to update or delete your personal information.",
      ],
    },
    {
      title: "6. Security",
      paragraphs: [
        "We take reasonable measures to protect the security of your personal information. However, no method of transmission over the internet or electronic storage is completely secure. Therefore, we cannot guarantee absolute security.",
      ],
    },
    {
      title: "7. Children's Privacy",
      paragraphs: [
        "Our website is not directed to individuals under the age of 18. If you become aware that a child has provided us with personal information, please contact us, and we will take steps to remove such information.",
      ],
    },
    {
      title: "8. Changes to This Privacy Policy",
      paragraphs: [
        "We may update this Privacy Policy periodically. We will notify you of any changes by posting the new Privacy Policy on this page. Your continued use of the website after such modifications will constitute your acknowledgment of the modified Privacy Policy.",
      ],
    },
    {
      title: "9. Contact Us",
      paragraphs: [
        "If you have any questions about this Privacy Policy, please contact us at info@scalepods.tech.",
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  id: "terms",
  title: "Terms of Service",
  lastUpdated: "23 Jan 2025",
  intro:
    'Welcome to ScalePods ("we" or "us"). These Terms of Service govern your access to and use of ScalePods, our website, autonomous AI workflow automation pods, candidate screening tools, and related SaaS services.',
  contactEmail: "info@scalepods.tech",
  sections: [
    {
      title: "1. Acceptance of Terms",
      paragraphs: [
        "By accessing, registering for, or using the ScalePods platform, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, you must not access or use our services.",
      ],
    },
    {
      title: "2. Description of Services",
      paragraphs: [
        "ScalePods provides autonomous Agentic AI talent infrastructure, candidate resume evaluation, structured interview pipelines, and enterprise automation tools. We reserve the right to modify, enhance, or discontinue any feature with reasonable notice.",
      ],
    },
    {
      title: "3. User Accounts and Security",
      paragraphs: [
        "To access recruiter and hiring features, you must register for an account using accurate, current, and complete information. You are responsible for safeguarding your credentials and for all activities that occur under your account.",
      ],
    },
    {
      title: "4. Acceptable Use",
      paragraphs: [
        "You agree not to use the platform for any unlawful purpose, to transmit malicious code, to reverse engineer any part of the service, or to process candidate data in violation of applicable labor laws, non-discrimination regulations, or data protection laws.",
      ],
    },
    {
      title: "5. Subscriptions and Payments",
      paragraphs: [
        "Certain features require paid subscriptions (e.g., Basic, Growth, Enterprise). Billing occurs on a recurring basis via our authorized payment partners (such as Razorpay). Subscriptions renew automatically unless canceled prior to the renewal date.",
      ],
    },
    {
      title: "6. Customer and Candidate Data",
      paragraphs: [
        "You retain all ownership rights to resumes, candidate records, and proprietary data uploaded to ScalePods. By using our services, you grant ScalePods a limited license to process this data solely to provide automated screening, scoring, and workflow services in accordance with our Privacy Policy.",
      ],
    },
    {
      title: "7. Intellectual Property",
      paragraphs: [
        "All software, algorithms, designs, trademarks, and documentation related to ScalePods remain the exclusive intellectual property of ScalePods AI Infrastructure. You may not copy, modify, distribute, or create derivative works without prior written consent.",
      ],
    },
    {
      title: "8. Limitation of Liability",
      paragraphs: [
        'The services and AI-generated assessments are provided on an "as is" and "as available" basis as decision-support tools. In no event shall ScalePods be liable for indirect, incidental, special, consequential, or punitive damages.',
      ],
    },
    {
      title: "9. Termination",
      paragraphs: [
        "We reserve the right to suspend or terminate your account if you violate these Terms of Service. Upon termination, your right to use the service will immediately cease.",
      ],
    },
    {
      title: "10. Contact Us",
      paragraphs: [
        "If you have any questions about these Terms of Service, please contact us at info@scalepods.tech.",
      ],
    },
  ],
};
