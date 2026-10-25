import PDFDocument from 'pdfkit';

/** Extract editable text from the paragraph/list structure used by TipTap. */
export function coverLetterText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { type?: string; text?: string; content?: unknown[] };
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hardBreak') return '\n';
  const children = Array.isArray(node.content) ? node.content : Array.isArray(value) ? value : [];
  const separator = ['paragraph', 'heading'].includes(node.type ?? '') ? '' : '\n';
  return children.map(coverLetterText).join(separator);
}

export function coverLetterDocument(text: string) {
  return {
    type: 'doc',
    content: text.split(/\r?\n/).map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

/** Repair legacy rows whose contentText stored serialized TipTap JSON. */
export function editableCoverLetterText(contentText: string | null, contentJson: unknown): string {
  if (contentText !== null) {
    try {
      const legacy = JSON.parse(contentText);
      if (legacy?.type === 'doc') return coverLetterText(legacy);
    } catch { /* Plain text is the normal, editable representation. */ }
    return contentText;
  }
  return coverLetterText(contentJson);
}

export function buildCoverLetterPdf(letter: { title: string; contentText: string | null; contentJson: unknown }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 54, info: { Title: letter.title } });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.font('Helvetica').fontSize(11).fillColor('#172033')
      .text(editableCoverLetterText(letter.contentText, letter.contentJson), { lineGap: 5 });
    document.end();
  });
}
