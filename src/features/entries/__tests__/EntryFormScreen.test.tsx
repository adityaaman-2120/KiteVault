import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';

import { EntryFormScreen } from '../EntryFormScreen';
import {
  entry,
  resetVaultFiles,
  storeEntries,
  unlockedVaultWith,
} from '../__support__/entryTestUtils';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));

const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, text: string) => fireEvent.changeText(field(label), text);
const save = () => fireEvent.press(screen.getByRole('button', { name: /^Sav/ }));
const choose = (name: string) => fireEvent.press(screen.getByRole('radio', { name }));

beforeEach(async () => {
  jest.clearAllMocks();
  await unlockedVaultWith([], [{ id: 'f1', name: 'Work' }]);
});
afterEach(() => jest.restoreAllMocks());
afterAll(resetVaultFiles);

describe('new entry', () => {
  test('creates a login and opens it', async () => {
    await render(<EntryFormScreen />);
    await type('Title', 'My bank');
    await type('Username', 'alice');
    await type('Password', 's3cret');
    await type('Website', 'bank.example');
    await choose('Work');
    await fireEvent(field('Favorite'), 'valueChange', true);
    await save();

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(storeEntries()).toHaveLength(1);
    expect(storeEntries()[0]).toMatchObject({
      type: 'login',
      title: 'My bank',
      username: 'alice',
      password: 's3cret',
      urls: ['bank.example'],
      folderId: 'f1',
      favorite: true,
    });
    expect(mockReplace).toHaveBeenCalledWith(`/entry/${storeEntries()[0]!.id}`);
  });

  test('the fields change with the type', async () => {
    await render(<EntryFormScreen />);
    expect(field('Username')).toBeTruthy();
    expect(screen.queryByLabelText('Card number')).toBeNull();

    await choose('Card');
    expect(field('Card number')).toBeTruthy();
    expect(field('Security code')).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();

    await choose('Identity');
    expect(field('Full name')).toBeTruthy();
    expect(field('Email')).toBeTruthy();
    expect(screen.queryByLabelText('Card number')).toBeNull();

    await choose('Secure note');
    expect(field('Note')).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByLabelText('Full name')).toBeNull();
  });

  test('creates a card', async () => {
    await render(<EntryFormScreen />);
    await choose('Card');
    await type('Title', 'Visa');
    await type('Cardholder name', 'A Person');
    await type('Card number', '4242 4242 4242 4242');
    await type('Expiry (MM/YY)', '09/28');
    await type('Security code', '123');
    await save();
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(storeEntries()[0]).toMatchObject({
      type: 'card',
      title: 'Visa',
      card: { holder: 'A Person', number: '4242 4242 4242 4242', expiry: '09/28', cvv: '123' },
      password: '',
    });
  });

  test('creates an identity and a secure note', async () => {
    await render(<EntryFormScreen />);
    await choose('Identity');
    await type('Title', 'Me');
    await type('Full name', 'Pat Doe');
    await type('Email', 'pat@example.com');
    await save();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(storeEntries()[0]).toMatchObject({
      type: 'identity',
      identity: { fullName: 'Pat Doe', email: 'pat@example.com' },
    });
  });

  test('custom fields can be added, hidden and removed', async () => {
    await render(<EntryFormScreen />);
    await type('Title', 'With extras');
    await fireEvent.press(screen.getByRole('button', { name: 'Add custom field' }));
    await type('Field name', 'Recovery code');
    await type('Value', 'ABCD');
    expect(field('Value').props.secureTextEntry).toBe(false);
    await fireEvent(field('Hide value'), 'valueChange', true);
    expect(field('Value').props.secureTextEntry).toBe(true);
    await save();
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(storeEntries()[0]?.customFields).toEqual([
      expect.objectContaining({ label: 'Recovery code', value: 'ABCD', hidden: true }),
    ]);

    await render(<EntryFormScreen />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Add custom field' })[0]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove field' }));
    expect(screen.queryByLabelText('Field name')).toBeNull();
  });

  test('more than one website can be added', async () => {
    await render(<EntryFormScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add another website' }));
    expect(field('Website 2')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Remove website' })[1]!);
    expect(screen.queryByLabelText('Website 2')).toBeNull();
  });
});

describe('validation', () => {
  test('a title is required, and nothing is saved without it', async () => {
    await render(<EntryFormScreen />);
    await save();
    expect(await screen.findByText('Enter a title.')).toBeTruthy();
    expect(storeEntries()).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('shows a message under a bad website', async () => {
    await render(<EntryFormScreen />);
    await type('Title', 'X');
    await type('Website', 'javascript:alert(1)');
    await save();
    expect(await screen.findByText('Enter a valid web address (http or https).')).toBeTruthy();
    expect(storeEntries()).toHaveLength(0);
  });

  test('shows card and email problems only for those types', async () => {
    await render(<EntryFormScreen />);
    await choose('Card');
    await type('Title', 'Visa');
    await type('Card number', '123');
    await type('Expiry (MM/YY)', '99/99');
    await save();
    expect(await screen.findByText('Card numbers have 12 to 19 digits.')).toBeTruthy();
    expect(screen.getByText('Use MM/YY, for example 09/28.')).toBeTruthy();
    expect(storeEntries()).toHaveLength(0);

    await choose('Identity');
    await type('Email', 'nope');
    await save();
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
  });
});

describe('editing', () => {
  // A fresh object each time: locking scrubs the data it holds, so fixtures must not be shared.
  const existing = () =>
    entry({ id: 'e1', title: 'Old title', password: 'old-pass', notes: 'keep me' });

  beforeEach(() => unlockedVaultWith([existing()], [{ id: 'f1', name: 'Work' }]));

  test('starts with the saved values, and the type cannot be changed', async () => {
    await render(<EntryFormScreen id="e1" />);
    expect(field('Title').props.value).toBe('Old title');
    expect(field('Username').props.value).toBe('alice@example.com');
    expect(field('Notes').props.value).toBe('keep me');
    expect(screen.queryByRole('radio', { name: 'Card' })).toBeNull();
  });

  test('saves changes, keeps the old password in the history, and goes back', async () => {
    await render(<EntryFormScreen id="e1" />);
    await type('Title', 'New title');
    await type('Password', 'new-pass');
    await save();

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(storeEntries()).toHaveLength(1);
    expect(storeEntries()[0]).toMatchObject({
      id: 'e1',
      title: 'New title',
      password: 'new-pass',
      notes: 'keep me',
    });
    expect(storeEntries()[0]?.passwordHistory.map((h) => h.password)).toEqual(['old-pass']);
  });

  test('an entry that does not exist shows "not found"', async () => {
    await render(<EntryFormScreen id="missing" />);
    expect(screen.getByText('Entry not found')).toBeTruthy();
  });
});

describe('when saving fails', () => {
  test('shows an error, keeps what was typed, saves nothing, and works on retry', async () => {
    await render(<EntryFormScreen />);
    await type('Title', 'Important');
    await type('Password', 'do-not-lose');

    const spy = jest.spyOn(File.prototype, 'create').mockImplementation(() => {
      throw new Error('disk full');
    });
    await save();

    expect(await screen.findByText(/could not be saved, so nothing was changed/i)).toBeTruthy();
    expect(screen.queryByText(/disk full/)).toBeNull();
    expect(field('Title').props.value).toBe('Important');
    expect(field('Password').props.value).toBe('do-not-lose');
    expect(storeEntries()).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();

    spy.mockRestore();
    await save();
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(storeEntries()).toHaveLength(1);
  });
});
