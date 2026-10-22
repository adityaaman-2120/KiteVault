import { createEmptyVaultData, type VaultData } from '@/vault';
import { makeEntry } from '@/vault/__support__/testUtils';

import { describeTransferError } from '../errors';
import { ExportError } from '../exportFiles';
import { applyImport, duplicateKey, planImport } from '../importPlan';
import { classifyImport } from '../importFiles';
import { detectCsv, parsePlainImport } from '../parsers';
import { IMPORT_ERROR_TEXT, ImportError, type ImportedEntry, MAX_IMPORT_BYTES } from '../types';
import { LockoutError } from '@/features/lock/unlockService';
import { VaultError } from '@/vault';

const NOW = 1_800_000_000_000;
const code = (text: string) => {
  try {
    parsePlainImport(text, NOW);
  } catch (e) {
    return (e as ImportError).code;
  }
  return 'no error';
};
const bytes = (text: string) => new TextEncoder().encode(text);

describe('detecting the CSV format from its columns', () => {
  test('Bitwarden needs all three login columns; Chrome needs user name, password and name or url', () => {
    expect(detectCsv(['login_uri', 'login_username', 'login_password', 'name'])).toBe(
      'bitwarden-csv',
    );
    expect(detectCsv(['login_uri', 'login_username'])).toBeNull();
    expect(detectCsv(['name', 'username', 'password'])).toBe('chrome-csv');
    expect(detectCsv(['url', 'username', 'password'])).toBe('chrome-csv');
    expect(detectCsv(['username', 'password'])).toBeNull();
    expect(detectCsv(['name', 'url'])).toBeNull();
    expect(detectCsv([])).toBeNull();
  });
});

describe('odd Chrome files', () => {
  test('headers in any case, with spaces, are understood', () => {
    const r = parsePlainImport(' Name , URL ,UserName, PASSWORD \nSite,https://s.test,u,p\n', NOW);
    expect(r.entries[0]).toMatchObject({ title: 'Site', username: 'u', password: 'p' });
  });

  test('a row with only a password still imports, named "(no name)"', () => {
    const r = parsePlainImport('name,url,username,password\n,,,onlypass\n', NOW);
    expect(r.entries[0]).toMatchObject({ title: '(no name)', password: 'onlypass', urls: [] });
  });

  test('rows with nothing in them are dropped without being counted', () => {
    const r = parsePlainImport('name,url,username,password\nA,,u,p\n , , , \n,,,\n', NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });

  test('rows with too few or too many columns are still read', () => {
    const r = parsePlainImport(
      'name,url,username,password\nShort,https://a.test\nLong,https://b.test,u,p,extra,more\n',
      NOW,
    );
    expect(r.entries.map((e) => e.title)).toEqual(['Short', 'Long']);
    expect(r.entries[0]!.password).toBe('');
    expect(r.entries[1]!.password).toBe('p');
  });

  test('Windows line breaks, a byte-order mark and quoted line breaks all work', () => {
    const text =
      '﻿name,url,username,password,note\r\n"A ""quoted"" name",https://a.test,u,"p\r\nw","two\r\nlines"\r\n';
    const r = parsePlainImport(text, NOW);
    expect(r.entries[0]).toMatchObject({
      title: 'A "quoted" name',
      password: 'p\r\nw',
      notes: 'two\r\nlines',
    });
  });

  test('a very wide row of columns does not matter', () => {
    const header =
      'name,url,username,password,' + Array.from({ length: 200 }, (_, i) => `c${i}`).join(',');
    expect(parsePlainImport(`${header}\nA,https://a.test,u,p\n`, NOW).entries).toHaveLength(1);
  });
});

describe('odd Bitwarden files', () => {
  test('CSV: fields without a colon keep their text, favorite accepts 1 or true, titles come from addresses', () => {
    const csv =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
      ',true,login,,,"just text\nLabel: value",0,https://www.example.org/path,u,p,\n';
    const e = parsePlainImport(csv, NOW).entries[0]!;
    expect(e.favorite).toBe(true);
    expect(e.title).toBe('www.example.org');
    expect(e.customFields.map((f) => [f.label, f.value])).toEqual([
      ['Field', 'just text'],
      ['Label', 'value'],
    ]);
  });

  test('CSV: a login with no name and no address gets "(no name)"', () => {
    const csv =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,,,,0,,u,p,\n';
    expect(parsePlainImport(csv, NOW).entries[0]!.title).toBe('(no name)');
  });

  test('CSV: an invalid authenticator value is kept as typed rather than lost', () => {
    const csv =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,A,,,0,https://a.test,u,p,not a valid secret!\n';
    expect(parsePlainImport(csv, NOW).entries[0]!.totpSecret).toBe('notavalidsecret!');
  });

  test('CSV: an empty authenticator value leaves the field out', () => {
    const csv =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,A,,,0,https://a.test,u,p,  \n';
    expect(parsePlainImport(csv, NOW).entries[0]).not.toHaveProperty('totpSecret');
  });

  test('CSV: an authenticator link with unusual settings keeps them', () => {
    const csv =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,A,,,0,https://a.test,u,p,otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=8&period=60\n';
    expect(parsePlainImport(csv, NOW).entries[0]!.totpParams).toEqual({
      algorithm: 'SHA1',
      digits: 8,
      period: 60,
    });
  });

  test('JSON: things of the wrong shape are skipped, not fatal', () => {
    const json = JSON.stringify({
      folders: [null, { id: 5, name: 'x' }, { id: 'f', name: '  ' }, { id: 'ok', name: 'Real' }],
      items: [
        null,
        5,
        'x',
        {
          type: 1,
          name: 'A',
          folderId: 'ok',
          login: { uris: [null, { uri: '' }, { uri: 'https://a.test' }] },
          fields: [null, { name: 'n', value: 'v', type: 1 }],
        },
        { type: 99, name: 'Unknown type becomes a note' },
        { type: 3, name: 'Card without details' },
        { type: 3, name: 'Card', card: { number: '4111' } },
        { type: 4, name: 'Identity without details' },
        { type: 1, login: { uris: [{ uri: 'https://nameless.test' }] } },
        {
          type: 1,
          name: 'Dates',
          creationDate: 'garbage',
          revisionDate: 12,
          deletedDate: 'garbage',
          login: {},
        },
      ],
    });
    const r = parsePlainImport(json, NOW);
    expect(r.skipped).toBe(3);
    const by = (t: string) => r.entries.find((e) => e.title === t)!;
    expect(by('A')).toMatchObject({ folderName: 'Real', urls: ['https://a.test'] });
    expect(by('A').customFields[0]).toMatchObject({ label: 'n', hidden: true });
    expect(by('Unknown type becomes a note').type).toBe('note');
    expect(by('Card').card).toMatchObject({ number: '4111', expiry: '' });
    expect(by('Card without details').card).toBeUndefined();
    expect(by('Identity without details').identity).toBeUndefined();
    expect(by('nameless.test')).toBeDefined();
    expect(by('Dates')).toMatchObject({ createdAt: NOW, updatedAt: NOW });
    expect(by('Dates').deletedAt).toBe(NOW); // a deletion date that cannot be read counts as "deleted now"
  });

  test('JSON: expiry with only a year or only a month', () => {
    const json = JSON.stringify({
      items: [
        { type: 3, name: 'M', card: { expMonth: '3' } },
        { type: 3, name: 'Y', card: { expYear: '2031' } },
      ],
    });
    const r = parsePlainImport(json, NOW);
    expect(r.entries.find((e) => e.title === 'M')!.card!.expiry).toBe('03/');
    expect(r.entries.find((e) => e.title === 'Y')!.card!.expiry).toBe('/31');
  });
});

describe('files that are not importable', () => {
  test.each([
    ['{"items": "nope"}', 'unknown-format'],
    ['{"items": null}', 'unknown-format'],
    ['{"encrypted": true}', 'encrypted-bitwarden'],
    ['{"encrypted": true, "items": []}', 'encrypted-bitwarden'],
    ['[1,2,3]', 'unknown-format'],
    ['"just a string"', 'unknown-format'],
    ['a,b\n1,2\n', 'unknown-format'],
    ['username,password\nu,p\n', 'unknown-format'],
    ['', 'unknown-format'],
    ['name,url,username,password\n', 'empty'],
    ['name,url,username,password\n , , , \n', 'empty'],
    ['{"items": [null, 5]}', 'empty'],
  ])('%j is refused as %s', (text, expected) => {
    expect(code(text)).toBe(expected);
  });
});

describe('recognising a file from its bytes', () => {
  test('text that is not valid UTF-8 is refused', () => {
    expect(() => classifyImport(Uint8Array.from([0xff, 0xfe, 0xfd]))).toThrow(ImportError);
  });

  test('a file over the limit is refused before anything is read', () => {
    expect(() => classifyImport(new Uint8Array(MAX_IMPORT_BYTES + 1))).toThrow(
      expect.objectContaining({ code: 'too-large' }),
    );
  });

  test('plain text files are parsed as text', () => {
    const r = classifyImport(bytes('name,url,username,password\nA,https://a.test,u,p\n'), NOW);
    expect(r.kind).toBe('plain');
  });
});

describe('finding duplicates', () => {
  const entry = (over: Partial<ImportedEntry>): ImportedEntry => {
    const { id: _id, ...rest } = makeEntry();
    return { ...rest, ...over };
  };
  const vault = (...entries: ReturnType<typeof makeEntry>[]): VaultData => ({
    ...createEmptyVaultData(),
    entries,
  });

  test('the key ignores case, spaces, www, schemes and trailing slashes for logins', () => {
    const a = duplicateKey(
      entry({
        title: ' GitHub ',
        username: 'Octo',
        urls: ['https://www.github.com/'],
        password: 'p',
      }),
    );
    const b = duplicateKey(
      entry({ title: 'github', username: 'octo', urls: ['http://github.com'], password: 'p' }),
    );
    expect(a).toBe(b);
    expect(a).not.toBe(
      duplicateKey(
        entry({ title: 'github', username: 'octo', urls: ['http://github.com'], password: 'P' }),
      ),
    );
  });

  test('cards are compared by holder and number; identities by name and email; notes by text', () => {
    const card = (number: string, holder = 'A B') =>
      entry({
        type: 'card',
        title: 'Visa',
        card: { holder, number, expiry: '', cvv: '', pin: '' },
      });
    expect(duplicateKey(card('4111'))).toBe(duplicateKey(card('4111', 'a b')));
    expect(duplicateKey(card('4111'))).not.toBe(duplicateKey(card('4222')));
    const identity = (email: string) =>
      entry({
        type: 'identity',
        title: 'Me',
        identity: { fullName: 'Me', email, phone: '', address: '' },
      });
    expect(duplicateKey(identity('a@b.c'))).toBe(duplicateKey(identity('A@B.C')));
    expect(duplicateKey(identity('a@b.c'))).not.toBe(duplicateKey(identity('x@y.z')));
    const note = (notes: string) => entry({ type: 'note', title: 'N', notes });
    expect(duplicateKey(note(' same '))).toBe(duplicateKey(note('same')));
    expect(duplicateKey(note('a'))).not.toBe(duplicateKey(note('b')));
    // entries with missing card or identity details do not crash
    expect(() => duplicateKey(entry({ type: 'card', title: 'x' }))).not.toThrow();
    expect(() => duplicateKey(entry({ type: 'identity', title: 'x' }))).not.toThrow();
  });

  test('a different type with the same title is not a duplicate', () => {
    const existing = vault(makeEntry({ id: 'a', type: 'note', title: 'Same', notes: 'n' }));
    const plan = planImport(existing, [entry({ type: 'login', title: 'Same', password: 'p' })]);
    expect(plan.duplicates).toBe(0);
  });

  test('importing nothing changes nothing, and counts are right when everything is a duplicate', () => {
    const existing = vault(makeEntry({ id: 'a' }));
    expect(applyImport(existing, planImport(existing, []), { skipDuplicates: true })).toMatchObject(
      {
        imported: 0,
        skipped: 0,
      },
    );
    const same = entry({});
    const plan = planImport(existing, [same, same]);
    expect(plan).toMatchObject({ duplicates: 2, fresh: 0 });
    expect(applyImport(existing, plan, { skipDuplicates: true })).toMatchObject({
      imported: 0,
      skipped: 2,
    });
  });

  test('a folder name of only spaces creates no folder', () => {
    const existing = vault();
    const plan = planImport(existing, [entry({ title: 'x', folderName: '   ' })]);
    const { data } = applyImport(existing, plan, { skipDuplicates: false });
    expect(data.folders).toHaveLength(0);
    expect(data.entries[0]).not.toHaveProperty('folderId');
  });

  test('the same new folder name used twice makes one folder', () => {
    const existing = vault();
    const plan = planImport(existing, [
      entry({ title: 'a', folderName: 'New' }),
      entry({ title: 'b', folderName: 'new' }),
    ]);
    const { data } = applyImport(existing, plan, { skipDuplicates: false });
    expect(data.folders).toHaveLength(1);
    expect(data.entries[0]!.folderId).toBe(data.entries[1]!.folderId);
  });
});

describe('messages shown to the user', () => {
  test('each kind of error has its own plain-language text', () => {
    expect(describeTransferError(new ImportError('too-large'))).toBe(
      IMPORT_ERROR_TEXT['too-large'],
    );
    expect(describeTransferError(new ExportError('sharing-unavailable'))).toMatch(/not available/);
    expect(describeTransferError(new ExportError('no-vault'))).toMatch(/no vault/);
    expect(describeTransferError(new VaultError('WRONG_PASSWORD', 'x'))).toMatch(/wrong/);
    expect(describeTransferError(new VaultError('LOCKED', 'x'))).toMatch(/locked/);
    expect(describeTransferError(new VaultError('CORRUPTED', 'x'))).toMatch(/damaged/);
    expect(describeTransferError(new VaultError('UNSUPPORTED_VERSION', 'x'))).toMatch(
      /different version/,
    );
    expect(describeTransferError(new LockoutError(90_000))).toMatch(/Too many wrong attempts/);
    expect(describeTransferError(new Error('secret-details'))).not.toContain('secret-details');
    expect(describeTransferError('weird')).toMatch(/nothing was changed/);
  });
});
