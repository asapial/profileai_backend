/* eslint-disable no-console */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { prisma } from "../lib/prisma";

type Category = "MODERN" | "CLASSIC" | "CREATIVE" | "ATS";
type DocumentType = "RESUME" | "CV";
type Family = "modern" | "classic" | "creative" | "minimal" | "executive" | "ats";

type TemplateSpec = {
  name: string;
  slug: string;
  category: Category;
  family: Family;
  accent: string;
  surface: string;
  description: string;
  documentType: DocumentType;
};

const FEATURED = new Set([
  "aurora",
  "vanguard",
  "prism",
  "beacon",
  "academic-atlas",
  "clinical-clarity",
  "lab-notes",
  "executive-vitae",
]);

const CONTACT = `<div class="tpl-contact">
  {{#if email}}<span>{{email}}</span>{{/if}}
  {{#if phone}}<span>{{phone}}</span>{{/if}}
  {{#if location}}<span>{{location}}</span>{{/if}}
  {{#if website}}<span>{{website}}</span>{{/if}}
  {{#if linkedIn}}<span>{{linkedIn}}</span>{{/if}}
</div>`;

const SUMMARY = `{{#if bio}}<section class="tpl-section tpl-summary"><h2 class="tpl-section-title">Profile</h2><p>{{bio}}</p></section>{{/if}}`;
const EXPERIENCE = `{{#if experience}}<section class="tpl-section tpl-experience"><h2 class="tpl-section-title">Experience</h2>{{#each experience}}<article class="tpl-entry"><div class="tpl-entry-head"><div><h3>{{role}}</h3><strong>{{company}}</strong></div><span>{{from}} – {{#if current}}Present{{/if}}{{to}}</span></div>{{#if desc}}<p>{{desc}}</p>{{/if}}{{#if bullets}}<ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>{{/if}}</article>{{/each}}</section>{{/if}}`;
const EDUCATION = `{{#if education}}<section class="tpl-section tpl-education"><h2 class="tpl-section-title">Education</h2>{{#each education}}<article class="tpl-entry"><div class="tpl-entry-head"><div><h3>{{degree}}{{#if field}}, {{field}}{{/if}}</h3><strong>{{school}}</strong></div><span>{{from}} – {{to}}</span></div>{{#if gpa}}<p>GPA {{gpa}}</p>{{/if}}</article>{{/each}}</section>{{/if}}`;
const SKILLS = `{{#if skills}}<section class="tpl-section"><h2 class="tpl-section-title">Expertise</h2><ul class="tpl-tags">{{#each skills}}<li>{{this}}</li>{{/each}}</ul></section>{{/if}}`;
const CERTIFICATIONS = `{{#if certifications}}<section class="tpl-section"><h2 class="tpl-section-title">Credentials</h2><ul class="tpl-list">{{#each certifications}}<li><strong>{{name}}</strong><span>{{issuer}} · {{year}}</span></li>{{/each}}</ul></section>{{/if}}`;
const LANGUAGES = `{{#if languages}}<section class="tpl-section"><h2 class="tpl-section-title">Languages</h2><ul class="tpl-tags">{{#each languages}}<li>{{this}}</li>{{/each}}</ul></section>{{/if}}`;

const layoutFor = (spec: TemplateSpec) => {
  const kicker = spec.documentType === "CV" ? "Curriculum Vitae" : "Professional Résumé";
  const header = `<header class="tpl-header"><p class="tpl-kicker">${kicker}</p><h1>{{firstName}} {{lastName}}</h1>{{#if headline}}<p class="tpl-headline">{{headline}}</p>{{/if}}${CONTACT}</header>`;
  if (spec.family === "classic" || spec.family === "minimal" || spec.family === "ats") {
    return `<article class="tpl tpl-${spec.family} tpl-${spec.slug}">${header}<main>${SUMMARY}${EXPERIENCE}${EDUCATION}${SKILLS}${CERTIFICATIONS}${LANGUAGES}</main></article>`;
  }
  if (spec.family === "executive") {
    return `<article class="tpl tpl-executive tpl-${spec.slug}"><div class="tpl-rail">${header}${SKILLS}${LANGUAGES}</div><main>${SUMMARY}${EXPERIENCE}${EDUCATION}${CERTIFICATIONS}</main></article>`;
  }
  return `<article class="tpl tpl-${spec.family} tpl-${spec.slug}">${header}<div class="tpl-columns"><main>${SUMMARY}${EXPERIENCE}${EDUCATION}</main><aside>${SKILLS}${CERTIFICATIONS}${LANGUAGES}</aside></div></article>`;
};

const BASE_CSS = `
.tpl{box-sizing:border-box;width:100%;min-height:297mm;padding:42px;background:#fff;color:#172033;font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.5}
.tpl *{box-sizing:border-box}.tpl h1,.tpl h2,.tpl h3,.tpl p,.tpl ul{margin:0}.tpl h1{font-size:34px;line-height:1.08;letter-spacing:-.04em}.tpl h3{font-size:14px}.tpl strong{font-weight:650}.tpl-kicker{margin-bottom:7px!important;color:var(--accent);font-size:9px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}.tpl-headline{margin-top:7px!important;color:#526078;font-size:15px}.tpl-contact{display:flex;flex-wrap:wrap;gap:5px 14px;margin-top:13px;color:#526078;font-size:10px}.tpl-section{margin-top:21px}.tpl-section-title{margin-bottom:9px!important;border-bottom:1px solid #dce2ea;padding-bottom:5px;color:var(--accent);font-size:10px;letter-spacing:.16em;text-transform:uppercase}.tpl-entry{margin-bottom:13px}.tpl-entry-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.tpl-entry-head>span{flex:none;color:#69768b;font-size:10px}.tpl-entry p,.tpl-entry ul{margin-top:6px}.tpl-entry ul{padding-left:16px}.tpl-tags{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0}.tpl-tags li{border:1px solid color-mix(in srgb,var(--accent) 22%,#dce2ea);border-radius:999px;background:var(--surface);padding:3px 8px;font-size:10px}.tpl-list{display:grid;gap:7px;list-style:none;padding:0}.tpl-list li{display:grid;gap:1px}.tpl-list span{color:#69768b;font-size:10px}
`;

const FAMILY_CSS: Record<Family, string> = {
  modern: `.tpl-modern .tpl-header{border-radius:18px;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 66%,#111827));padding:26px;color:#fff}.tpl-modern .tpl-kicker,.tpl-modern .tpl-headline,.tpl-modern .tpl-contact{color:#fff}.tpl-modern .tpl-columns{display:grid;grid-template-columns:minmax(0,1fr) 185px;gap:28px}.tpl-modern aside{border-left:1px solid #e5eaf0;padding-left:20px}`,
  classic: `.tpl-classic{border-top:7px double var(--accent);font-family:Georgia,"Times New Roman",serif}.tpl-classic .tpl-header{text-align:center}.tpl-classic .tpl-contact{justify-content:center}.tpl-classic .tpl-section-title{border-bottom:3px double var(--accent);color:#293247}.tpl-classic .tpl-kicker{color:var(--accent)}`,
  creative: `.tpl-creative{border-radius:4px;background:linear-gradient(90deg,var(--surface) 0 31%,#fff 31%)}.tpl-creative .tpl-header{margin:-42px -42px 0;padding:34px 42px;background:var(--accent);color:#fff}.tpl-creative .tpl-kicker,.tpl-creative .tpl-headline,.tpl-creative .tpl-contact{color:#fff}.tpl-creative .tpl-columns{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(160px,.8fr);gap:34px}.tpl-creative aside{order:-1}`,
  minimal: `.tpl-minimal{padding:58px 52px}.tpl-minimal .tpl-header{max-width:640px}.tpl-minimal .tpl-section{margin-top:27px}.tpl-minimal .tpl-section-title{border:0;padding:0;color:#748096;font-size:9px}.tpl-minimal .tpl-entry-head h3{font-size:15px}`,
  executive: `.tpl-executive{display:grid;grid-template-columns:205px minmax(0,1fr);gap:34px;padding:0}.tpl-executive .tpl-rail{min-height:297mm;background:var(--accent);padding:42px 25px;color:#fff}.tpl-executive main{padding:26px 36px 42px 0}.tpl-executive .tpl-rail .tpl-kicker,.tpl-executive .tpl-rail .tpl-headline,.tpl-executive .tpl-rail .tpl-contact,.tpl-executive .tpl-rail .tpl-section-title{color:#fff}.tpl-executive .tpl-contact{display:grid}.tpl-executive .tpl-tags li{border-color:#ffffff55;background:#ffffff14}`,
  ats: `.tpl-ats{padding:38px;font-family:Arial,"Helvetica Neue",sans-serif;color:#111}.tpl-ats .tpl-header{border-bottom:2px solid #111;padding-bottom:14px}.tpl-ats .tpl-kicker{color:#111}.tpl-ats .tpl-section-title{border-bottom:1px solid #111;color:#111;letter-spacing:.08em}.tpl-ats .tpl-tags li{border:0;border-radius:0;background:transparent;padding:0}.tpl-ats .tpl-tags li:not(:last-child)::after{content:" ·"}`,
};

const cssFor = (spec: TemplateSpec, index: number) => {
  const variants = [
    `.tpl-${spec.slug}{--accent:${spec.accent};--surface:${spec.surface}}`,
    `.tpl-${spec.slug}{--accent:${spec.accent};--surface:${spec.surface}}.tpl-${spec.slug} .tpl-header{border-radius:0}.tpl-${spec.slug} .tpl-tags li{border-radius:4px}`,
    `.tpl-${spec.slug}{--accent:${spec.accent};--surface:${spec.surface}}.tpl-${spec.slug} .tpl-section-title{border-left:3px solid var(--accent);border-bottom-color:transparent;padding-left:8px}`,
    `.tpl-${spec.slug}{--accent:${spec.accent};--surface:${spec.surface};box-shadow:inset 0 0 0 1px #e5eaf0}.tpl-${spec.slug} .tpl-header{box-shadow:0 12px 28px color-mix(in srgb,var(--accent) 18%,transparent)}`,
    `.tpl-${spec.slug}{--accent:${spec.accent};--surface:${spec.surface};background:linear-gradient(180deg,#fff,var(--surface))}.tpl-${spec.slug} h1{font-weight:600}`,
  ];
  return `${BASE_CSS}\n${FAMILY_CSS[spec.family]}\n${variants[index % variants.length]}`;
};

const resumeSpecs: TemplateSpec[] = [
  ["Aurora","aurora","MODERN","modern","#7357e8","#f1efff","A polished violet two-column résumé for product and technology roles."],
  ["Cascade","cascade","MODERN","minimal","#0284c7","#eef8ff","A calm, whitespace-led résumé with crisp blue hierarchy."],
  ["Monolith","monolith","MODERN","executive","#202938","#f1f4f8","A confident dark-rail layout for senior technical leaders."],
  ["Quanta","quanta","MODERN","modern","#0f766e","#ecfdf9","An engineering-focused résumé with precise visual rhythm."],
  ["Lumen","lumen","MODERN","modern","#d97706","#fff7e6","A warm and approachable résumé for people-centered roles."],
  ["Vanguard","vanguard","CLASSIC","classic","#1e3a5f","#f5f7fa","A traditional serif résumé suited to law, finance, and consulting."],
  ["Sentinel","sentinel","CLASSIC","classic","#334155","#f4f6f8","A restrained, authoritative layout with strong section rules."],
  ["Heritage","heritage","CLASSIC","classic","#92400e","#fff8e7","Warm editorial typography for established professionals."],
  ["Lattice","lattice","CLASSIC","executive","#173a63","#edf3f9","A structured executive résumé built for complex careers."],
  ["Bastion","bastion","CLASSIC","classic","#3f3f46","#f5f5f5","A durable dossier-style design with disciplined spacing."],
  ["Prism","prism","CREATIVE","creative","#c026d3","#fdf1ff","A bold portfolio-ready résumé for visual and creative work."],
  ["Mosaic","mosaic","CREATIVE","creative","#e85d04","#fff4ea","An energetic modular layout with a memorable color rail."],
  ["Spectrum","spectrum","CREATIVE","modern","#7c3aed","#f5f0ff","A vivid modern résumé balanced for creativity and readability."],
  ["Atelier","atelier","CREATIVE","creative","#9d174d","#fff1f5","An editorial résumé for design, fashion, and brand professionals."],
  ["Folio","folio","CREATIVE","executive","#4338ca","#eef2ff","A portfolio-inspired split layout with a confident sidebar."],
  ["Beacon","beacon","ATS","ats","#111827","#f8fafc","A parser-first single-column résumé with maximum compatibility."],
  ["Compass","compass","ATS","ats","#1d4ed8","#eff6ff","A clean ATS résumé that keeps dates and roles easy to scan."],
  ["Vector","vector","ATS","ats","#0f766e","#f0fdfa","A technical résumé optimized for keyword-rich experience."],
  ["Plumb","plumb","ATS","minimal","#374151","#f9fafb","A straightforward résumé for operations, trades, and logistics."],
  ["Horizon","horizon","ATS","ats","#0369a1","#f0f9ff","A high-clarity résumé designed for fast recruiter review."],
  ["Meridian","meridian","MODERN","modern","#2563eb","#eff6ff","A versatile blue résumé for cross-functional professionals."],
  ["Novus","novus","MODERN","minimal","#059669","#ecfdf5","A fresh minimal layout for early and mid-career candidates."],
  ["Keystone","keystone","CLASSIC","executive","#7c2d12","#fff7ed","An executive résumé that emphasizes leadership progression."],
  ["Ledger","ledger","CLASSIC","classic","#166534","#f0fdf4","A dependable finance-ready résumé with precise alignment."],
  ["Studio","studio","CREATIVE","creative","#db2777","#fdf2f8","A refined creative résumé for studios and agencies."],
  ["Ember","ember","CREATIVE","modern","#ea580c","#fff7ed","A warm modern résumé with energetic but professional contrast."],
  ["Linear","linear","ATS","minimal","#475569","#f8fafc","A lean résumé with a clear linear reading path."],
  ["Vertex","vertex","ATS","ats","#4f46e5","#eef2ff","A compact technical résumé built around measurable impact."],
  ["Northstar","northstar","MODERN","executive","#075985","#f0f9ff","A strategic leadership résumé with a navigational side rail."],
  ["Signal","signal","CREATIVE","creative","#be123c","#fff1f2","A distinctive résumé for communications and growth roles."],
].map(([name,slug,category,family,accent,surface,description]) => ({ name,slug,category,family,accent,surface,description,documentType:"RESUME" })) as TemplateSpec[];

const cvSpecs: TemplateSpec[] = [
  ["Academic Atlas","academic-atlas","CLASSIC","classic","#312e81","#f5f3ff","A scholarly CV for faculty applications, grants, and fellowships."],
  ["Citation","citation","ATS","ats","#1f2937","#f9fafb","A publication-friendly CV with unambiguous academic hierarchy."],
  ["Faculty","faculty","CLASSIC","classic","#7f1d1d","#fff7f7","A formal faculty CV with an understated institutional character."],
  ["Thesis","thesis","CLASSIC","minimal","#3730a3","#f4f4ff","A spacious academic CV designed for research-led careers."],
  ["Tenure","tenure","CLASSIC","executive","#172554","#eff6ff","A senior academic CV that foregrounds sustained contribution."],
  ["Research Ledger","research-ledger","ATS","ats","#0f766e","#f0fdfa","A rigorous research CV with clean, machine-readable structure."],
  ["Scholar","scholar","CLASSIC","classic","#713f12","#fffbeb","A warm serif CV for the humanities and social sciences."],
  ["Collegiate","collegiate","MODERN","modern","#1d4ed8","#eff6ff","A contemporary academic CV balancing tradition and clarity."],
  ["Fellowship","fellowship","MODERN","minimal","#6d28d9","#f5f3ff","A concise CV for competitive programs and fellowships."],
  ["Archive","archive","ATS","minimal","#52525b","#fafafa","A long-form CV optimized for dense professional histories."],
  ["Clinical Clarity","clinical-clarity","ATS","ats","#0369a1","#f0f9ff","A clinical CV for healthcare, residency, and specialist roles."],
  ["Medica","medica","MODERN","modern","#0f766e","#ecfdf5","A calm healthcare CV with accessible visual hierarchy."],
  ["Counsel","counsel","CLASSIC","classic","#1e3a8a","#eff6ff","A distinguished legal CV for counsel and policy professionals."],
  ["Diplomacy","diplomacy","CLASSIC","executive","#7c2d12","#fff7ed","A composed CV for public service and international affairs."],
  ["Executive Vitae","executive-vitae","MODERN","executive","#111827","#f3f4f6","A premium leadership CV for board and C-suite opportunities."],
  ["Globalist","globalist","MODERN","modern","#0e7490","#ecfeff","A multilingual international CV with confident structure."],
  ["Policy Brief","policy-brief","ATS","ats","#334155","#f8fafc","A policy CV with restrained typography and clear chronology."],
  ["Boardroom","boardroom","CLASSIC","executive","#422006","#fffbeb","A high-trust executive CV with traditional detailing."],
  ["Registry","registry","ATS","minimal","#155e75","#ecfeff","A compliance-friendly CV for regulated professions."],
  ["Credence","credence","CLASSIC","classic","#365314","#f7fee7","A credible professional CV with balanced serif typography."],
  ["Lab Notes","lab-notes","MODERN","modern","#4f46e5","#eef2ff","A modern STEM CV for laboratories, research, and innovation."],
  ["Data Vitae","data-vitae","ATS","ats","#075985","#f0f9ff","A technical CV optimized for data and engineering careers."],
  ["Innovator","innovator","CREATIVE","creative","#7c3aed","#f5f3ff","A modern innovation CV for R&D and emerging technology."],
  ["Architect CV","architect-cv","CREATIVE","creative","#b45309","#fffbeb","A structured visual CV for architecture and spatial design."],
  ["Product Ledger","product-ledger","MODERN","executive","#0f766e","#ecfdf5","A product leadership CV centered on outcomes and scope."],
  ["Studio Vitae","studio-vitae","CREATIVE","creative","#be185d","#fdf2f8","A tasteful visual CV for creative directors and makers."],
  ["Curator","curator","CREATIVE","minimal","#9f1239","#fff1f2","An editorial CV for arts, culture, and museum professionals."],
  ["Panorama","panorama","CREATIVE","modern","#c2410c","#fff7ed","A broad, expressive CV for multidisciplinary careers."],
  ["Syllabus","syllabus","CLASSIC","minimal","#4338ca","#eef2ff","An educator CV with generous spacing and clear milestones."],
  ["Monograph","monograph","CLASSIC","classic","#3f3f46","#fafafa","A polished long-form CV for authors and senior researchers."],
].map(([name,slug,category,family,accent,surface,description]) => ({ name,slug,category,family,accent,surface,description,documentType:"CV" })) as TemplateSpec[];

export const TEMPLATE_CATALOG = [...resumeSpecs, ...cvSpecs];

async function upsertTemplate(spec: TemplateSpec, createdBy: string, displayOrder: number) {
  const existing = await prisma.resumeTemplate.findFirst({ where: { name: spec.name, ownerId: null } });
  const data = {
    name: spec.name,
    description: spec.description,
    thumbnailUrl: "/brand/template-fallback.svg",
    htmlLayout: layoutFor(spec),
    cssStyles: cssFor(spec, displayOrder),
    category: spec.category,
    documentType: spec.documentType,
    reviewStatus: "APPROVED" as const,
    ownerId: null,
    sourceTemplateId: null,
    rejectionReason: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    isCommunity: false,
    isActive: true,
    isDefault: spec.slug === "aurora",
    isFeatured: FEATURED.has(spec.slug),
    displayOrder,
    createdBy,
  };
  return existing
    ? prisma.resumeTemplate.update({ where: { id: existing.id }, data })
    : prisma.resumeTemplate.create({ data });
}

export async function seedTemplates(createdBy = "system") {
  console.log(`Upserting ${TEMPLATE_CATALOG.length} editable résumé and CV templates.`);
  await prisma.resumeTemplate.updateMany({ where: { ownerId: null }, data: { isDefault: false } });
  for (const [index, template] of TEMPLATE_CATALOG.entries()) {
    await upsertTemplate(template, createdBy, index);
  }
  const [resumes, cvs] = await Promise.all([
    prisma.resumeTemplate.count({ where: { ownerId: null, documentType: "RESUME" } }),
    prisma.resumeTemplate.count({ where: { ownerId: null, documentType: "CV" } }),
  ]);
  console.log(`Template catalog ready: ${resumes} résumés and ${cvs} CVs.`);
}

const isCli = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (isCli) {
  seedTemplates(process.env.SEED_CREATED_BY ?? "system")
    .catch((error) => {
      console.error("seed:templates failed:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
