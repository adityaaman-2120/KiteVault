import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useVaultStore, VaultError } from '@/vault';

import { CreateVaultForm } from '../CreateVaultForm';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));

const STRONG = 'vivid-lantern-oxide-mango-3flute';
const create = jest.fn();
const initialize = jest.fn();

const field = (label: string) => screen.getByLabelText(label);
const submitButton = () => screen.getByRole('button', { name: /create vault|creating vault/i });

async function fill(password = STRONG, confirm = password, acknowledge = true) {
  await fireEvent.changeText(field('Master password'), password);
  await fireEvent.changeText(field('Confirm master password'), confirm);
  if (acknowledge) await fireEvent.press(screen.getByRole('checkbox'));
}

beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue(undefined);
  initialize.mockResolvedValue(undefined);
  useVaultStore.setState({ create, initialize });
});

describe('CreateVaultForm validation', () => {
  test('the button starts disabled and the warning checkbox is shown', async () => {
    await render(<CreateVaultForm />);
    expect(submitButton()).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(
      screen.getByText(
        'I understand that if I forget my master password, nobody can recover my data, not even Kitelux.',
      ),
    ).toBeTruthy();
  });

  test('shows the length rule and strength while typing a short password', async () => {
    await render(<CreateVaultForm />);
    await fireEvent.changeText(field('Master password'), 'short');
    expect(screen.getByText(/at least 12 characters\. \(5\/12\)/i)).toBeTruthy();
    expect(screen.getByLabelText(/Password strength: (Very weak|Weak)/)).toBeTruthy();
  });

  test('shows a strong rating for a strong password', async () => {
    await render(<CreateVaultForm />);
    await fireEvent.changeText(field('Master password'), STRONG);
    expect(screen.getByLabelText(/Password strength: (Good|Strong)/)).toBeTruthy();
    expect(screen.queryByText(/\(\d+\/12\)/)).toBeNull();
  });

  test('shows a mismatch message and stays disabled', async () => {
    await render(<CreateVaultForm />);
    await fill(STRONG, STRONG + 'x');
    expect(screen.getByText('The passwords do not match.')).toBeTruthy();
    expect(submitButton()).toBeDisabled();
  });

  test('stays disabled until the warning is acknowledged', async () => {
    await render(<CreateVaultForm />);
    await fill(STRONG, STRONG, false);
    expect(submitButton()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(submitButton()).toBeEnabled();
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(submitButton()).toBeDisabled();
  });

  test('a too-short password cannot be submitted even when everything else is valid', async () => {
    await render(<CreateVaultForm />);
    await fill('short', 'short');
    expect(submitButton()).toBeDisabled();
    await fireEvent.press(submitButton());
    expect(create).not.toHaveBeenCalled();
  });

  test('the password is hidden until Show is pressed', async () => {
    await render(<CreateVaultForm />);
    expect(field('Master password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getAllByLabelText(/^Show/)[0]!);
    expect(field('Master password').props.secureTextEntry).toBe(false);
  });
});

describe('CreateVaultForm submit', () => {
  test('creates the vault, shows a loading state, then opens the vault screen', async () => {
    let finish!: () => void;
    create.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await render(<CreateVaultForm />);
    await fill();

    // Not awaited: the handler stays pending until finish() is called.
    void fireEvent.press(submitButton());
    expect(await screen.findByText('Creating vault…')).toBeTruthy();
    expect(create).toHaveBeenCalledWith(STRONG);
    expect(submitButton()).toBeDisabled();
    expect(field('Master password').props.editable).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
  });

  test('ignores a second press while creating', async () => {
    create.mockReturnValue(new Promise(() => {}));
    await render(<CreateVaultForm />);
    await fill();
    void fireEvent.press(submitButton());
    await screen.findByText('Creating vault…');
    await fireEvent.press(submitButton());
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('shows a clean error on failure, never exposes the password, and allows a retry', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    create.mockRejectedValueOnce(new Error(`disk failure while handling ${STRONG}`));
    await render(<CreateVaultForm />);
    await fill();
    await fireEvent.press(submitButton());

    expect(await screen.findByText(/could not be created, and nothing was saved/i)).toBeTruthy();
    expect(screen.queryByText(new RegExp(STRONG))).toBeNull();
    expect(submitButton()).toBeEnabled();
    expect(mockReplace).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();

    await fireEvent.press(submitButton());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
    spies.forEach((spy) => spy.mockRestore());
  });

  test('explains when a vault already exists and refreshes the app state', async () => {
    create.mockRejectedValueOnce(new VaultError('VAULT_EXISTS', 'A vault already exists.'));
    await render(<CreateVaultForm />);
    await fill();
    await fireEvent.press(submitButton());
    expect(await screen.findByText('A vault already exists on this device.')).toBeTruthy();
    expect(initialize).toHaveBeenCalled();
  });
});
