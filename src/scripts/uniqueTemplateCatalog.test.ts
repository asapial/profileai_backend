import assert from "node:assert/strict";
import test from "node:test";
import Handlebars from "handlebars";

// @ts-expect-error Node's native type-strip test runner requires the explicit
// extension; tsx also accepts it in the normal project test command.
const { UNIQUE_TEMPLATE_CATALOG } = await import("./uniqueTemplateCatalog.ts");

const uniqueCount = (values: string[]) => new Set(values).size;

const contrastAgainstWhite = (hex: string) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const [red = 0, green = 0, blue = 0] = channels;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return 1.05 / (luminance + 0.05);
};

test("adds exactly 20 résumés and 20 CVs", () => {
  assert.equal(UNIQUE_TEMPLATE_CATALOG.length, 40);
  assert.equal(UNIQUE_TEMPLATE_CATALOG.filter((item) => item.documentType === "RESUME").length, 20);
  assert.equal(UNIQUE_TEMPLATE_CATALOG.filter((item) => item.documentType === "CV").length, 20);
});

test("all added templates have unique names, slugs, palettes, and non-color layouts", () => {
  assert.equal(uniqueCount(UNIQUE_TEMPLATE_CATALOG.map((item) => item.name)), 40);
  assert.equal(uniqueCount(UNIQUE_TEMPLATE_CATALOG.map((item) => item.slug)), 40);
  assert.equal(uniqueCount(UNIQUE_TEMPLATE_CATALOG.map((item) => item.accent.toLowerCase())), 40);
  assert.equal(
    uniqueCount(UNIQUE_TEMPLATE_CATALOG.map((item) => item.accent.toLowerCase() + "/" + item.surface.toLowerCase())),
    40,
  );

  // HTML contains no palette values. Unique markup therefore proves these
  // are structural designs, not one layout recolored forty times.
  assert.equal(uniqueCount(UNIQUE_TEMPLATE_CATALOG.map((item) => item.htmlLayout)), 40);
});

test("every palette keeps white text readable on its accent surface", () => {
  for (const template of UNIQUE_TEMPLATE_CATALOG) {
    assert.match(template.accent, /^#[0-9A-F]{6}$/);
    assert.ok(
      contrastAgainstWhite(template.accent) >= 4.5,
      template.name + " accent must meet WCAG AA against white",
    );
  }
});

test("every layout supports the canonical content and customization contract", () => {
  const sample = {
    firstName: "Alex",
    lastName: "Morgan",
    email: "alex@example.com",
    phone: "+1 555 0100",
    location: "Dhaka",
    headline: "Product leader",
    summary: "Builds useful products.",
    skills: ["Strategy", "Research"],
    languages: ["English"],
    experience: [{ role: "Director", company: "Northstar", from: "2022", current: true, bullets: ["Led growth."] }],
    education: [{ degree: "MSc", field: "Design", school: "University", from: "2017", to: "2019" }],
    certifications: [{ name: "Leadership", issuer: "Institute", year: "2025" }],
    projects: [{ title: "Platform", description: "Launched a platform.", techStack: ["TypeScript"] }],
  };

  for (const template of UNIQUE_TEMPLATE_CATALOG) {
    assert.match(template.htmlLayout, new RegExp('class="tpl ut ut-' + template.slug + '"'));
    assert.match(template.htmlLayout, /tpl-section-title/);
    assert.match(template.htmlLayout, /\{\{#if experience\}\}/);
    assert.match(template.htmlLayout, /\{\{#if education\}\}/);
    assert.match(template.htmlLayout, /\{\{#if skills\}\}/);
    assert.match(template.cssStyles, new RegExp('--accent:' + template.accent, "i"));
    assert.doesNotMatch(template.cssStyles, /url\s*\(/i);
    assert.doesNotMatch(template.htmlLayout, /<script\b/i);

    const rendered = Handlebars.compile(template.htmlLayout)(sample);
    assert.match(rendered, /Alex/);
    assert.match(rendered, /Northstar/);
    assert.match(rendered, /University/);
  }
});

test("both document types cover every gallery category", () => {
  for (const documentType of ["RESUME", "CV"] as const) {
    const categories = new Set(
      UNIQUE_TEMPLATE_CATALOG
        .filter((item) => item.documentType === documentType)
        .map((item) => item.category),
    );
    assert.deepEqual([...categories].sort(), ["ATS", "CLASSIC", "CREATIVE", "MODERN"]);
  }
});

