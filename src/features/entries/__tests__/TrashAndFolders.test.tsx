import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { useVaultStore } from '@/vault';

import { FoldersScreen } from '../FoldersScreen';
import { TrashScreen } from '../TrashScreen';
import {
  entry,
  resetVaultFiles,
  storeEntries,
  unlockedVaultWith,
} from '../__support__/entryTestUtils';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

let alertSpy: jest.SpyInstance;
const confirm = (name: string) => {
  const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
  buttons.find((b) => b.text === name)!.onPress!();
};

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(resetVaultFiles);

describe('TrashScreen', () => {
  const day = 24 * 60 * 60 * 1000;
  const entries = () => [
    entry({ id: 'live', title: 'Still here' }),
    entry({ id: 'recent', title: 'Deleted recently', deletedAt: Date.now() - 2 * day }),
    entry({ id: 'old', title: 'Deleted long ago', deletedAt: Date.now() - 31 * day }),
  ];

  test('lists trashed entries with days left, hides live and expired ones', async () => {
    await unlockedVaultWith(entries());
    await render(<TrashScreen />);
    expect(screen.getByText('Deleted recently')).toBeTruthy();
    expect(screen.getByText('28 days left')).toBeTruthy();
    expect(screen.queryByText('Still here')).toBeNull();
    expect(screen.queryByText('Deleted long ago')).toBeNull();
  });

  test('restores an entry', async () => {
    await unlockedVaultWith(entries());
    await render(<TrashScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(storeEntries().find((e) => e.id === 'recent')?.deletedAt).toBeUndefined(),
    );
    expect(await screen.findByText('Trash is empty')).toBeTruthy();
  });

  test('deleting forever asks first', async () => {
    await unlockedVaultWith(entries());
    await render(<TrashScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete forever' }));
    expect(alertSpy).toHaveBeenCalledWith('Delete forever?', expect.any(String), expect.any(Array));
    expect(storeEntries().some((e) => e.id === 'recent')).toBe(true);

    confirm('Delete forever');
    await waitFor(() => expect(storeEntries().some((e) => e.id === 'recent')).toBe(false));
  });

  test('empty trash asks first and keeps live entries', async () => {
    await unlockedVaultWith(entries());
    await render(<TrashScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Empty Trash' }));
    confirm('Empty Trash');
    await waitFor(() => expect(storeEntries().map((e) => e.id)).toEqual(['live']));
  });

  test('an empty trash shows the empty state', async () => {
    await unlockedVaultWith([entry({ id: 'live' })]);
    await render(<TrashScreen />);
    expect(screen.getByText('Trash is empty')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Empty Trash' })).toBeNull();
  });
});

describe('FoldersScreen', () => {
  test('adds a folder', async () => {
    await unlockedVaultWith();
    await render(<FoldersScreen />);
    expect(screen.getByText('No folders yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add folder' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('New folder'), 'Family');
    await fireEvent.press(screen.getByRole('button', { name: 'Add folder' }));
    expect(await screen.findByText('Family')).toBeTruthy();
    expect(useVaultStore.getState().data?.folders.map((f) => f.name)).toEqual(['Family']);
  });

  test('shows a message for a duplicate name', async () => {
    await unlockedVaultWith([], [{ id: 'x', name: 'Work' }]);
    await render(<FoldersScreen />);
    await fireEvent.changeText(screen.getByLabelText('New folder'), 'work');
    await fireEvent.press(screen.getByRole('button', { name: 'Add folder' }));
    expect(await screen.findByText('You already have a folder with that name.')).toBeTruthy();
  });

  test('renames a folder', async () => {
    await unlockedVaultWith([], [{ id: 'x', name: 'Work' }]);
    await render(<FoldersScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Rename' }));
    await fireEvent.changeText(screen.getByLabelText('Folder name'), 'Office');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Office')).toBeTruthy();
  });

  test('deleting asks first and keeps the entries', async () => {
    await unlockedVaultWith([entry({ id: 'a', folderId: 'x' })], [{ id: 'x', name: 'Work' }]);
    await render(<FoldersScreen />);
    expect(screen.getByText('1 entry')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete "Work"?',
      expect.stringContaining('stays in your vault'),
      expect.any(Array),
    );
    confirm('Delete folder');
    await waitFor(() => expect(useVaultStore.getState().data?.folders).toEqual([]));
    expect(storeEntries()).toHaveLength(1);
    expect(storeEntries()[0]?.folderId).toBeUndefined();
  });
});
