import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  entry,
  storeEntries,
  unlockedVaultWith,
} from '@/features/entries/__support__/entryTestUtils';
import { discardPendingSave, getPendingSaves, type PendingSave } from '@/native/keystore/autofill';

import { PendingSaveScreen, SAVE_WARNING } from '../PendingSaveScreen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));
jest.mock('@/native/keystore/autofill', () => ({
  getPendingSaves: jest.fn(),
  discardPendingSave: jest.fn(async () => {}),
}));

const waiting = getPendingSaves as jest.Mock;
const discard = discardPendingSave as jest.Mock;

const web = (over: Partial<PendingSave> = {}): PendingSave => ({
  id: 'p1',
  createdAt: 1,
  username: 'alice',
  password: 'brand-new-secret',
  origin: { kind: 'web', host: 'bank.com' },
  ...over,
});
const app = (): PendingSave => ({
  id: 'p2',
  createdAt: 1,
  username: 'bob',
  password: 'app-secret',
  origin: {
    kind: 'app',
    packageName: 'com.example.app',
    label: 'Example App',
    certSha256: 'AA:BB',
  },
});

const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(async () => {
  jest.clearAllMocks();
  await unlockedVaultWith(
    [
      entry({
        id: 'e1',
        title: 'My bank',
        username: 'alice',
        password: 'old-secret',
        urls: ['https://bank.com'],
      }),
    ],
    [{ id: 'f1', name: 'Work' }],
  );
});
afterAll(() => unlockedVaultWith([]));

describe('what is shown', () => {
  test('says where it was typed, the user name, and hides the password until asked', async () => {
    waiting.mockResolvedValue([
      web({ username: 'zed', origin: { kind: 'web', host: 'new-site.com' } }),
    ]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByLabelText('Saved for new-site.com')).toBeTruthy();
    expect(screen.getByText(/User name: zed/)).toBeTruthy();
    expect(screen.queryByText(/brand-new-secret/)).toBeNull();
    await fireEvent.press(button('Show password'));
    expect(screen.getByText(/brand-new-secret/)).toBeTruthy();
    await fireEvent.press(button('Hide password'));
    expect(screen.queryByText(/brand-new-secret/)).toBeNull();
    expect(screen.getByText(SAVE_WARNING)).toBeTruthy();
    expect(screen.getByText('Check before you save')).toBeTruthy();
  });

  test('an app is shown with its name and its package name', async () => {
    waiting.mockResolvedValue([app()]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByLabelText('Saved for Example App (com.example.app)')).toBeTruthy();
  });

  test('nothing waiting: says so and offers Done', async () => {
    waiting.mockResolvedValue([]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByText('Nothing to save')).toBeTruthy();
    await fireEvent.press(button('Done'));
    expect(mockReplace).toHaveBeenCalledWith('/vault');
  });
});

describe('saving a new login', () => {
  test('edit the title and choose a folder, then save: the vault gets it and the waiting copy is deleted', async () => {
    waiting.mockResolvedValue([
      web({ origin: { kind: 'web', host: 'new-site.com' }, username: 'zed' }),
    ]);
    await render(<PendingSaveScreen />);
    const title = await screen.findByLabelText('Title');
    expect(title.props.value).toBe('new-site.com'); // suggested
    await fireEvent.changeText(title, 'My new site');
    await fireEvent.press(button('Work'));
    await fireEvent.press(button('Save to KiteVault'));

    await waitFor(() => expect(discard).toHaveBeenCalledWith('p1'));
    const saved = storeEntries().find((e) => e.title === 'My new site')!;
    expect(saved).toMatchObject({
      username: 'zed',
      password: 'brand-new-secret',
      urls: ['https://new-site.com'],
      folderId: 'f1',
    });
    expect(mockReplace).toHaveBeenCalledWith('/vault');
  });

  test('the save button is off while the title is empty', async () => {
    waiting.mockResolvedValue([web({ origin: { kind: 'web', host: 'new-site.com' } })]);
    await render(<PendingSaveScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Title'), '  ');
    expect(button('Save to KiteVault')).toBeDisabled();
  });

  test('an app login is saved with its app link', async () => {
    waiting.mockResolvedValue([app()]);
    await render(<PendingSaveScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save to KiteVault' }));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('p2'));
    const saved = storeEntries().find((e) => e.username === 'bob')!;
    expect(saved.appLinks).toEqual([{ packageName: 'com.example.app', certSha256: 'AABB' }]);
    expect(saved.urls).toEqual([]);
  });

  test('"Not now" saves nothing and deletes the waiting copy', async () => {
    waiting.mockResolvedValue([web({ origin: { kind: 'web', host: 'new-site.com' } })]);
    await render(<PendingSaveScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('p1'));
    expect(storeEntries()).toHaveLength(1);
  });

  test('a failed save keeps the waiting copy and shows the problem', async () => {
    waiting.mockResolvedValue([web({ origin: { kind: 'web', host: 'new-site.com' } })]);
    await render(<PendingSaveScreen />);
    await fireEvent.press(button('Work')); // a folder that then disappears
    await unlockedVaultWith([]); // the folder is gone
    await fireEvent.press(await screen.findByRole('button', { name: 'Save to KiteVault' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(discard).not.toHaveBeenCalled();
  });
});

describe('a login that already exists', () => {
  test('offers "Update password" first, and updates it keeping the old one in the history', async () => {
    waiting.mockResolvedValue([web()]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByText('You already have a login for this')).toBeTruthy();
    expect(
      screen.getByText(/"My bank" is saved with this user name but a different password/),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Title')).toBeNull(); // not creating a new one

    await fireEvent.press(button('Update password for "My bank"'));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('p1'));
    const e = storeEntries()[0]!;
    expect(storeEntries()).toHaveLength(1);
    expect(e.password).toBe('brand-new-secret');
    expect(e.passwordHistory.map((h) => h.password)).toEqual(['old-secret']);
  });

  test('the user can choose to save a separate new login instead', async () => {
    waiting.mockResolvedValue([web()]);
    await render(<PendingSaveScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save as new login' }));
    expect(screen.getByLabelText('Title')).toBeTruthy();
    await fireEvent.press(button('Save to KiteVault'));
    await waitFor(() => expect(discard).toHaveBeenCalled());
    expect(storeEntries()).toHaveLength(2);
    expect(storeEntries().find((x) => x.id === 'e1')!.password).toBe('old-secret');
  });

  test('the same password is "Already saved": nothing to change', async () => {
    waiting.mockResolvedValue([web({ password: 'old-secret' })]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByText('Already saved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Update password/ })).toBeNull();
    await fireEvent.press(button('Done'));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('p1'));
    expect(storeEntries()[0]!.passwordHistory).toEqual([]);
  });

  test('a login for another site or another user name is not offered for updating', async () => {
    waiting.mockResolvedValue([web({ username: 'someone-else' })]);
    await render(<PendingSaveScreen />);
    await screen.findByLabelText('Title');
    expect(screen.queryByText('You already have a login for this')).toBeNull();
  });

  test('a login in the Trash is not offered for updating', async () => {
    await unlockedVaultWith([
      entry({ id: 'e1', username: 'alice', urls: ['https://bank.com'], deletedAt: 5 }),
    ]);
    waiting.mockResolvedValue([web()]);
    await render(<PendingSaveScreen />);
    await screen.findByLabelText('Title');
    expect(screen.queryByText('You already have a login for this')).toBeNull();
  });
});

describe('a page with no user name (a change of password)', () => {
  const noUser = (over: Partial<PendingSave> = {}) => web({ username: '', ...over });

  test('one login for the site is offered for updating, and updating keeps the old password', async () => {
    waiting.mockResolvedValue([noUser()]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByText('You already have a login for this')).toBeTruthy();
    expect(screen.getByText(/That page showed no user name/)).toBeTruthy();
    expect(screen.queryByText('Which login did you change?')).toBeNull();

    await fireEvent.press(button('Update password for "My bank"'));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('p1'));
    const e = storeEntries()[0]!;
    expect(storeEntries()).toHaveLength(1);
    expect(e.username).toBe('alice'); // the account keeps its own user name
    expect(e.password).toBe('brand-new-secret');
    expect(e.passwordHistory.map((h) => h.password)).toEqual(['old-secret']);
  });

  test('with several logins for the site the person chooses which one changed', async () => {
    await unlockedVaultWith([
      entry({
        id: 'e1',
        title: 'Bank (alice)',
        username: 'alice',
        password: 'a-old',
        urls: ['https://bank.com'],
      }),
      entry({
        id: 'e2',
        title: 'Bank (bob)',
        username: 'bob',
        password: 'b-old',
        urls: ['https://bank.com'],
      }),
    ]);
    waiting.mockResolvedValue([noUser()]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByText('Which login did you change?')).toBeTruthy();
    // Nothing is assumed: no update button yet, and nothing was changed.
    expect(screen.queryByRole('button', { name: /^Update password/ })).toBeNull();
    expect(storeEntries().map((x) => x.password)).toEqual(['a-old', 'b-old']);

    await fireEvent.press(button('Bank (bob) (bob)'));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Update password for "Bank (bob)"' }),
    );
    await waitFor(() => expect(discard).toHaveBeenCalledWith('p1'));
    expect(storeEntries().find((x) => x.id === 'e2')!.password).toBe('brand-new-secret');
    expect(storeEntries().find((x) => x.id === 'e1')!.password).toBe('a-old'); // untouched
  });

  test('with several logins the person can still save it as a new login', async () => {
    await unlockedVaultWith([
      entry({ id: 'e1', username: 'alice', password: 'a-old', urls: ['https://bank.com'] }),
      entry({ id: 'e2', username: 'bob', password: 'b-old', urls: ['https://bank.com'] }),
    ]);
    waiting.mockResolvedValue([noUser()]);
    await render(<PendingSaveScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save as new login' }));
    await fireEvent.press(button('Save to KiteVault'));
    await waitFor(() => expect(discard).toHaveBeenCalled());
    expect(storeEntries()).toHaveLength(3);
    expect(storeEntries().find((x) => x.id === 'e1')!.password).toBe('a-old');
  });

  test('a login that already has this password is "Already saved", even among several', async () => {
    await unlockedVaultWith([
      entry({ id: 'e1', username: 'alice', password: 'a-old', urls: ['https://bank.com'] }),
      entry({
        id: 'e2',
        username: 'bob',
        password: 'brand-new-secret',
        urls: ['https://bank.com'],
      }),
    ]);
    waiting.mockResolvedValue([noUser()]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByText('Already saved')).toBeTruthy();
    expect(screen.queryByText('Which login did you change?')).toBeNull();
  });

  test('no login for the site: it is saved as a new login as before', async () => {
    waiting.mockResolvedValue([noUser({ origin: { kind: 'web', host: 'new-site.com' } })]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByLabelText('Title')).toBeTruthy();
    expect(screen.queryByText('You already have a login for this')).toBeNull();
    expect(screen.queryByText('Which login did you change?')).toBeNull();
  });

  test('a login in the Trash is not a candidate', async () => {
    await unlockedVaultWith([
      entry({ id: 'e1', username: 'alice', urls: ['https://bank.com'], deletedAt: 5 }),
    ]);
    waiting.mockResolvedValue([noUser()]);
    await render(<PendingSaveScreen />);
    await screen.findByLabelText('Title');
    expect(screen.queryByText('You already have a login for this')).toBeNull();
  });
});

describe('several waiting logins', () => {
  test('are handled one after the other', async () => {
    waiting.mockResolvedValue([
      web({ id: 'a', origin: { kind: 'web', host: 'one.com' }, username: 'u1' }),
      web({ id: 'b', origin: { kind: 'web', host: 'two.com' }, username: 'u2' }),
    ]);
    await render(<PendingSaveScreen />);
    expect(await screen.findByLabelText('Saved for one.com')).toBeTruthy();
    expect(screen.getByText('1 more waiting after this one.')).toBeTruthy();
    await fireEvent.press(button('Not now'));
    expect(await screen.findByLabelText('Saved for two.com')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    await fireEvent.press(button('Not now'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
  });
});
