import { File, Paths } from 'expo-file-system';

import {
  deleteVaultFile,
  isOutOfSpace,
  loadVaultFile,
  saveVaultFile,
  StorageError,
  vaultFilesExist,
} from '..';

const bytesOf = (...values: number[]) => Uint8Array.from(values);
const exists = (name: string) => new File(Paths.document, name).exists;

beforeEach(() => deleteVaultFile());
afterEach(() => jest.restoreAllMocks());

describe('saving the vault file when something goes wrong', () => {
  test('a full phone is reported as "no space" and the old vault stays', async () => {
    await saveVaultFile(bytesOf(1, 2, 3));
    jest.spyOn(File.prototype, 'write').mockImplementation(() => {
      throw new Error('java.io.IOException: write failed: ENOSPC (No space left on device)');
    });

    const failure = await saveVaultFile(bytesOf(9, 9, 9)).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(StorageError);
    expect(isOutOfSpace(failure)).toBe(true);
    jest.restoreAllMocks();
    expect(Array.from((await loadVaultFile())!)).toEqual([1, 2, 3]);
    expect(exists('vault.kvlt.tmp')).toBe(false); // no half-written leftover
  });

  test('any other write error is a plain failure, not "no space"', async () => {
    await saveVaultFile(bytesOf(1, 2, 3));
    jest.spyOn(File.prototype, 'write').mockImplementation(() => {
      throw new Error('something else');
    });

    const failure = await saveVaultFile(bytesOf(4)).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(StorageError);
    expect(isOutOfSpace(failure)).toBe(false);
    jest.restoreAllMocks();
    expect(Array.from((await loadVaultFile())!)).toEqual([1, 2, 3]);
  });

  test('if the swap stops half way, the old vault is put back', async () => {
    await saveVaultFile(bytesOf(1, 2, 3));
    const realMove = File.prototype.move;
    let calls = 0;
    jest.spyOn(File.prototype, 'move').mockImplementation(function (this: File, ...args) {
      // First move (main -> bak) works; the second (tmp -> main) fails.
      if (++calls === 2) throw new Error('rename failed');
      return realMove.apply(this, args as Parameters<typeof realMove>);
    });

    await expect(saveVaultFile(bytesOf(7, 7, 7))).rejects.toBeInstanceOf(StorageError);

    jest.restoreAllMocks();
    expect(exists('vault.kvlt')).toBe(true);
    expect(Array.from((await loadVaultFile())!)).toEqual([1, 2, 3]);
  });

  test('a normal save leaves only the vault file behind', async () => {
    await saveVaultFile(bytesOf(5, 5));
    expect(exists('vault.kvlt')).toBe(true);
    expect(exists('vault.kvlt.tmp')).toBe(false);
    expect(exists('vault.kvlt.bak')).toBe(false);
    expect(vaultFilesExist()).toBe(true);
  });
});
