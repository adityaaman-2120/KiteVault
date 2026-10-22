import { File, Paths } from 'expo-file-system';

import { deleteJsonFile, readJsonFile, writeJsonFile } from '../jsonFile';

const NAME = 'polish-test.json';
const exists = (name: string) => new File(Paths.document, name).exists;

beforeEach(() => deleteJsonFile(NAME));
afterEach(() => jest.restoreAllMocks());

test('writes and reads back, replacing the old content', async () => {
  await writeJsonFile(NAME, { a: 1 });
  await writeJsonFile(NAME, { a: 2 });
  expect(await readJsonFile(NAME)).toEqual({ a: 2 });
  expect(exists(`${NAME}.tmp`)).toBe(false);
  expect(exists(`${NAME}.bak`)).toBe(false);
});

test('a missing file reads as null', async () => {
  expect(await readJsonFile(NAME)).toBeNull();
});

test('a damaged file reads as null', async () => {
  const f = new File(Paths.document, NAME);
  f.create();
  f.write('{"a": ');
  expect(await readJsonFile(NAME)).toBeNull();
});

test('if the app was killed after the old file was moved away, the old content is used', async () => {
  await writeJsonFile(NAME, { a: 1 });
  // State after "main -> bak" and before "tmp -> main".
  new File(Paths.document, NAME).move(new File(Paths.document, `${NAME}.bak`));
  expect(await readJsonFile(NAME)).toEqual({ a: 1 });
});

test('a failed write leaves the old content readable', async () => {
  await writeJsonFile(NAME, { a: 1 });
  jest.spyOn(File.prototype, 'write').mockImplementation(() => {
    throw new Error('ENOSPC');
  });
  await expect(writeJsonFile(NAME, { a: 2 })).rejects.toThrow();
  jest.restoreAllMocks();
  expect(await readJsonFile(NAME)).toEqual({ a: 1 });
});

test('delete removes the file and its leftovers', async () => {
  await writeJsonFile(NAME, { a: 1 });
  deleteJsonFile(NAME);
  expect(exists(NAME)).toBe(false);
  expect(await readJsonFile(NAME)).toBeNull();
});
