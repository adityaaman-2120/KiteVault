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
