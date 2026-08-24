export type ManagedCta = {
  label: string;
  href: string;
};

export type ManagedHomepageSection = {
  id: string;
  enabled: boolean;
  eyebrow: string;
  title: string;
  description: string;
  items?: Array<Record<string, string | number | boolean>>;
  primaryCta?: ManagedCta;
  secondaryCta?: ManagedCta;
};

export type HomepageConfig = {
  site: {
    brandName: string;
    footerDescription: string;
    footerNote: string;
    socialLinks: Array<{ label: string; href: string }>;
  };
  navigation: Array<{
    label: string;
    href: string;
    children?: Array<{ label: string; href: string; description: string }>;
  }>;
  sectionOrder: string[];
  sections: ManagedHomepageSection[];
};

export const DEFAULT_HOMEPAGE: HomepageConfig = {
  site: {
    brandName: "ProFile AI",
    footerDescription:
      "Build a job-winning resume with AI. Create, tailor, score, and export a professional resume in minutes.",
    footerNote: "Made for job seekers who want to stand out.",
    socialLinks: [
      { label: "X", href: "https://x.com" },
      { label: "LinkedIn", href: "https://www.linkedin.com" },
      { label: "GitHub", href: "https://github.com" },
    ],
  },
  navigation: [
    { label: "Home", href: "/" },
    {
      label: "Products",
      href: "#features",
      children: [
        {
          label: "AI Resume Builder",
          href: "/dashboard/resumes/new",
          description: "Generate a tailored, ATS-ready resume in under a minute.",
        },
        {
          label: "Cover Letters",
          href: "/dashboard/cover-letters",
          description: "Create a polished letter for every application.",
        },
        {
          label: "ATS Score",
          href: "/dashboard/ats",
          description: "Compare a resume with a real job description.",
        },
        {
          label: "Application Tracker",
          href: "/dashboard/applications",
          description: "Keep every opportunity and follow-up in one workspace.",
        },
      ],
    },
    { label: "Templates", href: "/templates" },
    { label: "Pricing", href: "/pricing" },
    { label: "Help", href: "/help" },
    { label: "Blog", href: "/blog" },
  ],
  sectionOrder: [
    "hero",
    "trust",
    "features",
    "careerWorkspace",
    "workflow",
    "featuredTemplates",
    "templateGallery",
    "aiBuilder",
    "ats",
    "coverLetter",
    "applicationTracker",
    "liveIntelligence",
    "testimonials",
    "pricing",
    "faq",
    "privacyControl",
    "animatedCta",
    "finalCta",
  ],
  sections: [
    {
      id: "hero",
      enabled: true,
      eyebrow: "AI-powered resume builder",
      title: "Build a job-winning resume with AI.",
      description:
        "Create, tailor, score, and export a professional resume in minutes. ProFile AI helps you beat applicant tracking systems and land more interviews.",
      items: [
        { title: "No credit card required", description: "Start free" },
        { title: "4.8 average user rating", description: "Trusted by job seekers" },
      ],
      primaryCta: { label: "Get Started Free", href: "/register" },
      secondaryCta: { label: "View Templates", href: "/templates" },
    },
    {
      id: "trust",
      enabled: true,
      eyebrow: "",
      title: "",
      description: "",
      items: [
        { title: "AI-tailored bullets", description: "Generated for the role you want" },
        { title: "ATS-friendly", description: "Passes modern screening systems" },
        { title: "PDF & DOCX export", description: "Ready to send in one click" },
        { title: "Multi-language", description: "English, Spanish and more" },
        { title: "Privacy first", description: "Your data stays yours" },
      ],
    },
    {
      id: "features",
      enabled: true,
      eyebrow: "Features",
      title: "Everything you need to land the interview",
      description:
        "Six powerful tools, one simple workflow. Built for job seekers who want to stop guessing and start getting callbacks.",
      items: [
        { title: "AI resume generation", description: "Create a focused resume from your experience and the job description.", label: "Tailored to the JD" },
        { title: "Instant ATS score", description: "See a clear score and practical improvements before you apply.", label: "Beat the bots" },
        { title: "Premium templates", description: "Choose from 30 résumé and 30 CV designs, each editable and recruiter-friendly.", label: "60 designs" },
        { title: "One-click export", description: "Export polished PDF and DOCX files for people and ATS parsers.", label: "PDF · DOCX" },
        { title: "Cover letters that match", description: "Generate a role-specific letter aligned with your resume.", label: "Pairs with resume" },
        { title: "Application tracker", description: "Track statuses, follow-ups, notes and interview reminders.", label: "Stay organized" },
      ],
    },
    {
      id: "workflow",
      enabled: true,
      eyebrow: "How it works",
      title: "From blank page to interview-ready in 4 steps",
      description: "A guided workflow designed to remove the friction between you and your next job.",
      items: [
        { title: "Create your free account", description: "Sign up in seconds and keep your work securely saved.", label: "01" },
        { title: "Tell us about the role", description: "Paste the job description and add your background.", label: "02" },
        { title: "Tailor and score", description: "Edit every section and improve your ATS match in real time.", label: "03" },
        { title: "Export and apply", description: "Download your resume and track the application.", label: "04" },
      ],
    },
    {
      id: "careerWorkspace",
      enabled: true,
      eyebrow: "Career workspace",
      title: "Your entire job search, moving as one.",
      description:
        "ProFile AI connects the work before, during and after every application so nothing falls through the cracks.",
      items: [
        { title: "One calm workspace", description: "Resume, cover letter and application history stay connected.", label: "Unified" },
        { title: "A clear next action", description: "Know exactly what to improve, send or follow up on next.", label: "Focused" },
        { title: "Progress you can see", description: "Track stronger applications and interview conversion over time.", label: "Measurable" },
      ],
      primaryCta: { label: "Open my career workspace", href: "/register" },
    },
    {
      id: "featuredTemplates",
      enabled: true,
      eyebrow: "Featured templates",
      title: "Hand-picked designs that convert",
      description: "ATS-tested, mobile-friendly and fully customizable designs.",
      primaryCta: { label: "View all templates", href: "/templates" },
    },
    {
      id: "templateGallery",
      enabled: true,
      eyebrow: "Template gallery",
      title: "A template for every kind of role",
      description: "Explore 30 professional résumés and 30 detailed CVs, all instantly customizable.",
      items: [
        { title: "Modern", description: "Clean, two-column and recruiter-friendly." },
        { title: "Classic", description: "Traditional, single-column and ATS-perfect." },
        { title: "Creative", description: "Bold headers made for design roles." },
        { title: "ATS", description: "Whitespace-first and parser-safe." },
      ],
      primaryCta: { label: "Browse all templates", href: "/templates" },
    },
    {
      id: "aiBuilder",
      enabled: true,
      eyebrow: "AI builder",
      title: "Write a resume that fits the job—not just any job",
      description: "ProFile AI turns your experience and the role requirements into focused, quantified content.",
      items: [
        { title: "Lead with measurable impact", description: "Rewrite vague bullets into outcomes." },
        { title: "Surface missing keywords", description: "Find the language recruiters and ATS tools expect." },
        { title: "Adapt the tone", description: "Match technical, creative or executive roles." },
        { title: "Create the right summary", description: "Generate a focused professional introduction." },
      ],
      primaryCta: { label: "Try the AI builder free", href: "/register" },
    },
    {
      id: "ats",
      enabled: true,
      eyebrow: "ATS scoring",
      title: "Understand your ATS score in plain English",
      description: "Compare your resume with the job and get specific, actionable fixes.",
      items: [
        { title: "Match the right keywords", description: "See missing skills and phrases from the job description." },
        { title: "Fix risky formatting", description: "Catch layouts that older parsers struggle to read." },
        { title: "Improve as you edit", description: "Watch the score respond to each improvement." },
      ],
    },
    {
      id: "coverLetter",
      enabled: true,
      eyebrow: "Cover letters",
      title: "A cover letter that matches your resume—automatically",
      description: "Generate a tailored letter in your voice for every role.",
      primaryCta: { label: "Generate my first letter", href: "/register" },
    },
    {
      id: "applicationTracker",
      enabled: true,
      eyebrow: "Application tracker",
      title: "Stop losing track of where you applied",
      description: "Log every application, follow-up and interview in one place.",
      items: [
        { title: "Status and follow-up dates", description: "Know the next action at a glance." },
        { title: "Notes for every role", description: "Keep recruiter and interview details together." },
        { title: "Conversion analytics", description: "Learn which applications are working." },
        { title: "Timely reminders", description: "Never miss the right moment to follow up." },
      ],
    },
    {
      id: "testimonials",
      enabled: true,
      eyebrow: "Loved by job seekers",
      title: "Real people, real interviews",
      description: "See how job seekers use ProFile AI to apply with confidence.",
      items: [
        { title: "Maya Chen", description: "I went from zero callbacks to three interviews in a week.", label: "Product Designer" },
        { title: "James O'Connor", description: "The AI turned my responsibilities into clear, measurable impact.", label: "Data Engineer" },
        { title: "Priya Sharma", description: "A matching cover letter saves me an hour on every application.", label: "Marketing Manager" },
      ],
    },
    {
      id: "liveIntelligence",
      enabled: true,
      eyebrow: "Live intelligence",
      title: "Decisions powered by signal, not guesswork.",
      description:
        "Every resume, job description and application becomes useful feedback for the next move.",
      items: [
        { title: "Role-fit signal", description: "See how strongly your experience maps to the role before applying.", label: "94% match" },
        { title: "Experience gap map", description: "Spot missing proof, keywords and outcomes while there is time to fix them.", label: "3 actions" },
        { title: "Application insights", description: "Learn which roles, resumes and messages are earning real responses.", label: "+28%" },
      ],
    },
    {
      id: "pricing",
      enabled: true,
      eyebrow: "Pricing",
      title: "Simple plans, no surprises",
      description: "Start free and upgrade only when you need more.",
      items: [
        { title: "Free", description: "Build your first resume with essential AI tools.", label: "$0", features: "1 resume|3 AI generations / month|ATS score|PDF export", ctaLabel: "Get started", ctaHref: "/register" },
        { title: "Pro", description: "For active job seekers who want maximum callbacks.", label: "$12", features: "Unlimited resumes|Full ATS suggestions|Cover letters|Application tracker|PDF + DOCX", ctaLabel: "Start Pro", ctaHref: "/register?plan=pro", highlighted: true },
        { title: "Business", description: "For teams, coaches and recruiting agencies.", label: "$29", features: "Everything in Pro|Team workspace|Custom branding|Priority support", ctaLabel: "Contact sales", ctaHref: "/contact" },
      ],
    },
    {
      id: "faq",
      enabled: true,
      eyebrow: "FAQ",
      title: "Frequently asked questions",
      description: "Quick answers about pricing, ATS, AI quality and privacy.",
      items: [
        { title: "Is ProFile AI free to use?", description: "Yes. The Free plan lets you build and export your first resume without a credit card." },
        { title: "What is an ATS score?", description: "It estimates how well your resume matches a job's keywords, structure and parsing requirements." },
        { title: "Can I edit the AI output?", description: "Absolutely. Every section remains editable and can be regenerated independently." },
        { title: "Is my data private?", description: "Your account data is protected in transit and at rest, and you can delete it from your dashboard." },
      ],
    },
    {
      id: "animatedCta",
      enabled: true,
      eyebrow: "Ready when you are",
      title: "Stop applying. Start getting interviews.",
      description: "Create an account, paste a job description and let ProFile AI do the heavy lifting.",
      primaryCta: { label: "Get Started Free", href: "/register" },
      secondaryCta: { label: "See Pricing", href: "/pricing" },
    },
    {
      id: "privacyControl",
      enabled: true,
      eyebrow: "Privacy and control",
      title: "Your career story belongs to you.",
      description:
        "Premium software should feel safe as well as beautiful. ProFile AI keeps you in control of every document, suggestion and shared link.",
      items: [
        { title: "Private by default", description: "Your career data is never treated as public content." },
        { title: "You stay in control", description: "Edit, export or delete your information from one place." },
        { title: "Human-approved AI", description: "Nothing is submitted until you review and approve it." },
      ],
      primaryCta: { label: "Read our privacy approach", href: "/privacy" },
    },
    {
      id: "finalCta",
      enabled: true,
      eyebrow: "Free forever—upgrade any time",
      title: "Your next interview starts with a better resume.",
      description: "Create tailored resumes, beat ATS filters and apply with confidence.",
      primaryCta: { label: "Get Started Free", href: "/register" },
      secondaryCta: { label: "See Pricing", href: "/pricing" },
    },
  ],
};

export const DEFAULT_CONTENT_PAGES = [
  {
    slug: "about",
    title: "About ProFile AI",
    description: "Why we are building a calmer, more effective job-search workspace.",
    body: "ProFile AI helps job seekers turn their experience into clear, role-specific applications. Our goal is simple: remove the repetitive work from resume tailoring while keeping every final decision in the user's hands.\n\nThe platform combines resume creation, ATS analysis, cover letters, application tracking and export tools in one secure workspace.",
  },
  {
    slug: "contact",
    title: "Contact",
    description: "Talk to the ProFile AI team.",
    body: "Need help with your account, billing or a product question? Email support@profileai.app and include the email address associated with your account.\n\nFor security, never send passwords, one-time codes or full payment card details.",
  },
  {
    slug: "blog",
    title: "Career resources",
    description: "Practical guidance for stronger applications.",
    body: "Our resource library is being expanded with practical advice on resume writing, ATS systems, interviewing and application follow-ups.\n\nFor detailed product guidance today, visit the Help Center.",
  },
  {
    slug: "terms",
    title: "Terms of service",
    description: "The terms that govern use of ProFile AI.",
    body: "By using ProFile AI, you agree to use the service lawfully and to provide accurate account information. You remain responsible for reviewing and approving generated content before submitting it to an employer.\n\nPaid services, cancellation and refund eligibility are described during checkout. These terms may be updated as the service evolves.",
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    description: "How ProFile AI handles account and resume data.",
    body: "We process the information you provide to operate resume, cover-letter, analytics and application-tracking features. We do not sell personal resume data.\n\nYou can update, export or delete account data from the dashboard. Operational logs are retained only as needed for security, reliability and legal obligations.",
  },
  {
    slug: "cookies",
    title: "Cookie policy",
    description: "How cookies support authentication and preferences.",
    body: "ProFile AI uses essential cookies to keep you signed in, protect sessions and remember interface preferences. Optional analytics are used to understand aggregate product usage.\n\nBlocking essential cookies may prevent sign-in and authenticated dashboard features from working correctly.",
  },
] as const;
