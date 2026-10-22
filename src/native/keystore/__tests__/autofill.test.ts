// Tests the JavaScript side of the autofill native module wrapper. The Kotlin side is covered by
// the JUnit tests and by the manual checklist in docs/AUTOFILL_TESTING.md.
type Autofill = typeof import('../autofill');

function load(nativeModule: unknown): Autofill {
  let loaded!: Autofill;
  jest.isolateModules(() => {
    jest.doMock('../autofillModule', () => ({ nativeAutofill: nativeModule }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../autofill');
  });
  return loaded;
}

describe('without the native module (for example unit tests)', () => {
  const autofill = load(null);

  test('autofill is reported as unsupported and nothing throws', () => {
    expect(autofill.getAutofillStatus()).toEqual({ supported: false, enabled: false });
    expect(autofill.openAutofillSettings()).toBe(false);
  });
});

describe('with the native module', () => {
  test('passes the status through', () => {
    const autofill = load({ getStatus: () => ({ supported: true, enabled: true }) });
    expect(autofill.getAutofillStatus()).toEqual({ supported: true, enabled: true });
    const off = load({ getStatus: () => ({ supported: true, enabled: false }) });
    expect(off.getAutofillStatus()).toEqual({ supported: true, enabled: false });
  });

  test('anything that is not exactly true counts as false', () => {
    const autofill = load({ getStatus: () => ({ supported: 'yes', enabled: 1 }) });
    expect(autofill.getAutofillStatus()).toEqual({ supported: false, enabled: false });
  });

  test('a failing native call gives "unsupported" instead of an error', () => {
    const autofill = load({
      getStatus: () => {
        throw new Error('boom');
      },
      openAutofillSettings: () => {
        throw new Error('boom');
      },
    });
    expect(autofill.getAutofillStatus()).toEqual({ supported: false, enabled: false });
    expect(autofill.openAutofillSettings()).toBe(false);
  });

  test('opens the settings and reports whether the page opened', () => {
    const open = jest.fn(() => true);
    expect(load({ openAutofillSettings: open }).openAutofillSettings()).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(load({ openAutofillSettings: () => false }).openAutofillSettings()).toBe(false);
  });
});

describe('logins waiting to be saved', () => {
  const web = {
    id: 'a',
    createdAt: 5,
    kind: 'WEB',
    username: 'alice',
    password: 'pw',
    host: 'bank.com',
  };
  const app = {
    id: 'b',
    createdAt: 6,
    kind: 'APP',
    username: 'bob',
    password: 'pw2',
    packageName: 'com.example.app',
    label: 'Example',
    certSha256: 'AABB',
  };

  test('without the native module nothing is waiting and nothing throws', async () => {
    const autofill = load(null);
    expect(await autofill.getPendingSaves()).toEqual([]);
    expect(await autofill.getPendingSaveCount()).toBe(0);
    await expect(autofill.discardPendingSave('x')).resolves.toBeUndefined();
    await expect(autofill.clearPendingSaves()).resolves.toBeUndefined();
  });

  test('records from the native side become typed values', async () => {
    const autofill = load({ getPendingSaves: async () => [web, app] });
    expect(await autofill.getPendingSaves()).toEqual([
      {
        id: 'a',
        createdAt: 5,
        username: 'alice',
        password: 'pw',
        origin: { kind: 'web', host: 'bank.com' },
      },
      {
        id: 'b',
        createdAt: 6,
        username: 'bob',
        password: 'pw2',
        origin: {
          kind: 'app',
          packageName: 'com.example.app',
          label: 'Example',
          certSha256: 'AABB',
        },
      },
    ]);
  });

  test('records with the wrong shape are dropped, not trusted', async () => {
    const autofill = load({
      getPendingSaves: async () => [
        { ...web, id: '' },
        { ...web, password: '' },
        { ...web, host: null },
        { ...web, kind: 'OTHER' },
        { ...app, certSha256: null },
        { ...app, packageName: 5 },
        { ...web, username: 5 },
        null,
        'x',
        { ...app, label: null }, // the package name is used when there is no name
      ],
    });
    const list = await autofill.getPendingSaves();
    expect(list).toHaveLength(1);
    expect(list[0]!.origin).toMatchObject({ kind: 'app', label: 'com.example.app' });
  });

  test('a failing native call gives an empty answer', async () => {
    const boom = async () => {
      throw new Error('boom');
    };
    const autofill = load({
      getPendingSaves: boom,
      getPendingSaveCount: boom,
      discardPendingSave: boom,
      clearPendingSaves: boom,
    });
    expect(await autofill.getPendingSaves()).toEqual([]);
    expect(await autofill.getPendingSaveCount()).toBe(0);
    await expect(autofill.discardPendingSave('x')).resolves.toBeUndefined();
    await expect(autofill.clearPendingSaves()).resolves.toBeUndefined();
  });

  test('the count is a plain number, and delete passes the id on', async () => {
    const discard = jest.fn(async () => true);
    const clear = jest.fn(async () => {});
    const autofill = load({
      getPendingSaveCount: async () => 2,
      discardPendingSave: discard,
      clearPendingSaves: clear,
    });
    expect(await autofill.getPendingSaveCount()).toBe(2);
    await autofill.discardPendingSave('abc');
    expect(discard).toHaveBeenCalledWith('abc');
    await autofill.clearPendingSaves();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(await load({ getPendingSaveCount: async () => 'many' }).getPendingSaveCount()).toBe(0);
  });
});
