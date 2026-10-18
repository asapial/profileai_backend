import JSZip from 'jszip';
import { evidenceChunks, normalize, object, rows, strings, text, type Content } from './ats.logic';

export type ExportCheck = {
  status: 'PASS' | 'WARNING' | 'UNAVAILABLE';
  format: 'PDF' | 'DOCX';
  textCoverage: number | null;
  missingSections: string[];
  message: string;
};
export function checkExtractedText(extracted: string, content: Content, format: 'PDF' | 'DOCX'): ExportCheck {
  const personal = object(content.personalInfo);
  const expected = [
    ...evidenceChunks(content),
    ...['firstName', 'lastName', 'email', 'phone'].map((key) => ({ section: 'Contact', text: text(personal[key] ?? content[key]) })),
    ...rows(content.experience).map((r) => ({ section: 'Experience dates', text: [r.from ?? r.startDate, r.to ?? r.endDate].filter(Boolean).join(' ') })),
    ...strings(content.languages).map((s) => ({ section: 'Languages', text: s })),
  ].filter((chunk) => chunk.text.trim());
  const actualTokens = new Set(normalize(extracted).split(' ').filter(Boolean));
  let total = 0;
  let found = 0;
  const missingSections = new Set<string>();
  for (const chunk of expected) {
    const tokens = normalize(chunk.text).split(' ').filter(Boolean);
    const matches = tokens.filter((token) => actualTokens.has(token)).length;
    total += tokens.length;
    found += matches;
    if (tokens.length && matches / tokens.length < 0.9) missingSections.add(chunk.section);
  }
  const textCoverage = total ? Math.round(found / total * 100) : 0;
  const passed = !!actualTokens.size && total > 0 && textCoverage >= 95 && missingSections.size === 0;
  return { status: passed ? 'PASS' : 'WARNING', format, textCoverage, missingSections: [...missingSections],
    message: passed ? `${format} text extraction passed (${textCoverage}% content coverage). This checks readable text, not every employer's parser or reading order.`
      : `${format} text extraction found missing or unreadable content (${textCoverage}% coverage).${format === 'DOCX' ? ' Use an ATS template for a text-based Word export.' : ' Review the PDF or choose an ATS template.'}` };
}
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('Missing Word document body');
  const xml = await document.async('string');
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => (match[1] ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')).join(' ');
}
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new Error('Resume exceeds verification page limit');
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
      page.cleanup();
    }
    return pages.join('\n');
  } finally { await task.destroy(); }
}
export async function verifyExport(buffer: Buffer, content: Content, format: 'PDF' | 'DOCX'): Promise<ExportCheck> {
  try {
    const extracted = format === 'PDF' ? await extractPdfText(buffer) : await extractDocxText(buffer);
    return checkExtractedText(extracted, content, format);
  } catch (error) {
    console.warn('[ATS] Export verification unavailable', error);
    return { status: 'UNAVAILABLE', format, textCoverage: null, missingSections: [], message: `${format} was generated, but its text extraction could not be verified. Review it before applying.` };
  }
}
