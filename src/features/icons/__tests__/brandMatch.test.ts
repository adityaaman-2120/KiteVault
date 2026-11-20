import fs from 'node:fs';
import path from 'node:path';

import { hostOfAddress, matchBrand } from '../brandMatch';
import { BRAND_DOMAINS, BRAND_NAMES, BRAND_PACKAGES, BRANDS } from '../brandTable.generated';

const key = (input: Parameters<typeof matchBrand>[0]) => matchBrand(input)?.key ?? null;

describe('hostOfAddress', () => {
  test('reads the host from addresses as people write them', () => {
    expect(hostOfAddress('https://www.Amazon.in/ap/signin?x=1')).toBe('www.amazon.in');
    expect(hostOfAddress('amazon.in/login')).toBe('amazon.in');
    expect(hostOfAddress('http://user:pw@github.com:8080/a')).toBe('github.com');
    expect(hostOfAddress('  netflix.com.  ')).toBe('netflix.com');
  });

  test('gives null for things that are not a host', () => {
    expect(hostOfAddress('')).toBeNull();
    expect(hostOfAddress('localhost')).toBeNull();
    expect(hostOfAddress('my bank login')).toBeNull();
  });
});

describe('matchBrand', () => {
  test('matches a web address, with www and any subdomain', () => {
    expect(key({ title: 'x', urls: ['https://github.com/login'] })).toBe('github');
    expect(key({ title: 'x', urls: ['https://www.amazon.in'] })).toBe('amazon');
    expect(key({ title: 'x', urls: ['https://a.b.accounts.netflix.com'] })).toBe('netflix');
  });

  test('a service with its own address wins over its parent', () => {
    expect(key({ title: 'x', urls: ['https://mail.google.com'] })).toBe('gmail');
    expect(key({ title: 'x', urls: ['https://accounts.google.com'] })).toBe('google');
    expect(key({ title: 'x', urls: ['https://drive.google.com/x'] })).toBe('googledrive');
  });

  test('uses the first address that is known', () => {
    expect(key({ title: 'x', urls: ['https://unknown.example', 'https://reddit.com'] })).toBe(
      'reddit',
    );
  });

  test('does not match look-alike hosts', () => {
    expect(key({ title: 'x', urls: ['https://notgithub.com'] })).toBeNull();
    expect(key({ title: 'x', urls: ['https://github.com.evil.example'] })).toBeNull();
    expect(key({ title: 'x', urls: ['https://amazon.in.example.org'] })).toBeNull();
  });

  test('never maps hosting domains shared by many owners', () => {
    for (const shared of [
      'herokuapp.com',
      'github.io',
      'blogspot.com',
      'vercel.app',
      'netlify.app',
    ]) {
      expect(BRAND_DOMAINS[shared]).toBeUndefined();
    }
    expect(key({ title: 'x', urls: ['https://the-internet.herokuapp.com'] })).toBeNull();
  });

  test('matches a linked Android app', () => {
    const link = (packageName: string) => ({ packageName, certSha256: 'AA' });
    expect(key({ title: 'x', appLinks: [link('com.whatsapp')] })).toBe('whatsapp');
    expect(key({ title: 'x', appLinks: [link('com.example.unknown')] })).toBeNull();
  });

  test('matches an exact title, ignoring case and punctuation', () => {
    expect(key({ title: 'GitHub' })).toBe('github');
    expect(key({ title: ' netflix ' })).toBe('netflix');
    expect(key({ title: 'Stack-Overflow' })).toBe('stackoverflow');
    expect(key({ title: 'chatgpt' })).toBe('openai');
  });

  test('a title that is itself a web address counts as an address', () => {
    expect(key({ title: 'netflix.com' })).toBe('netflix');
    expect(key({ title: 'https://www.flipkart.com' })).toBe('flipkart');
  });

  test('does not guess from a longer or partly matching title', () => {
    expect(key({ title: 'My Amazon account' })).toBeNull();
    expect(key({ title: 'Apple pie recipe' })).toBeNull();
    expect(key({ title: 'Google Docs password' })).toBeNull();
    expect(key({ title: 'X' })).toBeNull(); // too short to trust
    expect(key({ title: '' })).toBeNull();
  });

  test('an address beats a title that names another service', () => {
    expect(key({ title: 'Netflix', urls: ['https://github.com'] })).toBe('github');
  });

  test('says whether the logo exists, and gives the colour', () => {
    expect(matchBrand({ title: 'GitHub' })).toMatchObject({ glyph: true, name: 'GitHub' });
    expect(matchBrand({ title: 'Amazon' })).toMatchObject({ glyph: false, hex: '#FF9900' });
  });
});

describe('the generated tables', () => {
  test('every address, app and title points at a real brand with a valid colour', () => {
    for (const map of [BRAND_DOMAINS, BRAND_PACKAGES, BRAND_NAMES]) {
      for (const target of Object.values(map)) expect(BRANDS[target]).toBeDefined();
    }
    for (const brand of Object.values(BRANDS)) expect(brand.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  test('every brand with a logo has its image file, and no file is left over', () => {
    const dir = path.resolve(__dirname, '..', '..', '..', '..', 'assets', 'brands');
    const files = fs
      .readdirSync(dir)
      .map((f) => f.replace(/\.png$/, ''))
      .sort();
    const wanted = Object.entries(BRANDS)
      .filter(([, b]) => b.glyph)
      .map(([k]) => k)
      .sort();
    expect(files).toEqual(wanted);
  });

  test('stays small enough to ship (images under 400 KB in all)', () => {
    const dir = path.resolve(__dirname, '..', '..', '..', '..', 'assets', 'brands');
    const bytes = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
    expect(bytes).toBeLessThan(400 * 1024);
  });
});
