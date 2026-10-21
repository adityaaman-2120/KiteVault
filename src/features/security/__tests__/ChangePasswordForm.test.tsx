import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { clearAttemptState, loadAttemptState } from '@/features/lock/unlockService';
import {
  createVault,
  isVaultUnlocked,
  lockVault,
  unlockVault,
  useVaultStore,
  VaultError,
} from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { ChangePasswordForm, validateChangePassword } from '../ChangePasswordForm';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
}));

const OLD = 'correct horse battery staple';
const NEW = 'vivid-lantern-oxide-mango-3flute';

const field = (label: string) => screen.getByLabelText(label);
const submit = () => screen.getByRole('button', { name: /^Chang/ });
async function fill(current = OLD, next = NEW, confirm = next) {
  await fireEvent.changeText(field('Current master password'), current);
  await fireEvent.changeText(field('New master password'), next);
  await fireEvent.changeText(field('Confirm new master password'), confirm);
}

const changePassword = jest.fn();
const realChange = useVaultStore.getState().changePassword;

beforeEach(async () => {
  jest.clearAllMocks();
  resetVaultFiles();
  clearAttemptState();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  changePassword.mockResolvedValue(undefined);
  useVaultStore.setState({ changePassword });
});
afterEach(() => {
  useVaultStore.setState({ changePassword: realChange });
  jest.restoreAllMocks();
});
afterAll(() => {
  resetVaultFiles();
  clearAttemptState();
});

describe('validateChangePassword', () => {
  const ok = { current: OLD, next: NEW, confirm: NEW };

  test('accepts a good change', () => {
    expect(validateChangePassword(ok)).toEqual({ valid: true, errors: {} });
  });

  test('needs the current password', () => {
    expect(validateChangePassword({ ...ok, current: '' }).errors.current).toBeDefined();
  });

  test('new password needs 12 characters, and must differ from the current one', () => {
    expect(validateChangePassword({ ...ok, next: 'short', confirm: 'short' }).errors.next).toMatch(
      /at least 12/,
    );
    const same = validateChangePassword({ current: OLD, next: OLD, confirm: OLD });
    expect(same.valid).toBe(false);
    expect(same.errors.next).toMatch(/different/);
  });

  test('confirmation must match', () => {
    expect(validateChangePassword({ ...ok, confirm: NEW + 'x' }).errors.confirm).toMatch(
      /do not match/,
    );
  });

  test('messages never contain a password', () => {
    const { errors } = validateChangePassword({
      current: 'secret-one',
      next: 'secret-two',
      confirm: 'secret-three',
    });
    expect(JSON.stringify(errors)).not.toMatch(/secret-/);
  });
});

describe('the form', () => {
  test('starts disabled and explains the change', async () => {
    await render(<ChangePasswordForm />);
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/only the key that protects them is wrapped again/i)).toBeTruthy();
  });

  test('shows a live strength meter for the new password', async () => {
    await render(<ChangePasswordForm />);
    await fireEvent.changeText(field('New master password'), 'short');
    expect(screen.getByLabelText(/Password strength: (Very weak|Weak)/)).toBeTruthy();
    expect(screen.getByText('Use at least 12 characters.')).toBeTruthy();
    await fireEvent.changeText(field('New master password'), NEW);
    expect(screen.getByLabelText(/Password strength: (Good|Strong)/)).toBeTruthy();
  });

  test('shows a mismatch message and stays disabled', async () => {
    await render(<ChangePasswordForm />);
    await fill(OLD, NEW, NEW + 'x');
    expect(screen.getByText('The new passwords do not match.')).toBeTruthy();
    expect(submit()).toBeDisabled();
  });

  test('passwords are hidden until Show is pressed', async () => {
    await render(<ChangePasswordForm />);
    expect(field('Current master password').props.secureTextEntry).toBe(true);
    expect(field('New master password').props.secureTextEntry).toBe(true);
    expect(field('Confirm new master password').props.secureTextEntry).toBe(true);
  });

  test('changes the password, tells the user, and goes back', async () => {
    await render(<ChangePasswordForm />);
    await fill();
    await fireEvent.press(submit());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(changePassword).toHaveBeenCalledWith(OLD, NEW);
    expect(Alert.alert).toHaveBeenCalledWith('Master password changed', expect.any(String));
  });

  test('shows a loading state while working and ignores a second press', async () => {
    let finish!: () => void;
    changePassword.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await render(<ChangePasswordForm />);
    await fill();

    void fireEvent.press(submit());
    expect(await screen.findByText('Changing…')).toBeTruthy();
    expect(field('New master password').props.editable).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Changing…' }));
    expect(changePassword).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  test('a wrong current password shows a clear message and can be retried', async () => {
    changePassword.mockRejectedValueOnce(new VaultError('WRONG_PASSWORD', 'x'));
    await render(<ChangePasswordForm />);
    await fill('wrong current password');
    await fireEvent.press(submit());
    expect(await screen.findByText('The current password is wrong.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect((await loadAttemptState()).failedAttempts).toBe(1); // counts like a wrong unlock

    await fireEvent.changeText(field('Current master password'), OLD);
    await fireEvent.press(submit());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect((await loadAttemptState()).failedAttempts).toBe(0); // success clears the count
  });

  test('after 5 wrong tries it makes the user wait', async () => {
    changePassword.mockRejectedValue(new VaultError('WRONG_PASSWORD', 'x'));
    await render(<ChangePasswordForm />);
    await fill('wrong current password');
    for (let i = 0; i < 5; i++) {
      await fireEvent.press(submit());
      await screen.findByText('The current password is wrong.');
    }
    await fireEvent.press(submit());
    expect(
      await screen.findByText(/Too many wrong attempts\. Try again in 0:(30|29)/),
    ).toBeTruthy();
    expect(changePassword).toHaveBeenCalledTimes(5); // the sixth was refused before checking
  });

  test('an unexpected error shows a generic message with no details and no logging', async () => {
    const spies = (['log', 'warn', 'error'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    changePassword.mockRejectedValueOnce(new Error(`disk failure with ${NEW}`));
    await render(<ChangePasswordForm />);
    await fill();
    await fireEvent.press(submit());
    expect(await screen.findByText(/could not be changed, and nothing was changed/i)).toBeTruthy();
    expect(screen.queryByText(/disk failure/)).toBeNull();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('with a real vault', () => {
  test('the new password works afterwards and the old one does not', async () => {
    useVaultStore.setState({ changePassword: realChange });
    await createVault(OLD, { kdfParams: FAST_KDF });
    await render(<ChangePasswordForm />);
    await fill();
    await fireEvent.press(submit());
    await waitFor(() => expect(mockBack).toHaveBeenCalled(), { timeout: 15000 });

    lockVault();
    expect(isVaultUnlocked()).toBe(false);
    await expect(unlockVault(OLD)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(unlockVault(NEW)).resolves.toBeDefined();
  });
});
