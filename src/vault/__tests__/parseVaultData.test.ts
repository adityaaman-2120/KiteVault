import { VaultError } from '../errors';
import { parseVaultData } from '../parseVaultData';
import { createEmptyVaultData, DATA_VERSION } from '../types';

const codeOf = (text: string): string => {
  try {
    parseVaultData(text);
  } catch (e) {
    return (e as VaultError).code;
  }
  return 'NO_ERROR';
};

const good = () => JSON.stringify(createEmptyVaultData());

describe('the decrypted vault JSON', () => {
  test('a well-formed vault is accepted and returned as it is', () => {
    const data = createEmptyVaultData();
    data.folders.push({ id: 'f', name: 'Work' });
    expect(parseVaultData(JSON.stringify(data))).toEqual(data);
  });

  test.each([
    ['not JSON', 'hello'],
    ['empty text', ''],
    ['truncated JSON', '{"version":1,"entries":['],
    ['JSON null', 'null'],
    ['a number', '5'],
    ['a string', '"x"'],
    ['an array', '[]'],
    ['no version', '{"entries":[],"folders":[],"settings":{}}'],
    ['a version that is text', '{"version":"1","entries":[],"folders":[],"settings":{}}'],
    ['entries that are not a list', '{"version":1,"entries":{},"folders":[],"settings":{}}'],
    ['no folders', '{"version":1,"entries":[],"settings":{}}'],
    ['folders that are not a list', '{"version":1,"entries":[],"folders":"x","settings":{}}'],
    ['no settings', '{"version":1,"entries":[],"folders":[]}'],
    ['settings that are null', '{"version":1,"entries":[],"folders":[],"settings":null}'],
    ['settings that are text', '{"version":1,"entries":[],"folders":[],"settings":"x"}'],
  ])('is refused as damaged: %s', (_name, text) => {
    expect(codeOf(text)).toBe('CORRUPTED');
  });

  test('a different data version is refused, not guessed at', () => {
    expect(codeOf(`{"version":${DATA_VERSION + 1},"entries":[],"folders":[],"settings":{}}`)).toBe(
      'UNSUPPORTED_VERSION',
    );
    expect(codeOf('{"version":0,"entries":[],"folders":[],"settings":{}}')).toBe(
      'UNSUPPORTED_VERSION',
    );
  });

  test('extra fields from a newer app are kept, not rejected', () => {
    const text = JSON.stringify({ ...createEmptyVaultData(), futureThing: { a: 1 } });
    expect(parseVaultData(text)).toMatchObject({ futureThing: { a: 1 } });
  });

  test('the error message never contains the data', () => {
    const secret = 'my-secret-marker-xyz';
    try {
      parseVaultData(`{"version":1,"entries":"${secret}","folders":[],"settings":{}}`);
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
    expect(good()).toContain('"entries"');
  });
});
