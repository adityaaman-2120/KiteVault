import { fireEvent, render, screen } from '@testing-library/react-native';

import { createEmptyVaultData } from '@/vault';

import { VaultListScreen } from '../VaultListScreen';
import { withSeedEntries } from '../seed';
import { entry, showInStore } from '../__support__/entryTestUtils';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
// Opening the list also purges old trash; here there is no vault session, so do nothing.
jest.mock('../entryActions', () => ({
  ...jest.requireActual('../entryActions'),
  purgeExpired: jest.fn(async () => {}),
}));

const search = () => screen.getByLabelText('Search');
const rowNames = () =>
  screen
    .queryAllByRole('button')
    .map((b) => b.props.accessibilityLabel as string)
    .filter((l) => /,/.test(l ?? ''));

const folders = [{ id: 'work', name: 'Work' }];
const sample = [
  entry({
    id: '1',
    title: 'GitHub',
    username: 'octocat',
    urls: ['https://github.com'],
    folderId: 'work',
  }),
  entry({ id: '2', title: 'Bank', username: 'alice@bank.example', favorite: true }),
  entry({ id: '3', title: 'Wifi note', type: 'note', username: '', urls: [] }),
  entry({ id: '4', title: 'Old thing', deletedAt: 1 }), // in the trash: never listed
];

beforeEach(() => {
  jest.clearAllMocks();
  showInStore(sample, folders);
});

test('lists entries with a letter avatar, favorites first, and hides the trash', async () => {
  await render(<VaultListScreen />);
  expect(rowNames()[0]).toMatch(/^Bank,/);
  expect(screen.getByText('GitHub')).toBeTruthy();
  // The letter avatar is hidden from screen readers, so look for hidden elements too.
  expect(screen.getByText('B', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText('W', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByText('Old thing')).toBeNull();
  expect(screen.getByRole('button', { name: 'Trash (1)' })).toBeTruthy();
});

test('searches by title, username and website', async () => {
  await render(<VaultListScreen />);
  await fireEvent.changeText(search(), 'octo');
  expect(rowNames()).toHaveLength(1);
  expect(screen.getByText('GitHub')).toBeTruthy();

  await fireEvent.changeText(search(), 'bank.example');
  expect(screen.getByText('Bank')).toBeTruthy();
  expect(screen.queryByText('GitHub')).toBeNull();
});

test('shows a "no matches" state with a way back', async () => {
  await render(<VaultListScreen />);
  await fireEvent.changeText(search(), 'zzzz');
  expect(screen.getByText('No matches')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(rowNames()).toHaveLength(3);
  expect(search().props.value).toBe('');
});

test('filter chips: favorites, type and folder', async () => {
  await render(<VaultListScreen />);

  await fireEvent.press(screen.getByRole('button', { name: '★ Favorites' }));
  expect(rowNames()).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: '★ Favorites' }));

  await fireEvent.press(screen.getByRole('button', { name: 'Secure note' }));
  expect(screen.getByText('Wifi note')).toBeTruthy();
  expect(rowNames()).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'All' }));
  expect(rowNames()).toHaveLength(3);

  await fireEvent.press(screen.getByRole('button', { name: 'Work' }));
  expect(rowNames()).toHaveLength(1);
  expect(screen.getByText('GitHub')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'No folder' }));
  expect(rowNames()).toHaveLength(2);
});

test('the folder row only appears when there are folders', async () => {
  showInStore(sample, []);
  await render(<VaultListScreen />);
  expect(screen.queryByRole('button', { name: 'All folders' })).toBeNull();
});

test('Folders and Trash are always there, even with no folders, and stay while filtering', async () => {
  showInStore(sample, []);
  await render(<VaultListScreen />);
  // No folder chips at all, but the way to make the first folder is still on screen.
  expect(screen.queryByRole('button', { name: 'All folders' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Folders' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Trash/ })).toBeTruthy();

  // They do not move or disappear when the list is filtered.
  await fireEvent.changeText(search(), 'octo');
  expect(screen.getByRole('button', { name: 'Folders' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Trash/ })).toBeTruthy();
});

test('with folders, the folder chips and the two buttons are all on screen together', async () => {
  await render(<VaultListScreen />);
  expect(screen.getByRole('button', { name: 'All folders' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Work' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Folders' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Trash (1)' })).toBeTruthy();
});

test('opening a row goes to the entry; the buttons go to add / folders / trash', async () => {
  await render(<VaultListScreen />);
  await fireEvent.press(screen.getByRole('button', { name: /^GitHub,/ }));
  expect(mockPush).toHaveBeenLastCalledWith('/entry/1');
  await fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
  await fireEvent.press(screen.getByRole('button', { name: 'New secure note' }));
  expect(mockPush).toHaveBeenLastCalledWith('/entry/new?type=note');
  await fireEvent.press(screen.getByRole('button', { name: 'Folders' }));
  expect(mockPush).toHaveBeenLastCalledWith('/folders');
  await fireEvent.press(screen.getByRole('button', { name: 'Trash (1)' }));
  expect(mockPush).toHaveBeenLastCalledWith('/trash');
});

test('an empty vault shows the empty state', async () => {
  showInStore([]);
  await render(<VaultListScreen />);
  expect(screen.getByText('No entries yet')).toBeTruthy();
});

test('a vault with only trashed entries also shows the empty state', async () => {
  showInStore([entry({ id: 'x', deletedAt: 5 })]);
  await render(<VaultListScreen />);
  expect(screen.getByText('No entries yet')).toBeTruthy();
});

describe('with 2,000 entries', () => {
  beforeEach(() => {
    showInStore(withSeedEntries(createEmptyVaultData(), 2000, 1_700_000_000_000).entries, []);
  });

  test('only a small window of rows is drawn', async () => {
    await render(<VaultListScreen />);
    const drawn = rowNames().length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(60);
  });

  test('searching narrows the list quickly', async () => {
    await render(<VaultListScreen />);
    const start = performance.now();
    await fireEvent.changeText(search(), 'site0001');
    const elapsed = performance.now() - start;
    expect(screen.getByText('Seed Site 0001')).toBeTruthy();
    expect(rowNames()).toHaveLength(1);
    expect(elapsed).toBeLessThan(1500); // loose: includes test-renderer overhead
  });

  test('the dev buttons are available in development builds', async () => {
    await render(<VaultListScreen />);
    expect(screen.getByRole('button', { name: 'Seed 2,000 (dev)' })).toBeTruthy();
  });
});
