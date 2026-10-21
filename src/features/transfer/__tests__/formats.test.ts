import fs from 'fs';
import path from 'path';

import { createEmptyVaultData, type VaultData } from '@/vault';
import { makeEntry } from '@/vault/__support__/testUtils';

import { entriesToCsv, exportableEntries } from '../csvExport';
import { applyImport, planImport } from '../importPlan';
import { parsePlainImport } from '../parsers';
import { ImportError } from '../types';

const sample = (name: string) => fs.readFileSync(path.join(__dirname, 'samples', name), 'utf8');
const NOW = 1_800_000_000_000;

describe('Chrome passwords CSV', () => {
  const parsed = parsePlainImport(sample('chrome.csv'), NOW);

  test('is detected and every usable row is read', () => {
    expect(parsed.format).toBe('chrome-csv');
    expect(parsed.entries.map((e) => e.title)).toEqual([
      'Example Site',
      'www.nameless.test', // no name: taken from the address
      'GitHub',
      'Old format row',
    ]);
    expect(parsed.skipped).toBe(0); // the fully empty line is not a row at all
  });

  test('keeps commas, quotes and line breaks exactly', () => {
    const [first, , github] = parsed.entries;
    expect(first).toMatchObject({
      type: 'login',
      username: 'alice@example.com',
      password: 'pa,ss "quoted" word',
      urls: ['https://example.com/login'],
      notes: 'first note',
    });
    expect(github!.password).toBe('line1\nline2-password');
    expect(github!.notes).toBe('multi\nline note');
  });

  test('timestamps are the time of the import', () => {
    expect(parsed.entries.every((e) => e.createdAt === NOW && e.updatedAt === NOW)).toBe(true);
  });

  test('also reads the older four-column export and a leading byte-order mark', () => {
    const old = '﻿name,url,username,password\r\nSite,https://s.test,u,p\r\n';
    const result = parsePlainImport(old, NOW);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      title: 'Site',
      username: 'u',
      password: 'p',
      notes: '',
    });
  });
});

describe('Bitwarden CSV', () => {
  const parsed = parsePlainImport(sample('bitwarden.csv'), NOW);

  test('is detected, and the empty row is counted as skipped', () => {
    expect(parsed.format).toBe('bitwarden-csv');
    expect(parsed.entries).toHaveLength(4);
    expect(parsed.skipped).toBe(1);
  });

  test('reads logins with several addresses, folder, favorite, fields and authenticator', () => {
    expect(parsed.entries[0]).toMatchObject({
      type: 'login',
      title: 'Intranet',
      folderName: 'Work',
      favorite: true,
      notes: 'Some notes',
      username: 'dave',
      password: 'dave-pass',
      urls: ['https://intranet.test', 'https://intranet2.test'],
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(parsed.entries[0]!.customFields.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: 'Employee id', value: '12345' },
      { label: 'Region', value: 'EU' },
    ]);
  });

  test('reads secure notes', () => {
    expect(parsed.entries[1]).toMatchObject({
      type: 'note',
      title: 'Wi-Fi code',
      notes: 'Router password is on the fridge',
    });
  });

  test('a login without a name is named after its address; a bare secret loses its spaces', () => {
    expect(parsed.entries[2]!.title).toBe('noname.test');
    expect(parsed.entries[3]!.totpSecret).toBe('JBSWY3DP');
  });
});

describe('Bitwarden JSON', () => {
  const parsed = parsePlainImport(sample('bitwarden.json'), NOW);
  const byTitle = (title: string) => parsed.entries.find((e) => e.title === title)!;

  test('is detected; items that are not objects are skipped', () => {
    expect(parsed.format).toBe('bitwarden-json');
    expect(parsed.entries).toHaveLength(5);
    expect(parsed.skipped).toBe(1);
  });

  test('login: folder by name, dates, fields (hidden ones marked) and authenticator', () => {
    const login = byTitle('Bank login');
    expect(login).toMatchObject({
      type: 'login',
      folderName: 'Banking',
      favorite: true,
      username: 'gina',
      password: 'gina-pass',
      urls: ['https://bank.test', 'https://bank2.test'],
      totpSecret: 'KRSXG5CTMVRXEZLU',
      createdAt: Date.parse('2024-01-02T03:04:05.000Z'),
      updatedAt: Date.parse('2024-02-03T04:05:06.000Z'),
    });
    expect(login.customFields.map(({ label, hidden }) => ({ label, hidden }))).toEqual([
      { label: 'Customer no', hidden: false },
      { label: 'Security answer', hidden: true },
    ]);
  });

  test('note, card and identity', () => {
    expect(byTitle('Safe combination')).toMatchObject({ type: 'note', notes: '12-34-56' });
    expect(byTitle('Visa').card).toEqual({
      holder: 'Gina Example',
      number: '4111111111111111',
      expiry: '07/30',
      cvv: '123',
      pin: '',
    });
    expect(byTitle('Passport').identity).toEqual({
      fullName: 'Ms Gina Example',
      email: 'gina@example.com',
      phone: '555-0100',
      address: '1 Main St, Town, US',
    });
  });

  test('items Bitwarden had deleted arrive in the Trash, not as live entries', () => {
    expect(byTitle('Deleted login').deletedAt).toBe(Date.parse('2024-03-01T00:00:00.000Z'));
  });
});

describe('files that cannot be imported', () => {
  const code = (text: string) => {
    try {
      parsePlainImport(text, NOW);
    } catch (e) {
      return (e as ImportError).code;
    }
    return 'no error';
  };

  test('a password-protected Bitwarden export', () => {
    expect(code(sample('bitwarden-encrypted.json'))).toBe('encrypted-bitwarden');
  });
  test('text that is not any known format', () => {
    expect(code('hello world')).toBe('unknown-format');
    expect(code('a,b,c\n1,2,3\n')).toBe('unknown-format');
    expect(code('{"hello": 1}')).toBe('unknown-format');
    expect(code('{ broken json')).toBe('unknown-format');
  });
  test('a known format with nothing in it', () => {
    expect(code('name,url,username,password\n')).toBe('empty');
    expect(code('{"items": []}')).toBe('empty');
  });
});

describe('CSV export', () => {
  const data: VaultData = {
    ...createEmptyVaultData(),
    folders: [{ id: 'f1', name: 'Work' }],
    entries: [
      makeEntry({
        id: 'a',
        title: 'Site, "quoted"',
        password: 'p,w"\nx',
        folderId: 'f1',
        favorite: true,
        urls: ['https://a.test', 'https://b.test'],
      }),
      makeEntry({
        id: 'b',
        type: 'note',
        title: 'A note',
        notes: 'secret text',
        username: '',
        password: '',
      }),
      makeEntry({
        id: 'c',
        type: 'card',
        title: 'Visa',
        card: { holder: 'H', number: '4111', expiry: '01/30', cvv: '999', pin: '1' },
      }),
      makeEntry({ id: 'd', title: 'Trashed', deletedAt: NOW }),
    ],
  };

  test('leaves out the Trash and nothing else', () => {
    expect(exportableEntries(data).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('has the Bitwarden header', () => {
    expect(entriesToCsv(data).split('\r\n')[0]).toBe(
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
    );
  });

  test('round-trips through the importer without losing anything', () => {
    const parsed = parsePlainImport(entriesToCsv(data), NOW);
    expect(parsed.format).toBe('bitwarden-csv');
    expect(parsed.entries).toHaveLength(3);
    const [login, note, card] = parsed.entries;
    expect(login).toMatchObject({
      title: 'Site, "quoted"',
      password: 'p,w"\nx',
      folderName: 'Work',
      favorite: true,
      urls: ['https://a.test', 'https://b.test'],
      totpSecret: 'JBSWY3DPEHPK3PXP',
      username: 'alice@example.com',
    });
    expect(login!.customFields).toEqual([expect.objectContaining({ label: 'PIN', value: '1234' })]);
    expect(note).toMatchObject({ type: 'note', notes: 'secret text' });
    // Cards become notes that keep every detail
    expect(card!.type).toBe('note');
    for (const text of ['4111', '01/30', '999', 'H']) expect(card!.notes).toContain(text);
  });
});

describe('duplicates and applying an import', () => {
  const existing: VaultData = {
    ...createEmptyVaultData(),
    folders: [{ id: 'f1', name: 'work' }],
    entries: [
      makeEntry({
        id: 'e1',
        title: 'Example Site',
        username: 'Alice@Example.com',
        urls: ['https://www.example.com/login/'],
        password: 'pa,ss "quoted" word',
      }),
    ],
  };
  const incoming = parsePlainImport(sample('chrome.csv'), NOW).entries;

  test('same name, user, address and password is a duplicate (case, www and slashes ignored)', () => {
    const chromeLike = {
      ...incoming[0]!,
      urls: ['http://example.com/login'],
      username: 'alice@example.com',
    };
    const plan = planImport(existing, [chromeLike]);
    expect(plan.duplicates).toBe(1);
  });

  test('another password is NOT a duplicate, so a changed password is never hidden', () => {
    const plan = planImport(existing, [{ ...incoming[0]!, password: 'different' }]);
    expect(plan.duplicates).toBe(0);
  });

  test('entries in the Trash do not count as existing', () => {
    const trashed = { ...existing, entries: [{ ...existing.entries[0]!, deletedAt: NOW }] };
    expect(
      planImport(trashed, [{ ...incoming[0]!, username: 'alice@example.com' }]).duplicates,
    ).toBe(0);
  });

  test('a repeated entry inside the file counts as a duplicate of its first copy', () => {
    const plan = planImport(createEmptyVaultData(), [incoming[1]!, incoming[1]!]);
    expect(plan.items.map((i) => i.duplicate)).toEqual([false, true]);
    expect(plan).toMatchObject({ duplicates: 1, fresh: 1 });
  });

  test('skipping duplicates leaves them out; not skipping adds them', () => {
    const dup = {
      ...incoming[0]!,
      urls: ['https://example.com/login'],
      username: 'alice@example.com',
    };
    const plan = planImport(existing, [dup, incoming[1]!]);
    const skipped = applyImport(existing, plan, { skipDuplicates: true });
    expect(skipped).toMatchObject({ imported: 1, skipped: 1 });
    expect(skipped.data.entries).toHaveLength(2);
    const all = applyImport(existing, plan, { skipDuplicates: false });
    expect(all).toMatchObject({ imported: 2, skipped: 0 });
    expect(all.data.entries).toHaveLength(3);
  });

  test('imported entries get new unique ids and existing ones are untouched', () => {
    const plan = planImport(existing, incoming);
    const { data } = applyImport(existing, plan, { skipDuplicates: true });
    expect(data.entries[0]).toBe(existing.entries[0]);
    const ids = data.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(existing.entries).toHaveLength(1); // the original vault object is not modified
  });

  test('folders are matched by name ignoring case, or created', () => {
    const parsed = parsePlainImport(sample('bitwarden.csv'), NOW);
    const { data } = applyImport(existing, planImport(existing, parsed.entries), {
      skipDuplicates: true,
    });
    expect(data.folders.map((f) => f.name).sort()).toEqual(['Personal', 'work']);
    const intranet = data.entries.find((e) => e.title === 'Intranet')!;
    expect(intranet.folderId).toBe('f1'); // "Work" matched the existing "work"
    const noname = data.entries.find((e) => e.title === 'noname.test')!;
    expect(data.folders.find((f) => f.id === noname.folderId)!.name).toBe('Personal');
    expect(data.entries.every((e) => !('folderName' in e))).toBe(true);
  });
});
