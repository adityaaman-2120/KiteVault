import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import { Alert, Linking, type AlertButton } from 'react-native';

import { copySecret } from '@/features/clipboard/clipboardService';

import { EntryDetailScreen } from '../EntryDetailScreen';
import {
  entry,
  resetVaultFiles,
  storeEntries,
  unlockedVaultWith,
} from '../__support__/entryTestUtils';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
}));
jest.mock('@/features/clipboard/clipboardService', () => ({ copySecret: jest.fn(async () => {}) }));

let alertSpy: jest.SpyInstance;
let openUrl: jest.SpyInstance;

const makeFull = () =>
  entry({
    id: 'e1',
    title: 'Example Site',
    username: 'alice@example.com',
    password: 'hunter2',
    urls: ['https://example.com', 'other.example'],
    notes: 'remember the pet name',
    customFields: [
      { id: 'c1', label: 'Recovery code', value: 'ABCD-1234', hidden: true },
      { id: 'c2', label: 'Branch', value: 'Main street', hidden: false },
    ],
    folderId: 'f1',
    favorite: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_100_000_000,
    passwordHistory: [{ password: 'older-pass', changedAt: 1_690_000_000_000 }],
  });

beforeEach(async () => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await unlockedVaultWith([makeFull()], [{ id: 'f1', name: 'Work' }]);
});
afterEach(() => jest.restoreAllMocks());
afterAll(resetVaultFiles);

test('shows the login details, with the password hidden until asked', async () => {
  await render(<EntryDetailScreen id="e1" />);
  expect(screen.getByText('Example Site')).toBeTruthy();
  expect(screen.getByText(/Work/)).toBeTruthy();
  expect(screen.getByText('alice@example.com')).toBeTruthy();
  expect(screen.queryByText('hunter2')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Show Password' }));
  expect(screen.getByText('hunter2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Hide Password' }));
  expect(screen.queryByText('hunter2')).toBeNull();
});

test('shows notes, custom fields, dates and password history', async () => {
  await render(<EntryDetailScreen id="e1" />);
  expect(screen.getByText('remember the pet name')).toBeTruthy();
  expect(screen.getByText('Main street')).toBeTruthy();
  expect(screen.queryByText('ABCD-1234')).toBeNull(); // hidden custom field
  await fireEvent.press(screen.getByRole('button', { name: 'Show Recovery code' }));
  expect(screen.getByText('ABCD-1234')).toBeTruthy();

  expect(screen.getByText('Created')).toBeTruthy();
  expect(screen.getByText('Updated')).toBeTruthy();
  expect(screen.getByText('Password history')).toBeTruthy();
  expect(screen.queryByText('older-pass')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /^Show Until/ }));
  expect(screen.getByText('older-pass')).toBeTruthy();
});

test('copy buttons copy the username, password and website', async () => {
  await render(<EntryDetailScreen id="e1" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Copy Username' }));
  expect(copySecret).toHaveBeenLastCalledWith('alice@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Copy Password' }));
  expect(copySecret).toHaveBeenLastCalledWith('hunter2');
  await fireEvent.press(screen.getAllByRole('button', { name: 'Copy Website' })[0]!);
  expect(copySecret).toHaveBeenLastCalledWith('https://example.com');
});

test('"Open" opens only valid web addresses', async () => {
  await render(<EntryDetailScreen id="e1" />);
  const open = screen.getAllByRole('button', { name: 'Open' });
  await fireEvent.press(open[0]!);
  expect(openUrl).toHaveBeenLastCalledWith('https://example.com/');
  await fireEvent.press(open[1]!);
  expect(openUrl).toHaveBeenLastCalledWith('https://other.example/');
});

test('a dangerous website value is never opened', async () => {
  await unlockedVaultWith([entry({ id: 'e1', urls: ['javascript:alert(1)'] })]);
  await render(<EntryDetailScreen id="e1" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
  expect(openUrl).not.toHaveBeenCalled();
  expect(alertSpy).toHaveBeenCalledWith('Cannot open', expect.any(String));
});

test('Edit goes to the edit screen', async () => {
  await render(<EntryDetailScreen id="e1" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  expect(mockPush).toHaveBeenCalledWith('/entry/edit/e1');
});

test('favorite can be toggled and is saved', async () => {
  await render(<EntryDetailScreen id="e1" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Remove from favorites' }));
  await waitFor(() => expect(storeEntries()[0]?.favorite).toBe(false));
});

describe('delete', () => {
  const pressDestructive = () => {
    const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
    buttons.find((b) => b.style === 'destructive')!.onPress!();
  };

  test('asks first, and cancelling changes nothing', async () => {
    await render(<EntryDetailScreen id="e1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(alertSpy).toHaveBeenCalledWith(
      'Move to Trash?',
      expect.stringContaining('30 days'),
      expect.any(Array),
    );
    expect(storeEntries()[0]?.deletedAt).toBeUndefined();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('confirming moves it to the trash and goes back', async () => {
    await render(<EntryDetailScreen id="e1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to Trash' }));
    pressDestructive();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(storeEntries()[0]?.deletedAt).toBeDefined();
  });

  test('a failed save shows an error and keeps the entry', async () => {
    await render(<EntryDetailScreen id="e1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to Trash' }));
    jest.spyOn(File.prototype, 'create').mockImplementation(() => {
      throw new Error('disk full');
    });
    pressDestructive();
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Could not save',
        expect.stringMatching(/nothing was changed/i),
      ),
    );
    expect(mockBack).not.toHaveBeenCalled();
    expect(storeEntries()[0]?.deletedAt).toBeUndefined();
  });
});

describe('other entry types', () => {
  test('a card shows its fields with the number, code and PIN hidden', async () => {
    await unlockedVaultWith([
      entry({
        id: 'e1',
        type: 'card',
        username: '',
        password: '',
        urls: [],
        card: {
          holder: 'A Person',
          number: '4242424242424242',
          expiry: '09/28',
          cvv: '123',
          pin: '9876',
        },
      }),
    ]);
    await render(<EntryDetailScreen id="e1" />);
    expect(screen.getByText('A Person')).toBeTruthy();
    expect(screen.getByText('09/28')).toBeTruthy();
    for (const secret of ['4242424242424242', '123', '9876'])
      expect(screen.queryByText(secret)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show Card number' }));
    expect(screen.getByText('4242424242424242')).toBeTruthy();
  });

  test('a secure note shows its text', async () => {
    await unlockedVaultWith([
      entry({
        id: 'e1',
        type: 'note',
        title: 'Wifi',
        username: '',
        password: '',
        urls: [],
        notes: 'router: 1234',
      }),
    ]);
    await render(<EntryDetailScreen id="e1" />);
    expect(screen.getByText('router: 1234')).toBeTruthy();
    expect(screen.queryByText('Password')).toBeNull();
  });

  test('an identity shows its fields', async () => {
    await unlockedVaultWith([
      entry({
        id: 'e1',
        type: 'identity',
        username: '',
        password: '',
        urls: [],
        identity: {
          fullName: 'Pat Doe',
          email: 'pat@example.com',
          phone: '555-0100',
          address: '1 Main St',
        },
      }),
    ]);
    await render(<EntryDetailScreen id="e1" />);
    for (const text of ['Pat Doe', 'pat@example.com', '555-0100', '1 Main St']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});

test('an entry that does not exist, or is in the trash, is "not found"', async () => {
  await render(<EntryDetailScreen id="nope" />);
  expect(screen.getByText('Entry not found')).toBeTruthy();

  await unlockedVaultWith([entry({ id: 'e1', deletedAt: 5 })]);
  await render(<EntryDetailScreen id="e1" />);
  expect(screen.getAllByText('Entry not found').length).toBeGreaterThan(0);
});
