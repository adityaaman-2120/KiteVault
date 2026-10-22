import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { fakeNative } from '@/features/biometric/__support__/fakeNativeKeystore';
import { clearAttemptState, loadAttemptState } from '@/features/lock/unlockService';
import { useSessionStore } from '@/features/session/useSessionStore';
import {
  createVault,
  formatRecoveryKey,
  generateRecoveryKey,
  isVaultUnlocked,
  lockVault,
  setRecoveryKey,
  unlockVault,
  useVaultStore,
} from '@/vault';
import { FAST_KDF, makeEntry, resetVaultFiles, withEntries } from '@/vault/__support__/testUtils';
import { writeJsonFile } from '@/storage/jsonFile';

import { checkRecoveryText, RecoverForm } from '../RecoverForm';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));
jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('@/features/biometric/__support__/fakeNativeKeystore').fakeNative,
}));
const mockForce = jest.fn();
jest.mock('@/features/privacy/screenProtection', () => ({
  useForceScreenProtection: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(() => {
      mockForce('on');
    }, []);
  },
}));

const OLD = 'correct horse battery staple';
const NEW = 'vivid-lantern-oxide-mango-3flute';
const realRecover = useVaultStore.getState().recover;
let recoveryText = '';
let alertSpy: jest.SpyInstance;

const field = (label: string) => screen.getByLabelText(label);
const submit = () => screen.getByRole('button', { name: /^Recover|^Recovering/ });

async function fill(key = recoveryText, next = NEW, confirm = next) {
  await fireEvent.changeText(field('Recovery key'), key);
  await fireEvent.changeText(field('New master password'), next);
  await fireEvent.changeText(field('Confirm new master password'), confirm);
}

// A vault the user "forgot the password" of: it has data and a recovery key. Locked.
async function forgottenVault() {
  resetVaultFiles();
  clearAttemptState();
  fakeNative.reset();
  const created = await createVault(OLD, { kdfParams: FAST_KDF });
  useVaultStore.setState({ data: withEntries(created, makeEntry()) });
  await useVaultStore.getState().save(withEntries(created, makeEntry()));
  const key = generateRecoveryKey();
  recoveryText = formatRecoveryKey(key);
  await setRecoveryKey(key);
  useVaultStore.getState().lock();
}

beforeEach(async () => {
  jest.clearAllMocks();
  useVaultStore.setState({ recover: realRecover }); // earlier tests may have replaced it
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await forgottenVault();
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  resetVaultFiles();
  clearAttemptState();
});

describe('checkRecoveryText', () => {
  test('tells apart empty, unfinished, mistaken and correct', () => {
    expect(checkRecoveryText('')).toBe('empty');
    expect(checkRecoveryText('   - ')).toBe('empty');
    expect(checkRecoveryText(recoveryText.slice(0, 20))).toBe('incomplete');
    expect(checkRecoveryText(recoveryText)).toBe('ok');
    expect(checkRecoveryText(recoveryText.toLowerCase().replace(/-/g, ' '))).toBe('ok');
    const typo = (recoveryText[0] === '2' ? '3' : '2') + recoveryText.slice(1);
    expect(checkRecoveryText(typo)).toBe('typo');
  });
});

describe('the form', () => {
  test('warns that anyone with the recovery key can open the vault', async () => {
    await render(<RecoverForm />);
    expect(
      await screen.findByText('Anyone with the recovery key can open your vault.'),
    ).toBeTruthy();
  });

  test('the screen is protected from screenshots', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    expect(mockForce).toHaveBeenCalledWith('on');
  });

  test('the recovery key and passwords are hidden until Show is pressed', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    for (const label of ['Recovery key', 'New master password', 'Confirm new master password']) {
      expect(field(label).props.secureTextEntry).toBe(true);
    }
  });

  test('counts the characters while typing and confirms when the key looks right', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fireEvent.changeText(field('Recovery key'), recoveryText.slice(0, 17));
    expect(screen.getByText(/^15 of 56 characters/)).toBeTruthy(); // the hyphen does not count
    await fireEvent.changeText(field('Recovery key'), recoveryText);
    expect(screen.getByText('The recovery key looks right.')).toBeTruthy();
  });

  test('points out a typing mistake before anything is tried, and keeps the button disabled', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    const typo = (recoveryText[0] === '2' ? '3' : '2') + recoveryText.slice(1);
    await fill(typo);
    expect(screen.getByText(/typing mistake somewhere/i)).toBeTruthy();
    expect(submit()).toBeDisabled();
  });

  test('needs a new password of 12+ characters that matches its confirmation', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fill(recoveryText, 'short', 'short');
    expect(screen.getByText('Use at least 12 characters.')).toBeTruthy();
    expect(submit()).toBeDisabled();
    await fill(recoveryText, NEW, NEW + 'x');
    expect(screen.getByText('The passwords do not match.')).toBeTruthy();
    expect(submit()).toBeDisabled();
    await fill();
    expect(submit()).toBeEnabled();
    expect(screen.getByLabelText(/Password strength: (Good|Strong)/)).toBeTruthy();
  });
});

describe('recovering', () => {
  test('opens the vault with the recovery key and sets the new master password', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fill();
    await fireEvent.press(submit());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'), { timeout: 15000 });
    expect(isVaultUnlocked()).toBe(true);
    expect(useSessionStore.getState().status).toBe('unlocked');
    expect(useVaultStore.getState().data?.entries.map((e) => e.id)).toEqual(['entry-1']);
    expect(alertSpy).toHaveBeenCalledWith(
      'Vault recovered',
      expect.stringMatching(/new master password is set/),
    );

    lockVault();
    await expect(unlockVault(OLD)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(unlockVault(NEW)).resolves.toBeDefined();
  });

  test('works when the key is typed in lower case with spaces', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fill(recoveryText.toLowerCase().replace(/-/g, ' '));
    await fireEvent.press(submit());
    await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 15000 });
  });

  test('getting back in resets the unlock delay and the biometric counters', async () => {
    await writeJsonFile('unlock-attempts.json', { failedAttempts: 7, lastFailedAt: Date.now() });
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fill();
    await fireEvent.press(submit());
    await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 15000 });

    expect(await loadAttemptState()).toEqual({ failedAttempts: 0, lastFailedAt: 0 });
    expect(fakeNative.recordPasswordUnlock).toHaveBeenCalled();
  });

  test('shows a loading state and ignores a second press', async () => {
    let finish!: () => void;
    const recover = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    useVaultStore.setState({ recover });
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fill();

    void fireEvent.press(submit());
    expect(await screen.findByText('Recovering…')).toBeTruthy();
    expect(field('Recovery key').props.editable).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Recovering…' }));
    expect(recover).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  test('a key for another vault is refused with a clear message, and the form can be retried', async () => {
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fill(formatRecoveryKey(generateRecoveryKey()));
    await fireEvent.press(submit());

    expect(await screen.findByText(/does not open this vault/i)).toBeTruthy();
    expect(isVaultUnlocked()).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
    await expect(unlockVault(OLD)).resolves.toBeDefined(); // the old password still works
    lockVault();

    await fireEvent.changeText(field('Recovery key'), recoveryText);
    await fireEvent.press(submit());
    await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 15000 });
  });

  test('an unexpected error shows a generic message, never the secrets', async () => {
    const spies = (['log', 'warn', 'error'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    useVaultStore.setState({
      recover: jest.fn().mockRejectedValue(new Error(`boom with ${recoveryText} and ${NEW}`)),
    });
    await render(<RecoverForm />);
    await screen.findByLabelText('Recovery key');
    await fill();
    await fireEvent.press(submit());
    expect(
      await screen.findByText(/could not be recovered, and nothing was changed/i),
    ).toBeTruthy();
    expect(screen.queryByText(/boom/)).toBeNull();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('a vault without a recovery key', () => {
  test('says plainly that nothing can be done, instead of showing the form', async () => {
    resetVaultFiles();
    await createVault(OLD, { kdfParams: FAST_KDF });
    lockVault();
    await render(<RecoverForm />);
    expect(await screen.findByText('No recovery key')).toBeTruthy();
    expect(screen.getByText(/cannot be recovered by anyone/i)).toBeTruthy();
    expect(screen.getByText(/clear KiteVault's data in Android settings/i)).toBeTruthy();
    expect(screen.queryByLabelText('Recovery key')).toBeNull();
  });
});

describe('the guide above the key box', () => {
  beforeEach(forgottenVault);

  test('says to enter all 8 groups of 7 characters, in order, in the one box', async () => {
    await render(<RecoverForm />);
    expect(await screen.findByText('Enter the whole recovery key')).toBeTruthy();
    expect(screen.getByText(/8 groups of 7 characters/)).toBeTruthy();
    expect(screen.getByText(/One group on its own is not enough/)).toBeTruthy();
  });

  test('shows how many groups are filled in as the key is typed, never the key itself', async () => {
    await render(<RecoverForm />);
    await screen.findByText('Enter the whole recovery key');
    expect(screen.getByLabelText('0 of 8 groups entered')).toBeTruthy();

    const groups = recoveryText.split('-');
    await fireEvent.changeText(field('Recovery key'), groups[0]!);
    expect(screen.getByLabelText('1 of 8 groups entered')).toBeTruthy();
    expect(screen.getByText('✓ 1', { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.changeText(field('Recovery key'), groups.slice(0, 3).join('-'));
    expect(screen.getByLabelText('3 of 8 groups entered')).toBeTruthy();

    await fireEvent.changeText(field('Recovery key'), recoveryText);
    expect(screen.getByLabelText('8 of 8 groups entered')).toBeTruthy();
    // Only counts are shown: no typed character appears in the guide.
    expect(
      screen.queryByText(groups[0]!, { exact: false, includeHiddenElements: true }),
    ).toBeNull();
  });
});
