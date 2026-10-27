import assert from 'node:assert/strict';
import test from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { browserExecutable } from '../../utils/browserPdf';
import { buildCoverLetterPdf, coverLetterDocument, coverLetterText, editableCoverLetterText, renderCoverLetterHtml } from './coverLetter.document';

// These fixtures render locally and never contact a configured production service.
process.env.NODE_ENV = 'test';
const browserAvailable = Boolean(browserExecutable());

test('manual cover letter edits round-trip through the exported document', () => {
  const text = 'Dear hiring team,\n\nI build reliable software.\nThank you.';
  assert.equal(coverLetterText(coverLetterDocument(text)), text);
  assert.equal(editableCoverLetterText(JSON.stringify(coverLetterDocument(text)), null), text);
  assert.equal(editableCoverLetterText('', coverLetterDocument('old content')), '');
});

test('cover letter export emits PDF bytes instead of a JSON snapshot', { skip: !browserAvailable }, async () => {
  const pdf = await buildCoverLetterPdf({ title: 'Application', contentText: 'My updated letter.', contentJson: null });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.toString().includes('%%EOF'));
});

test('cover letter HTML escapes the title and letter without dropping literal markup', () => {
  const html = renderCoverLetterHtml({
    title: '</title><script>alert(1)</script>',
    contentText: 'বাংলা & <img src="https://example.test/tracker">\nSecond line.',
    contentJson: null,
  });
  assert.ok(html.includes('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('বাংলা &amp; &lt;img src=&quot;https://example.test/tracker&quot;&gt;\nSecond line.'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
});

test('cover letter PDF retains Bengali Unicode glyphs and English text', { skip: !browserAvailable }, async () => {
  const text = 'Hello — I’m Abdullah. বাংলা আবেদনপত্র';
  const buffer = await buildCoverLetterPdf({ title: 'বাংলা আবেদন', contentText: text, contentJson: null });
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    const extracted = content.items.map((item) => 'str' in item ? item.str : '').join('');
    assert.ok(extracted.startsWith('Hello — I’m Abdullah.'));
    assert.ok(extracted.includes('বাংলা'));
    // Chromium emits some Bengali pre-base vowels in visual order in the PDF
    // text layer. Verify every Unicode character survives without treating
    // that shaping order as Latin text or silently dropping a glyph.
    const characters = (value: string) => [...value.normalize('NFC').replace(/\s/g, '')].sort();
    assert.deepEqual(characters(extracted), characters(text));
  } finally {
    await task.destroy();
  }
});
