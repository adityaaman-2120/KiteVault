import * as Print from 'expo-print';

import { formatRecoveryKey, generateRecoveryKey } from '@/vault';

import { buildRecoveryHtml, PDF_WARNING, printRecoveryKey } from '../recoveryPdf';

jest.mock('expo-print', () => ({
  printAsync: jest.fn(async () => {}),
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/should-not-be-used.pdf' })),
}));

const text = formatRecoveryKey(generateRecoveryKey());
const created = new Date(2026, 9, 22).getTime();

beforeEach(() => jest.clearAllMocks());

describe('buildRecoveryHtml', () => {
  const html = buildRecoveryHtml(text, created);

  test('contains the 8 groups, numbered', () => {
    text.split('-').forEach((group, i) => {
      expect(html).toContain(`<span class="n">${i + 1}</span><span class="g">${group}</span>`);
    });
  });

  test('warns that anyone with the key can open the vault, and to keep it offline', () => {
    expect(html).toContain('Anyone who has this key can open your vault.');
    expect(html).toMatch(/offline/i);
    expect(html).toMatch(/do not photograph it/i);
    expect(html).toMatch(/screenshot/i);
    expect(html).toMatch(/cloud/i);
  });

  test('explains how to use the key', () => {
    expect(html).toContain('Forgot master password?');
    expect(html).toMatch(/I, L, O and U/);
  });

  test('has no scripts and loads nothing from the internet', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/<(img|link|iframe)\b/i);
    expect(html).not.toMatch(/src=|href=/i);
  });

  test('has no account, name or vault details, only the key and the date', () => {
    // No email address (the CSS "@page" rule is not one).
    expect(html).not.toMatch(/w@w|password manager vault of/i);
  });

  test('is branded: the kite drawn inline, the name and "by Kitelux"', () => {
    expect(html).toMatch(/<svg[\s\S]*<\/svg>/);
    expect(html).toContain('Kite<span>Vault</span>');
    expect(html).toContain('by Kitelux');
    expect(html).toContain('CONFIDENTIAL');
  });

  test('says which characters count and that the dashes and numbers are not part of the key', () => {
    expect(html).toMatch(/dashes, spaces and\s+the numbers above each box are not part of the key/);
  });

  test('has the keep-it-safe checklist and a place to write where the page is kept', () => {
    expect(html).toContain('Keep it safe');
    expect(html.match(/<span class="b"><\/span>/g)).toHaveLength(4);
    expect(html).toMatch(/never write your master password here/i);
  });

  test('warns that a new recovery key makes this one stop working', () => {
    expect(html).toMatch(/this one stops working/);
  });

  test('needs exactly 8 groups', () => {
    expect(() => buildRecoveryHtml('ABC-DEF', created)).toThrow(RangeError);
  });

  test('anything unexpected in a group is escaped, never executed', () => {
    const tricky = ['<b>x</b>', '&', '"q"', 'a', 'b', 'c', 'd', 'e'].join('-');
    const out = buildRecoveryHtml(tricky, created);
    expect(out).not.toContain('<b>x</b>');
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;q&quot;');
  });
});

describe('printRecoveryKey', () => {
  test('opens the system print screen (print or "Save as PDF") with the page', async () => {
    await printRecoveryKey(text, created);
    expect(Print.printAsync).toHaveBeenCalledTimes(1);
    const { html } = (Print.printAsync as jest.Mock).mock.calls[0][0];
    expect(html).toContain(text.split('-')[0]);
  });

  test('never writes a PDF into the app folder', async () => {
    await printRecoveryKey(text, created);
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
  });
});

test('the warning shown before exporting says to keep it offline and never as a screenshot', () => {
  expect(PDF_WARNING).toMatch(/anyone who gets it can open your vault/i);
  expect(PDF_WARNING).toMatch(/offline/i);
  expect(PDF_WARNING).toMatch(/cloud storage/i);
  expect(PDF_WARNING).toMatch(/never take a screenshot or photo/i);
});
