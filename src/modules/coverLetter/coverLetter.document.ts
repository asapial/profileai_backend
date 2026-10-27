import { renderPdfWithLocalBrowser } from '../../utils/browserPdf';

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

type CoverLetterDocument = { title: string; contentText: string | null; contentJson: unknown };

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderCoverLetterHtml(letter: CoverLetterDocument): string {
  const text = editableCoverLetterText(letter.contentText, letter.contentJson);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(letter.title)}</title><style>
@page{size:A4;margin:19mm}
html,body{margin:0;padding:0;background:#fff;color:#172033}
body{font-family:Arial,"Noto Sans Bengali","Nirmala UI",sans-serif;font-size:11pt;line-height:1.5}
main{white-space:pre-wrap;overflow-wrap:anywhere}
</style></head><body><main>${escapeHtml(text)}</main></body></html>`;
}

export async function buildCoverLetterPdf(letter: CoverLetterDocument): Promise<Buffer> {
  const html = renderCoverLetterHtml(letter);
  const rendererUrl = process.env.PUPPETEER_SERVICE_URL;
  if (process.env.NODE_ENV === 'production' && rendererUrl) {
    try {
      const response = await fetch(`${rendererUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, options: { format: 'A4' } }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Renderer returned ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.warn('[Cover letter export] Remote renderer unavailable; trying local Chromium.', error);
    }
  }
  return renderPdfWithLocalBrowser(html, 'A4');
}
