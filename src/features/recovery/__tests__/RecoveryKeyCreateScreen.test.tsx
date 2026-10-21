import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import { Alert, type AlertButton } from 'react-native';

import { clearAttemptState } from '@/features/lock/unlockService';
import {
  createVault,
  generateRecoveryKey,
  getRecoveryInfo,
  lockVault,
  recoverVault,
  setRecoveryKey,
  unlockVault,
  useVaultStore,
} from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { PDF_WARNING } from '../recoveryPdf';
import { RECOVERY_WARNING, RecoveryKeyCreateScreen } from '../RecoveryKeyCreateScreen';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
}));
jest.mock('expo-print', () => ({ printAsync: jest.fn(async () => {}) }));
const mockForce = jest.fn();
jest.mock('@/features/privacy/screenProtection', () => ({
  useForceScreenProtection: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(() => {
      mockForce('on');
      return () => mockForce('off');
    }, []);
  },
}));

const PASSWORD = 'correct horse battery staple';
let alertSpy: jest.SpyInstance;

const shownKey = () =>
  Array.from({ length: 8 }, (_, i) => {
    const node = screen.getByLabelText(new RegExp(`^Group ${i + 1}:`));
    return node.props.children as string;
  }).join('-');

async function unlockPassword(password = PASSWORD) {
  await fireEvent.changeText(screen.getByLabelText('Master password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Show my recovery key' }));
}

// The screen asks to type one group of the key as a check; find which one and type it.
async function typeCheckGroup(key = shownKey()) {
  const label = screen.getByLabelText(/^Check your copy: type group \d$/).props
    .accessibilityLabel as string;
  const n = Number(label.slice(-1));
  await fireEvent.changeText(screen.getByLabelText(label), key.split('-')[n - 1]!);
}

const finish = () => screen.getByRole('button', { name: /^I have written it down|^Saving/ });

beforeEach(async () => {
  jest.clearAllMocks();
  resetVaultFiles();
  clearAttemptState();
  const data = await createVault(PASSWORD, { kdfParams: FAST_KDF });
  useVaultStore.setState({ data });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  resetVaultFiles();
  clearAttemptState();
});

describe('step 1: the warning and the password', () => {
  test('warns before showing anything, and shows no key yet', async () => {
    await render(<RecoveryKeyCreateScreen />);
    expect(screen.getByText('Anyone with the recovery key can open your vault.')).toBeTruthy();
    expect(RECOVERY_WARNING).toBe('Anyone with the recovery key can open your vault.');
    expect(screen.getByText(/Never store it as a screenshot/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^Group 1:/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Show my recovery key' })).toBeDisabled();
  });

  test('the screen is protected from screenshots while it is open', async () => {
    const { unmount } = await render(<RecoveryKeyCreateScreen />);
    expect(mockForce).toHaveBeenCalledWith('on');
    await unmount();
    expect(mockForce).toHaveBeenCalledWith('off');
  });

  test('a wrong master password shows nothing and counts as a failed attempt', async () => {
    await render(<RecoveryKeyCreateScreen />);
    await unlockPassword('not the password');
    expect(await screen.findByText('The master password is wrong.')).toBeTruthy();
    expect(screen.queryByLabelText(/^Group 1:/)).toBeNull();
    expect(await getRecoveryInfo()).toEqual({ exists: false });
  });

  test('after 5 wrong tries it makes the user wait', async () => {
    await render(<RecoveryKeyCreateScreen />);
    for (let i = 0; i < 5; i++) {
      await unlockPassword('not the password');
      await screen.findByText('The master password is wrong.');
    }
    await unlockPassword(PASSWORD); // even the right one is refused during the wait
    expect(await screen.findByText(/Too many wrong attempts/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Group 1:/)).toBeNull();
  });

  test('says when a recovery key already exists and will be replaced', async () => {
    await setRecoveryKey(generateRecoveryKey());
    await render(<RecoveryKeyCreateScreen />);
    expect(await screen.findByText(/Making a new one replaces it/)).toBeTruthy();
  });
});

describe('step 2: showing the key', () => {
  async function reveal() {
    await render(<RecoveryKeyCreateScreen />);
    await unlockPassword();
    await screen.findByLabelText(/^Group 1:/);
  }

  test('shows the key as 8 numbered groups of 7 characters, with the warning still visible', async () => {
    await reveal();
    const key = shownKey();
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{7}(-[0-9A-HJKMNP-TV-Z]{7}){7}$/);
    expect(screen.getByText('Anyone with the recovery key can open your vault.')).toBeTruthy();
    expect(screen.getByText(/Screenshots are blocked on this screen/)).toBeTruthy();
  });

  test('nothing is stored yet: leaving now discards the key', async () => {
    const { unmount } = await render(<RecoveryKeyCreateScreen />);
    await unlockPassword();
    await screen.findByLabelText(/^Group 1:/);
    await unmount();
    expect(await getRecoveryInfo()).toEqual({ exists: false });
  });

  test('Finish stays disabled until the checked group is typed correctly', async () => {
    await reveal();
    expect(finish()).toBeDisabled();
    const label = screen.getByLabelText(/^Check your copy: type group \d$/).props
      .accessibilityLabel as string;
    await fireEvent.changeText(screen.getByLabelText(label), 'AAAAAAA');
    expect(await screen.findByText(/That does not match group \d\./)).toBeTruthy();
    expect(finish()).toBeDisabled();

    await typeCheckGroup();
    expect(finish()).toBeEnabled();
  });

  test('the check forgives case and look-alike letters, like the real recovery does', async () => {
    await reveal();
    const label = screen.getByLabelText(/^Check your copy: type group \d$/).props
      .accessibilityLabel as string;
    const n = Number(label.slice(-1));
    const group = shownKey().split('-')[n - 1]!;
    await fireEvent.changeText(
      screen.getByLabelText(label),
      group.toLowerCase().replace(/0/g, 'o'),
    );
    expect(finish()).toBeEnabled();
  });

  test('Finish saves the key, and the shown text really recovers the vault', async () => {
    await reveal();
    const key = shownKey();
    await typeCheckGroup(key);
    await fireEvent.press(finish());

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith('Recovery key saved', expect.stringMatching(/offline/));
    expect(await getRecoveryInfo()).toMatchObject({ exists: true });

    lockVault();
    await expect(
      recoverVault(key, 'a brand new master password', { kdfParams: FAST_KDF }),
    ).resolves.toBeDefined();
    lockVault();
    await expect(unlockVault('a brand new master password')).resolves.toBeDefined();
  });

  test('if saving fails it says so, keeps the key on screen, and works on retry', async () => {
    await reveal();
    const key = shownKey();
    await typeCheckGroup(key);

    const spy = jest.spyOn(File.prototype, 'create').mockImplementation(() => {
      throw new Error('disk full');
    });
    await fireEvent.press(finish());
    expect(await screen.findByText(/could not be saved, and nothing was changed/i)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(shownKey()).toBe(key); // the same key, so the paper copy stays valid
    expect(await getRecoveryInfo()).toEqual({ exists: false });

    spy.mockRestore();
    await fireEvent.press(finish());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(await getRecoveryInfo()).toMatchObject({ exists: true });
  });
});

describe('printing / saving as PDF', () => {
  async function reveal() {
    await render(<RecoveryKeyCreateScreen />);
    await unlockPassword();
    await screen.findByLabelText(/^Group 1:/);
  }
  const buttons = () => alertSpy.mock.calls.at(-1)![2] as AlertButton[];

  test('shows the strong warning first and prints nothing until the user continues', async () => {
    await reveal();
    await fireEvent.press(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(alertSpy).toHaveBeenCalledWith('Print or save as PDF?', PDF_WARNING, expect.any(Array));
    expect(Print.printAsync).not.toHaveBeenCalled();
  });

  test('cancelling prints nothing', async () => {
    await reveal();
    await fireEvent.press(screen.getByRole('button', { name: 'Print or save as PDF' }));
    buttons()
      .find((b) => b.text === 'Cancel')!
      .onPress?.();
    expect(Print.printAsync).not.toHaveBeenCalled();
  });

  test('continuing opens the print screen with the key that is shown', async () => {
    await reveal();
    const key = shownKey();
    await fireEvent.press(screen.getByRole('button', { name: 'Print or save as PDF' }));
    await act(async () =>
      buttons()
        .find((b) => b.text === 'Continue')!
        .onPress?.(),
    );
    expect(Print.printAsync).toHaveBeenCalledTimes(1);
    const { html } = (Print.printAsync as jest.Mock).mock.calls[0][0];
    for (const group of key.split('-')) expect(html).toContain(group);
    expect(html).toContain('Anyone who has this key can open your vault.');
  });

  test('if the print screen cannot open, the user is told to write it by hand', async () => {
    (Print.printAsync as jest.Mock).mockRejectedValueOnce(new Error('no print service'));
    await reveal();
    await fireEvent.press(screen.getByRole('button', { name: 'Print or save as PDF' }));
    await act(async () =>
      buttons()
        .find((b) => b.text === 'Continue')!
        .onPress?.(),
    );
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Could not open the print screen',
        expect.stringMatching(/by hand/),
      ),
    );
  });
});
