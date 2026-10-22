import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';

import { getUnlockState } from '@/native/keystore';
import { getAutofillStatus, openAutofillSettings } from '@/native/keystore/autofill';

import { AutofillCard } from '../AutofillCard';
import {
  AUTOFILL_EXPLANATION,
  AutofillScreen,
  CHROME_STEPS,
  describeUnlock,
  WEBSITES_AND_APPS_NOTE,
} from '../AutofillScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/native/keystore', () => ({ getUnlockState: jest.fn() }));
jest.mock('@/native/keystore/autofill', () => ({
  getAutofillStatus: jest.fn(),
  openAutofillSettings: jest.fn(),
}));

const status = getAutofillStatus as jest.Mock;
const unlock = getUnlockState as jest.Mock;
const open = openAutofillSettings as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  status.mockReturnValue({ supported: true, enabled: false });
  unlock.mockResolvedValue('ready');
});
afterEach(() => jest.restoreAllMocks());

describe('status', () => {
  test('shows that autofill is off and biometrics are on', async () => {
    await render(<AutofillScreen />);
    expect(await screen.findByText(/Off: choose KiteVault in Android/)).toBeTruthy();
    expect(screen.getByText('✓ On')).toBeTruthy();
    expect(screen.getByText('Not ready yet')).toBeTruthy();
  });

  test('is ready only when the service is on AND biometric unlock works', async () => {
    status.mockReturnValue({ supported: true, enabled: true });
    await render(<AutofillScreen />);
    expect(await screen.findByText('Ready to fill')).toBeTruthy();
    expect(screen.getByText(/On: KiteVault is your autofill service/)).toBeTruthy();
  });

  test('is not ready when biometric unlock is off, even if the service is on', async () => {
    status.mockReturnValue({ supported: true, enabled: true });
    unlock.mockResolvedValue('disabled');
    await render(<AutofillScreen />);
    expect(await screen.findByText('Not ready yet')).toBeTruthy();
    expect(screen.getByText(/Autofill needs it: turn on biometric unlock/)).toBeTruthy();
  });

  test('says so when the phone has no autofill support, and disables the button', async () => {
    status.mockReturnValue({ supported: false, enabled: false });
    await render(<AutofillScreen />);
    expect(await screen.findByText('Not available on this phone')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Android autofill settings' })).toBeDisabled();
  });

  test.each([
    ['ready', true],
    ['reauth-required', false],
    ['invalidated', false],
    ['unavailable', false],
    ['disabled', false],
  ] as const)('biometric state %s', (state, ok) => {
    expect(describeUnlock(state).ok).toBe(ok);
    expect(describeUnlock(state).text.length).toBeGreaterThan(0);
  });

  test('looks again when the app returns to the front', async () => {
    let listener: (state: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: never) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    await render(<AutofillScreen />);
    await screen.findByText(/Off: choose KiteVault/);

    status.mockReturnValue({ supported: true, enabled: true }); // the user picked KiteVault
    listener('active');
    expect(await screen.findByText(/On: KiteVault is your autofill service/)).toBeTruthy();
  });
});

describe('the button', () => {
  test('opens Android autofill settings and does nothing else', async () => {
    open.mockReturnValue(true);
    await render(<AutofillScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Open Android autofill settings' }),
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('explains what to do if that page cannot be opened', async () => {
    open.mockReturnValue(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<AutofillScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Open Android autofill settings' }),
    );
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0]![0]).toBe('Could not open the page');
  });
});

describe('the explanations', () => {
  test('say how it works, what is matched, and how to set up Chrome', async () => {
    await render(<AutofillScreen />);
    await screen.findByText('Not ready yet');
    expect(screen.getByText(AUTOFILL_EXPLANATION)).toBeTruthy();
    expect(screen.getByText(WEBSITES_AND_APPS_NOTE)).toBeTruthy();
    expect(screen.getByText(CHROME_STEPS)).toBeTruthy();
    expect(CHROME_STEPS).toMatch(/135/);
    expect(AUTOFILL_EXPLANATION).toMatch(/fingerprint or face/);
  });
});

describe('the Settings card', () => {
  test('opens the Autofill screen', async () => {
    await render(<AutofillCard />);
    await fireEvent.press(screen.getByRole('button', { name: 'Autofill settings' }));
    expect(mockPush).toHaveBeenCalledWith('/autofill');
  });
});
