import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';

type JsonObject = Record<string, unknown>;

type ResumeTemplateDocument = {
  name: string;
  category: string;
  htmlLayout: string;
  cssStyles: string;
};

const asObject = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};

const asObjects = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.map(asObject) : [];

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const cleanHex = (value: string): string => value.replace('#', '').toUpperCase();

function templateAccent(template: ResumeTemplateDocument): string {
  const source = `${template.htmlLayout}\n${template.cssStyles}`;
  const match = source.match(/--accent\s*:\s*(#[0-9a-f]{6})/i);
  const matchedColor = match?.[1];
  if (matchedColor) return cleanHex(matchedColor);
  if (template.category === 'CREATIVE') return '7C3AED';
  if (template.category === 'MODERN') return '4F46E5';
  return '0F172A';
}

function sectionTitle(label: string, accent: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    border: {
      bottom: { color: accent, size: 8, style: BorderStyle.SINGLE },
    },
    children: [
      new TextRun({
        text: label.toUpperCase(),
        bold: true,
        color: accent,
        size: 19,
        characterSpacing: 24,
      }),
    ],
  });
}

function summaryChildren(data: JsonObject, accent: string): Paragraph[] {
  const summary = text(data.summary ?? data.bio);
  if (!summary) return [];
  return [
    sectionTitle('Summary', accent),
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: summary, size: 20 })],
    }),
  ];
}

function experienceChildren(data: JsonObject, accent: string): Paragraph[] {
  const rows = asObjects(data.experience);
  if (!rows.length) return [];
  const children: Paragraph[] = [sectionTitle('Experience', accent)];
  for (const row of rows) {
    const role = text(row.role ?? row.title);
    const company = text(row.company);
    const location = text(row.location);
    const from = text(row.from ?? row.startDate);
    const to = row.current ? 'Present' : text(row.to ?? row.endDate);
    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 90, after: 20 },
        children: [
          new TextRun({ text: role || 'Role', bold: true, size: 21 }),
          new TextRun({ text: company ? `  |  ${company}` : '', bold: true, color: accent, size: 20 }),
        ],
      }),
      new Paragraph({
        keepNext: true,
        spacing: { after: 35 },
        children: [
          new TextRun({
            text: [location, [from, to].filter(Boolean).join(' – ')].filter(Boolean).join('  |  '),
            italics: true,
            color: '64748B',
            size: 17,
          }),
        ],
      }),
    );
    const bullets = asStrings(row.bullets);
    const fallback = text(row.desc);
    for (const bullet of bullets.length ? bullets : fallback ? fallback.split(/\r?\n/).filter(Boolean) : []) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 35 },
          children: [new TextRun({ text: bullet, size: 19 })],
        }),
      );
    }
  }
  return children;
}

function educationChildren(data: JsonObject, accent: string): Paragraph[] {
  const rows = asObjects(data.education);
  if (!rows.length) return [];
  const children: Paragraph[] = [sectionTitle('Education', accent)];
  for (const row of rows) {
    const school = text(row.school ?? row.institution);
    const degree = [text(row.degree), text(row.field)].filter(Boolean).join(', ');
    const dates = [text(row.from ?? row.startDate), text(row.to ?? row.endDate)]
      .filter(Boolean)
      .join(' – ');
    const gpa = text(row.gpa);
    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 70, after: 20 },
        children: [new TextRun({ text: school, bold: true, size: 20, color: accent })],
      }),
      new Paragraph({
        spacing: { after: 50 },
        children: [
          new TextRun({ text: degree, size: 19 }),
          new TextRun({ text: [dates, gpa ? `GPA ${gpa}` : ''].filter(Boolean).join('  |  '), italics: true, color: '64748B', size: 17, break: degree ? 1 : 0 }),
        ],
      }),
    );
  }
  return children;
}

function stringListChildren(
  label: string,
  items: string[],
  accent: string,
): Paragraph[] {
  if (!items.length) return [];
  return [
    sectionTitle(label, accent),
    ...items.map(
      (item) =>
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 25 },
          children: [new TextRun({ text: item, size: 18 })],
        }),
    ),
  ];
}

function certificationChildren(data: JsonObject, accent: string): Paragraph[] {
  const rows = asObjects(data.certifications);
  if (!rows.length) return [];
  return [
    sectionTitle('Certifications', accent),
    ...rows.map((row) =>
      new Paragraph({
        spacing: { after: 35 },
        children: [
          new TextRun({ text: text(row.name), bold: true, size: 18 }),
          new TextRun({
            text: [text(row.issuer), text(row.year)].filter(Boolean).join(' · '),
            color: '64748B',
            size: 17,
            break: 1,
          }),
        ],
      }),
    ),
  ];
}

function headerChildren(
  data: JsonObject,
  template: ResumeTemplateDocument,
  accent: string,
): Paragraph[] {
  const personal = asObject(data.personalInfo);
  const firstName = text(personal.firstName ?? data.firstName);
  const lastName = text(personal.lastName ?? data.lastName);
  const headline = text(personal.headline ?? data.headline);
  const contact = [
    text(personal.email ?? data.email),
    text(personal.phone ?? data.phone),
    text(personal.location ?? data.location),
    text(personal.website ?? data.website),
    text(personal.linkedIn ?? data.linkedIn),
  ].filter(Boolean);
  const colorful = template.category === 'MODERN' || template.category === 'CREATIVE';
  const alignment = template.category === 'CLASSIC' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const headerColor = colorful ? 'FFFFFF' : accent;

  return [
    new Paragraph({
      alignment,
      ...(colorful
        ? { shading: { fill: accent, type: ShadingType.CLEAR, color: 'auto' } }
        : {}),
      spacing: { before: colorful ? 180 : 0, after: 55 },
      children: [
        new TextRun({
          text: [firstName, lastName].filter(Boolean).join(' ') || 'Untitled Candidate',
          bold: true,
          color: headerColor,
          size: 36,
        }),
      ],
    }),
    new Paragraph({
      alignment,
      ...(colorful
        ? { shading: { fill: accent, type: ShadingType.CLEAR, color: 'auto' } }
        : {}),
      spacing: { after: 35 },
      children: [new TextRun({ text: headline, color: colorful ? 'EDE9FE' : '475569', size: 21 })],
    }),
    new Paragraph({
      alignment,
      ...(colorful
        ? { shading: { fill: accent, type: ShadingType.CLEAR, color: 'auto' } }
        : {}),
      spacing: { after: colorful ? 180 : 90 },
      children: [
        new TextRun({
          text: contact.join('  •  '),
          color: colorful ? 'FFFFFF' : '475569',
          size: 17,
        }),
      ],
    }),
  ];
}

export async function buildResumeDocx(
  contentData: JsonObject,
  template: ResumeTemplateDocument,
  title: string,
): Promise<Buffer> {
  const accent = templateAccent(template);
  const main = [
    ...summaryChildren(contentData, accent),
    ...experienceChildren(contentData, accent),
  ];
  const supporting = [
    ...stringListChildren('Skills', asStrings(contentData.skills), accent),
    ...educationChildren(contentData, accent),
    ...certificationChildren(contentData, accent),
    ...stringListChildren('Languages', asStrings(contentData.languages), accent),
  ];

  const body =
    template.category === 'MODERN' || template.category === 'CREATIVE'
      ? [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: TableBorders.NONE,
            columnWidths: [6200, 3200],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 66, type: WidthType.PERCENTAGE },
                    margins: { right: 180 },
                    borders: TableBorders.NONE,
                    children: main.length ? main : [new Paragraph('')],
                  }),
                  new TableCell({
                    width: { size: 34, type: WidthType.PERCENTAGE },
                    shading: { fill: 'F8FAFC', type: ShadingType.CLEAR, color: 'auto' },
                    margins: { top: 120, bottom: 120, left: 180, right: 120 },
                    borders: TableBorders.NONE,
                    children: supporting.length ? supporting : [new Paragraph('')],
                  }),
                ],
              }),
            ],
          }),
        ]
      : [...main, ...supporting];

  const document = new Document({
    title,
    subject: `Resume using the ${template.name} template`,
    creator: 'ProFile AI',
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [...headerChildren(contentData, template, accent), ...body],
      },
    ],
  });

  return Packer.toBuffer(document);
}

export async function buildResumePdf(
  contentData: JsonObject,
  template: ResumeTemplateDocument,
  title: string,
  pageSize: 'A4' | 'Letter' = 'A4',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: pageSize,
      margins: { top: 42, right: 48, bottom: 42, left: 48 },
      bufferPages: true,
      info: { Title: title, Author: 'ProFile AI', Subject: `${template.name} resume` },
    });
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = `#${templateAccent(template)}`;
    const personal = asObject(contentData.personalInfo);
    const candidate = [text(personal.firstName), text(personal.lastName)].filter(Boolean).join(' ');
    const headline = text(personal.headline);
    const contact = [
      text(personal.email),
      text(personal.phone),
      text(personal.location),
      text(personal.website),
      text(personal.linkedIn),
    ].filter(Boolean).join('  •  ');
    const colorful = template.category === 'MODERN' || template.category === 'CREATIVE';
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    if (colorful) {
      doc.save().rect(0, 0, doc.page.width, 122).fill(accent).restore();
      doc.fillColor('#FFFFFF');
    } else {
      doc.fillColor(accent);
    }
    doc.font('Helvetica-Bold').fontSize(25).text(candidate || 'Untitled Candidate', {
      align: template.category === 'CLASSIC' ? 'center' : 'left',
    });
    doc.moveDown(0.15).font('Helvetica').fontSize(12).fillColor(colorful ? '#F5F3FF' : '#475569').text(headline, {
      align: template.category === 'CLASSIC' ? 'center' : 'left',
    });
    doc.moveDown(0.3).fontSize(9).fillColor(colorful ? '#FFFFFF' : '#475569').text(contact, {
      align: template.category === 'CLASSIC' ? 'center' : 'left',
    });
    doc.y = colorful ? Math.max(doc.y + 26, 142) : doc.y + 12;

    const ensureSpace = (height = 72) => {
      if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    };
    const section = (label: string) => {
      ensureSpace(48);
      doc.moveDown(0.45);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(accent).text(label.toUpperCase(), {
        characterSpacing: 1.4,
      });
      const lineY = doc.y + 2;
      doc.save().strokeColor(accent).lineWidth(0.8).moveTo(doc.page.margins.left, lineY).lineTo(doc.page.margins.left + contentWidth, lineY).stroke().restore();
      doc.y = lineY + 8;
    };
    const body = (value: string, options: PDFKit.Mixins.TextOptions = {}) => {
      doc.font('Helvetica').fontSize(9.5).fillColor('#1F2937').text(value, {
        lineGap: 2.2,
        ...options,
      });
    };

    const summary = text(contentData.summary ?? contentData.bio);
    if (summary) {
      section('Summary');
      body(summary);
    }

    const experiences = asObjects(contentData.experience);
    if (experiences.length) {
      section('Experience');
      for (const row of experiences) {
        ensureSpace(86);
        const role = text(row.role ?? row.title);
        const company = text(row.company);
        const from = text(row.from ?? row.startDate);
        const to = row.current ? 'Present' : text(row.to ?? row.endDate);
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text(role || 'Role', { continued: Boolean(company) });
        if (company) doc.fillColor(accent).text(`  |  ${company}`);
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#64748B').text([from, to].filter(Boolean).join(' – '));
        const bullets = asStrings(row.bullets);
        const fallback = text(row.desc);
        for (const bullet of bullets.length ? bullets : fallback ? fallback.split(/\r?\n/).filter(Boolean) : []) {
          body(`•  ${bullet}`, { indent: 8, paragraphGap: 2 });
        }
        doc.moveDown(0.25);
      }
    }

    const skills = asStrings(contentData.skills);
    if (skills.length) {
      section('Skills');
      body(skills.join('  •  '));
    }

    const educations = asObjects(contentData.education);
    if (educations.length) {
      section('Education');
      for (const row of educations) {
        ensureSpace(54);
        const school = text(row.school ?? row.institution);
        const degree = [text(row.degree), text(row.field)].filter(Boolean).join(', ');
        const dates = [text(row.from ?? row.startDate), text(row.to ?? row.endDate)].filter(Boolean).join(' – ');
        doc.font('Helvetica-Bold').fontSize(10).fillColor(accent).text(school);
        body([degree, dates, text(row.gpa) ? `GPA ${text(row.gpa)}` : ''].filter(Boolean).join('  |  '));
      }
    }

    const certifications = asObjects(contentData.certifications);
    if (certifications.length) {
      section('Certifications');
      for (const row of certifications) {
        body(`•  ${[text(row.name), text(row.issuer), text(row.year)].filter(Boolean).join(' · ')}`, { indent: 8 });
      }
    }

    const languages = asStrings(contentData.languages);
    if (languages.length) {
      section('Languages');
      body(languages.join('  •  '));
    }

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8').text(
        `${template.name} · ${index + 1}/${range.count}`,
        doc.page.margins.left,
        doc.page.height - 28,
        { width: contentWidth, align: 'right' },
      );
    }
    doc.end();
  });
}
