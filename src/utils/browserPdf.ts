import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

export const browserExecutable = (): string | null => {
  const configured = process.env.CHROME_EXECUTABLE_PATH?.trim();
  const candidates = [
    configured,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((path): path is string => Boolean(path));
  return candidates.find((path) => existsSync(path)) ?? null;
};

export const renderPdfWithLocalBrowser = async (
  html: string,
  pageSize: 'A4' | 'Letter',
): Promise<Buffer> => {
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error('No local Chromium browser was found.');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const bytes = await page.pdf({
      format: pageSize,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
};

