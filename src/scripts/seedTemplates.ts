/* eslint-disable no-console */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";

/**
 * Seed 20 professional resume templates (5 per category: MODERN, CLASSIC,
 * CREATIVE, ATS). Thumbnail SVGs are served as same-origin static files from
 * the Next.js frontend at /templates/<slug>.svg.
 *
 * Idempotent: re-running the script upserts by `name` and preserves IDs, so
 * resume references survive. Creates a dev admin user only if none exists.
 *
 * Usage:  npm run seed:templates
 */

type Category = "MODERN" | "CLASSIC" | "CREATIVE" | "ATS";

interface TemplateSeed {
  name: string;
  slug: string;
  category: Category;
  description: string;
  isFeatured?: boolean;
  isDefault?: boolean;
  displayOrder: number;
  htmlLayout: string;
  cssStyles: string;
}

const FEATURED_SLUGS = new Set(["aurora", "prism", "vanguard", "beacon"]);

// ──────────────────────────────────────────────────────────────────────────────
// Shared HTML fragments reused across the 20 templates.
// Keep them small and Handlebars-correct; the renderer spreads personalInfo
// on top of contentData, so fields like {{firstName}}, {{headline}} etc. work
// without a `personalInfo.` prefix.
// ──────────────────────────────────────────────────────────────────────────────

const CONTACT_LINE = `<div class="tpl-contact">
  {{#if email}}<span>{{email}}</span>{{/if}}
  {{#if phone}}<span>{{phone}}</span>{{/if}}
  {{#if location}}<span>{{location}}</span>{{/if}}
  {{#if website}}<span>{{website}}</span>{{/if}}
  {{#if linkedIn}}<span>{{linkedIn}}</span>{{/if}}
</div>`;

const SUMMARY_SECTION = `{{#if bio}}
<section class="tpl-section">
  <h2 class="tpl-section-title">Summary</h2>
  <p class="tpl-bio">{{bio}}</p>
</section>
{{/if}}`;

const SKILLS_SECTION = `{{#if skills}}
<section class="tpl-section">
  <h2 class="tpl-section-title">Skills</h2>
  <ul class="tpl-skills">{{#each skills}}<li>{{this}}</li>{{/each}}</ul>
</section>
{{/if}}`;

const LANGUAGES_SECTION = `{{#if languages}}
<section class="tpl-section">
  <h2 class="tpl-section-title">Languages</h2>
  <ul class="tpl-langs">{{#each languages}}<li>{{this}}</li>{{/each}}</ul>
</section>
{{/if}}`;

const EXPERIENCE_SECTION = `{{#if experience}}
<section class="tpl-section">
  <h2 class="tpl-section-title">Experience</h2>
  {{#each experience}}
  <article class="tpl-job">
    <header>
      <h3>{{role}}</h3>
      <span class="tpl-employer">{{company}}</span>
      <span class="tpl-dates">{{from}} — {{#if current}}Present{{else}}{{to}}{{/if}}</span>
    </header>
    {{#if desc}}<p>{{desc}}</p>{{/if}}
  </article>
  {{/each}}
</section>
{{/if}}`;

const EDUCATION_SECTION = `{{#if education}}
<section class="tpl-section">
  <h2 class="tpl-section-title">Education</h2>
  {{#each education}}
  <article class="tpl-edu">
    <h3>{{school}}</h3>
    <span>{{degree}}{{#if field}}, {{field}}{{/if}}</span>
    <span class="tpl-dates">{{from}} — {{to}}{{#if gpa}} · GPA {{gpa}}{{/if}}</span>
  </article>
  {{/each}}
</section>
{{/if}}`;

const CERTS_SECTION = `{{#if certifications}}
<section class="tpl-section">
  <h2 class="tpl-section-title">Certifications</h2>
  <ul class="tpl-certs">
    {{#each certifications}}<li><strong>{{name}}</strong> · {{issuer}} ({{year}})</li>{{/each}}
  </ul>
</section>
{{/if}}`;

// ──────────────────────────────────────────────────────────────────────────────
// Per-template layouts
// ──────────────────────────────────────────────────────────────────────────────

function modernLayout(slug: string, accent: string): string {
  return `<article class="tpl tpl-modern tpl-${slug}">
  <header class="tpl-hero">
    <h1>{{firstName}} {{lastName}}</h1>
    {{#if headline}}<p class="tpl-headline">{{headline}}</p>{{/if}}
    ${CONTACT_LINE}
  </header>
  <div class="tpl-grid">
    <main class="tpl-main">
      ${SUMMARY_SECTION}
      ${EXPERIENCE_SECTION}
      ${EDUCATION_SECTION}
      ${CERTS_SECTION}
  </main>
    <aside class="tpl-aside">
      ${SKILLS_SECTION}
      ${LANGUAGES_SECTION}
    </aside>
  </div>
</article>
<style>:root{--accent:${accent};}</style>`;
}

function classicLayout(): string {
  return `<article class="tpl tpl-classic">
  <header class="tpl-header">
    <h1>{{firstName}} {{lastName}}</h1>
    {{#if headline}}<p class="tpl-headline">{{headline}}</p>{{/if}}
    ${CONTACT_LINE}
  </header>
  <hr />
  ${SUMMARY_SECTION}
  ${EXPERIENCE_SECTION}
  ${EDUCATION_SECTION}
  ${SKILLS_SECTION}
  ${CERTS_SECTION}
  ${LANGUAGES_SECTION}
</article>`;
}

function creativeLayout(slug: string, accent: string): string {
  return `<article class="tpl tpl-creative tpl-${slug}">
  <header class="tpl-banner">
    <h1>{{firstName}} {{lastName}}</h1>
    {{#if headline}}<p class="tpl-headline">{{headline}}</p>{{/if}}
    ${CONTACT_LINE}
  </header>
  <div class="tpl-creative-grid">
    <section class="tpl-creative-left">
      ${SUMMARY_SECTION}
      ${EXPERIENCE_SECTION}
    </section>
    <section class="tpl-creative-right">
      ${SKILLS_SECTION}
      ${EDUCATION_SECTION}
      ${CERTS_SECTION}
      ${LANGUAGES_SECTION}
    </section>
  </div>
</article>
<style>:root{--accent:${accent};}</style>`;
}

function atsLayout(): string {
  return `<article class="tpl tpl-ats">
  <header class="tpl-header">
    <h1>{{firstName}} {{lastName}}</h1>
    {{#if headline}}<p class="tpl-headline">{{headline}}</p>{{/if}}
    ${CONTACT_LINE}
  </header>
  ${SUMMARY_SECTION}
  ${SKILLS_SECTION}
  ${EXPERIENCE_SECTION}
  ${EDUCATION_SECTION}
  ${CERTS_SECTION}
  ${LANGUAGES_SECTION}
</article>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// CSS (one scoped stylesheet per layout family)
// ──────────────────────────────────────────────────────────────────────────────

const BASE_CSS = `
.tpl{font-family:Inter,system-ui,sans-serif;color:#1f2937;background:#fff;line-height:1.55;}
.tpl h1{margin:0;font-weight:700;letter-spacing:-0.02em;}
.tpl h2{margin:0;font-weight:700;}
.tpl h3{margin:0;font-weight:600;}
.tpl p{margin:0 0 .5rem;}
.tpl ul{margin:0;padding-left:1.1em;}
.tpl-section{margin-top:1.25rem;}
.tpl-section-title{font-size:.95rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent,#0f172a);border-bottom:1px solid #e5e7eb;padding-bottom:.35rem;margin-bottom:.6rem;}
.tpl-skills,.tpl-langs,.tpl-certs{list-style:disc;}
.tpl-certs li{margin-bottom:.25rem;}
.tpl-contact{font-size:.85rem;color:#475569;display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.5rem;}
.tpl-contact span::before{content:"•";margin-right:.5rem;color:#cbd5e1;}
.tpl-contact span:first-child::before{content:"";margin:0;}
.tpl-job,.tpl-edu{margin-bottom:.75rem;}
.tpl-job header,.tpl-edu{display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline;}
.tpl-employer,.tpl-dates{font-size:.85rem;color:#64748b;font-style:italic;}
`;

const MODERN_CSS = `
${BASE_CSS}
.tpl-modern .tpl-hero{background:var(--accent,#7c3aed);color:#fff;padding:1.5rem;border-radius:14px;}
.tpl-modern .tpl-hero h1{font-size:2.2rem;color:#fff;}
.tpl-modern .tpl-hero .tpl-headline{color:rgba(255,255,255,.85);margin-top:.25rem;}
.tpl-modern .tpl-hero .tpl-contact{color:rgba(255,255,255,.95);}
.tpl-modern .tpl-grid{display:grid;grid-template-columns:2fr 1fr;gap:1.5rem;margin-top:1.5rem;}
.tpl-modern .tpl-aside{background:#f8fafc;padding:1rem;border-radius:12px;}
.tpl-modern .tpl-aside .tpl-skills,.tpl-modern .tpl-aside .tpl-langs{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;padding:0;}
.tpl-modern .tpl-aside .tpl-skills li,.tpl-modern .tpl-aside .tpl-langs li{background:var(--accent,#7c3aed);color:#fff;padding:.3rem .8rem;border-radius:999px;font-size:.8rem;}
`;

const CLASSIC_CSS = `
${BASE_CSS}
.tpl-classic{max-width:780px;margin:0 auto;padding:2.5rem;font-family:Georgia,"Times New Roman",serif;}
.tpl-classic .tpl-header{text-align:center;}
.tpl-classic .tpl-header h1{font-size:2rem;}
.tpl-classic .tpl-contact{justify-content:center;color:#475569;}
.tpl-classic hr{border:none;border-top:2px solid #1f2937;margin:1rem 0;}
.tpl-classic .tpl-section-title{color:#1f2937;border-color:#cbd5e1;}
.tpl-classic{background:#fffdf7;}
`;

const CREATIVE_CSS = `
${BASE_CSS}
.tpl-creative .tpl-banner{background:linear-gradient(135deg,var(--accent,#7c3aed) 0%,#1e1b4b 100%);color:#fff;padding:1.75rem;border-radius:18px;}
.tpl-creative .tpl-banner h1{color:#fff;font-size:2.4rem;}
.tpl-creative .tpl-banner .tpl-headline{color:rgba(255,255,255,.85);}
.tpl-creative .tpl-banner .tpl-contact{color:rgba(255,255,255,.9);}
.tpl-creative-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:1.25rem;margin-top:1.25rem;}
.tpl-creative-right{background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);padding:1rem;border-radius:14px;border:1px solid #e2e8f0;}
.tpl-creative .tpl-section-title{color:var(--accent,#7c3aed);}
`;

const ATS_CSS = `
${BASE_CSS}
.tpl-ats{max-width:780px;margin:0 auto;padding:2rem;font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;}
.tpl-ats .tpl-header h1{font-size:1.6rem;text-transform:uppercase;letter-spacing:.04em;}
.tpl-ats .tpl-contact{color:#000;}
.tpl-ats .tpl-section-title{color:#000;border-color:#000;}
.tpl-ats .tpl-skills,.tpl-ats .tpl-langs,.tpl-ats .tpl-certs{list-style:none;padding-left:0;display:flex;flex-wrap:wrap;gap:.4rem;}
.tpl-ats .tpl-skills li,.tpl-ats .tpl-langs li{background:#f1f5f9;padding:.25rem .6rem;border-radius:6px;font-size:.85rem;}
`;

// ──────────────────────────────────────────────────────────────────────────────
// Build the 20-row dataset
// ──────────────────────────────────────────────────────────────────────────────

const MODERN: TemplateSeed[] = [
  { name: "Aurora", slug: "aurora", category: "MODERN",
    description: "Two-column modern layout with violet accent and pill-style skills.",
    isDefault: true, isFeatured: true, displayOrder: 0,
    htmlLayout: modernLayout("aurora", "#7c3aed"), cssStyles: MODERN_CSS },
  { name: "Cascade", slug: "cascade", category: "MODERN",
    description: "Clean single-column with sky-blue accent and tag chips for skills.",
    displayOrder: 1,
    htmlLayout: modernLayout("cascade", "#0ea5e9"), cssStyles: MODERN_CSS },
  { name: "Monolith", slug: "monolith", category: "MODERN",
    description: "Dark dramatic layout with stark typography and minimal lines.",
    isFeatured: true, displayOrder: 2,
    htmlLayout: modernLayout("monolith", "#fafafa"), cssStyles: `${BASE_CSS}\n${MODERN_CSS}\n.tpl-modern{background:#0a0a0a;color:#fafafa;}\n.tpl-modern .tpl-hero{background:#000;}\n.tpl-modern .tpl-section-title{color:#fafafa;border-color:#52525b;}\n` },
  { name: "Quanta", slug: "quanta", category: "MODERN",
    description: "Engineering-manager style with dark header band and two columns.",
    displayOrder: 3,
    htmlLayout: modernLayout("quanta", "#1e293b"), cssStyles: MODERN_CSS },
  { name: "Lumen", slug: "lumen", category: "MODERN",
    description: "Soft pastel cards with warm amber palette and gentle typography.",
    displayOrder: 4,
    htmlLayout: modernLayout("lumen", "#f59e0b"), cssStyles: MODERN_CSS },
];

const CLASSIC: TemplateSeed[] = [
  { name: "Vanguard", slug: "vanguard", category: "CLASSIC",
    description: "Serif typography with double rules, suited to legal and finance roles.",
    isFeatured: true, displayOrder: 5,
    htmlLayout: classicLayout(), cssStyles: CLASSIC_CSS },
  { name: "Sentinel", slug: "sentinel", category: "CLASSIC",
    description: "Centered two-column serif layout with navy accent rules.",
    displayOrder: 6,
    htmlLayout: classicLayout(), cssStyles: CLASSIC_CSS + `\n.tpl-classic .tpl-section-title{color:#1e3a8a;border-color:#1e3a8a;}` },
  { name: "Heritage", slug: "heritage", category: "CLASSIC",
    description: "Old-world italic CV styling with ornamental rule pairs and warm tones.",
    displayOrder: 7,
    htmlLayout: classicLayout(), cssStyles: CLASSIC_CSS + `\n.tpl-classic{background:#fffbeb;color:#451a03;}\n.tpl-classic .tpl-section-title{color:#92400e;}` },
  { name: "Lattice", slug: "lattice", category: "CLASSIC",
    description: "Consulting-style: dark banner with gold accents and structured sections.",
    displayOrder: 8,
    htmlLayout: classicLayout(), cssStyles: CLASSIC_CSS + `\n.tpl-classic{background:#fafafa;}\n.tpl-classic .tpl-header{background:#0f172a;color:#fafafa;padding:1rem;border-radius:8px;}\n.tpl-classic .tpl-header h1{color:#fbbf24;}\n.tpl-classic .tpl-section-title{color:#0f172a;}` },
  { name: "Bastion", slug: "bastion", category: "CLASSIC",
    description: "Dossier-style with double-line page borders and tracking-uppercase headers.",
    displayOrder: 9,
    htmlLayout: classicLayout(), cssStyles: CLASSIC_CSS + `\n.tpl-classic{border:8px double #1f2937;padding:2rem;}` },
];

const CREATIVE: TemplateSeed[] = [
  { name: "Prism", slug: "prism", category: "CREATIVE",
    description: "Bold dark gradient with neon accents — for designers and filmmakers.",
    isFeatured: true, displayOrder: 10,
    htmlLayout: creativeLayout("prism", "#ec4899"), cssStyles: CREATIVE_CSS },
  { name: "Mosaic", slug: "mosaic", category: "CREATIVE",
    description: "Tile-based header with multicolor portfolio sections.",
    displayOrder: 11,
    htmlLayout: creativeLayout("mosaic", "#f59e0b"), cssStyles: CREATIVE_CSS },
  { name: "Spectrum", slug: "spectrum", category: "CREATIVE",
    description: "Rainbow rule header with colored section accents and skill bars.",
    displayOrder: 12,
    htmlLayout: creativeLayout("spectrum", "#a855f7"), cssStyles: CREATIVE_CSS },
  { name: "Atelier", slug: "atelier", category: "CREATIVE",
    description: "Editorial / magazine spread with pull-quote and columned text.",
    displayOrder: 13,
    htmlLayout: creativeLayout("atelier", "#a21caf"), cssStyles: CREATIVE_CSS },
  { name: "Folio", slug: "folio", category: "CREATIVE",
    description: "Asymmetric dark folio with side-rail nav and project-card grid.",
    displayOrder: 14,
    htmlLayout: creativeLayout("folio", "#fbbf24"), cssStyles: `${CREATIVE_CSS}\n.tpl-creative{background:#0c0a09;color:#fafafa;}\n.tpl-creative .tpl-section-title{color:#fbbf24;}\n` },
];

const ATS: TemplateSeed[] = [
  { name: "Beacon", slug: "beacon", category: "ATS",
    description: "Plain Arial single column — maximum ATS compatibility.",
    isFeatured: true, displayOrder: 15,
    htmlLayout: atsLayout(), cssStyles: ATS_CSS },
  { name: "Compass", slug: "compass", category: "ATS",
    description: "ATS-safe with strong all-caps name header and spaced sections.",
    displayOrder: 16,
    htmlLayout: atsLayout(), cssStyles: ATS_CSS },
  { name: "Vector", slug: "vector", category: "ATS",
    description: "Reverse-header black bar layout for engineering resumes.",
    displayOrder: 17,
    htmlLayout: atsLayout(), cssStyles: `${ATS_CSS}\n.tpl-ats{background:#fff;}\n.tpl-ats .tpl-header{background:#000;color:#fff;padding:1rem;}\n.tpl-ats .tpl-header h1{color:#fff;}\n.tpl-ats .tpl-contact{color:#fff;}` },
  { name: "Plumb", slug: "plumb", category: "ATS",
    description: "Plain-text-friendly resume for trades and technical roles.",
    displayOrder: 18,
    htmlLayout: atsLayout(), cssStyles: ATS_CSS },
  { name: "Horizon", slug: "horizon", category: "ATS",
    description: "Logistics/operations-friendly single column, very readable.",
    displayOrder: 19,
    htmlLayout: atsLayout(), cssStyles: ATS_CSS },
];

const ALL: TemplateSeed[] = [...MODERN, ...CLASSIC, ...CREATIVE, ...ATS];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function ensureAdminUserId(): Promise<string> {
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existing) return existing.id;

  console.log("No admin user found — creating dev admin (admin@profileai.local / AdminPass123!)");
  const id = randomUUID();
  const passwordHash = await bcrypt.hash("AdminPass123!", 10);
  const created = await prisma.user.create({
    data: {
      id,
      name: "ProfileAI Admin",
      email: "admin@profileai.local",
      emailVerified: true,
      role: "ADMIN",
      isActive: true,
    },
  });
  // BetterAuth Account row holds the credential; use the same id for FK alignment.
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: created.id,
      providerId: "credential",
      userId: created.id,
      password: passwordHash,
    },
  });
  return created.id;
}

async function upsertTemplate(seed: TemplateSeed, createdBy: string) {
  const existing = await prisma.resumeTemplate.findFirst({ where: { name: seed.name } });
  const thumbnailUrl = `/templates/${seed.slug}.svg`;
  const data = {
    name: seed.name,
    description: seed.description,
    thumbnailUrl,
    htmlLayout: seed.htmlLayout,
    cssStyles: seed.cssStyles,
    category: seed.category,
    isActive: true,
    isDefault: seed.isDefault ?? false,
    isFeatured: !!seed.isFeatured || FEATURED_SLUGS.has(seed.slug),
    displayOrder: seed.displayOrder,
    createdBy,
  };

  if (existing) {
    return prisma.resumeTemplate.update({ where: { id: existing.id }, data });
  }
  return prisma.resumeTemplate.create({ data });
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const createdBy = await ensureAdminUserId();
  console.log(`Upserting ${ALL.length} templates (createdBy=${createdBy})…`);

  // Reset isDefault across the board before honoring the (at most one) seed default.
  await prisma.resumeTemplate.updateMany({ data: { isDefault: false } });

  for (const t of ALL) {
    const row = await upsertTemplate(t, createdBy);
    console.log(`  ✓ ${row.category.padEnd(8)} ${row.name.padEnd(10)} → ${row.thumbnailUrl}`);
  }

  const total = await prisma.resumeTemplate.count();
  console.log(`Done. ResumeTemplate rows in DB: ${total}`);
}

main()
  .catch((err) => {
    console.error("seed:templates failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
