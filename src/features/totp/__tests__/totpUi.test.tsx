import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { copySecret } from '@/features/clipboard/clipboardService';
import { EntryDetailScreen } from '@/features/entries/EntryDetailScreen';
import { VaultListScreen } from '@/features/entries/VaultListScreen';
import {
  entry,
  showInStore,
  storeEntries,
  unlockedVaultWith,
} from '@/features/entries/__support__/entryTestUtils';

import { litSegments, RING_SEGMENTS } from '../CountdownRing';
import { TotpCode } from '../TotpCode';
import { TotpSetupScreen } from '../TotpSetupScreen';
import { formatCode, generateCode } from '../totp';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
}));
jest.mock('@/features/clipboard/clipboardService', () => ({ copySecret: jest.fn(async () => {}) }));
jest.mock('@/features/entries/entryActions', () => ({
  ...jest.requireActual('@/features/entries/entryActions'),
  purgeExpired: jest.fn(async () => {}),
}));

const mockCamera: { props: Record<string, any> | null; permission: Record<string, unknown> } = {
  props: null,
  permission: { granted: true, canAskAgain: true },
};
const mockRequestPermission = jest.fn();
jest.mock('expo-camera', () => ({
  CameraView: (props: Record<string, any>) => {
    mockCamera.props = props;
    return null;
  },
  useCameraPermissions: () => [mockCamera.permission, mockRequestPermission],
}));

const SECRET = 'JBSWY3DPEHPK3PXP';
const withCode = (over = {}) => entry({ id: 'e1', title: 'GitHub', totpSecret: SECRET, ...over });
const expected = (ms: number) => formatCode(generateCode(SECRET, undefined, ms).digits);
const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  jest.clearAllMocks();
  mockCamera.props = null;
  mockCamera.permission = { granted: true, canAskAgain: true };
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the countdown ring', () => {
  test('lights the share of the period that is left', () => {
    expect(litSegments(30, 30)).toBe(RING_SEGMENTS);
    expect(litSegments(15, 30)).toBe(RING_SEGMENTS / 2);
    expect(litSegments(1, 30)).toBe(1);
    expect(litSegments(0, 30)).toBe(0);
    expect(litSegments(30, 60)).toBe(RING_SEGMENTS / 2);
  });
});

describe('TotpCode', () => {
  test('shows the code for the given time with the seconds left', async () => {
    await render(<TotpCode secret={SECRET} now={59_000} />);
    expect(screen.getByText(expected(59_000))).toBeTruthy();
    expect(screen.getByText('1 s · tap to copy')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveProp(
      'accessibilityLabel',
      'Code changes in 1 seconds',
    );
  });

  test('tapping copies the digits (without the space) through the clearing clipboard', async () => {
    await render(<TotpCode secret={SECRET} now={59_000} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(copySecret).toHaveBeenCalledWith(generateCode(SECRET, undefined, 59_000).digits);
  });

  test('a saved secret that is not valid shows a message, not a code', async () => {
    await render(<TotpCode secret="not valid!" now={0} />);
    expect(screen.getByText(/not valid. Replace it/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('entry detail', () => {
  test('without 2FA there is an "Add 2FA" button that opens the setup', async () => {
    await unlockedVaultWith([entry({ id: 'e1' })]);
    await render(<EntryDetailScreen id="e1" />);
    await fireEvent.press(button('Add 2FA'));
    expect(mockPush).toHaveBeenCalledWith('/entry/totp/e1');
  });

  test('with 2FA it shows a live code that changes every 30 seconds', async () => {
    jest.useFakeTimers({ now: 29_000 });
    await unlockedVaultWith([withCode()]);
    await render(<EntryDetailScreen id="e1" />);
    expect(screen.getByText(expected(29_000))).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText(expected(31_000))).toBeTruthy();
    expect(expected(31_000)).not.toBe(expected(29_000));
    expect(screen.queryByRole('button', { name: 'Add 2FA' })).toBeNull();
  });

  test('the countdown ticks down every second', async () => {
    jest.useFakeTimers({ now: 0 });
    await unlockedVaultWith([withCode()]);
    await render(<EntryDetailScreen id="e1" />);
    expect(screen.getByText('30 s · tap to copy')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByText('27 s · tap to copy')).toBeTruthy();
  });

  test('removing 2FA asks first, then deletes the secret from the vault', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await unlockedVaultWith([withCode()]);
    await render(<EntryDetailScreen id="e1" />);
    await fireEvent.press(button('Remove 2FA'));
    expect(storeEntries()[0]!.totpSecret).toBe(SECRET); // not until confirmed
    const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
    buttons.find((b) => b.text === 'Remove 2FA')!.onPress!();
    await waitFor(() => expect(storeEntries()[0]).not.toHaveProperty('totpSecret'));
  });

  test('"Replace 2FA" opens the setup', async () => {
    await unlockedVaultWith([withCode()]);
    await render(<EntryDetailScreen id="e1" />);
    await fireEvent.press(button('Replace 2FA'));
    expect(mockPush).toHaveBeenCalledWith('/entry/totp/e1');
  });
});

describe('Authenticator filter on the vault screen', () => {
  const rows = [
    entry({ id: '1', title: 'GitHub', totpSecret: SECRET }),
    entry({ id: '2', title: 'Bank' }),
    entry({
      id: '3',
      title: 'Mail',
      totpSecret: 'KRSXG5CTMVRXEZLU',
      totpParams: { algorithm: 'SHA1', digits: 8, period: 30 },
    }),
    entry({ id: '4', title: 'Trashed', totpSecret: SECRET, deletedAt: 1 }),
  ];

  test('lists only entries with a code, each with its live code', async () => {
    showInStore(rows);
    await render(<VaultListScreen />);
    expect(screen.queryByText(/^\d{3} \d{3}$/)).toBeNull(); // normal list: no codes
    await fireEvent.press(button('Authenticator'));

    expect(screen.getByText(/GitHub/)).toBeTruthy();
    expect(screen.getByText(/Mail/)).toBeTruthy();
    expect(screen.queryByText(/Bank/)).toBeNull();
    expect(screen.queryByText(/Trashed/)).toBeNull();
    expect(screen.getByText(/^\d{3} \d{3}$/)).toBeTruthy(); // 6 digits
    expect(screen.getByText(/^\d{4} \d{4}$/)).toBeTruthy(); // the 8 digit one
  });

  test('tapping a code copies it; Open goes to the entry', async () => {
    showInStore(rows);
    await render(<VaultListScreen />);
    await fireEvent.press(button('Authenticator'));
    await fireEvent.press(screen.getAllByRole('button', { name: /^Copy 2FA code/ })[0]!);
    expect(copySecret).toHaveBeenCalledWith(expect.stringMatching(/^\d{6,8}$/));
    await fireEvent.press(button('Open GitHub'));
    expect(mockPush).toHaveBeenCalledWith('/entry/1');
  });

  test('says so when no entry has a code', async () => {
    showInStore([entry({ id: '1', title: 'Bank' })]);
    await render(<VaultListScreen />);
    await fireEvent.press(button('Authenticator'));
    expect(screen.getByText('No codes')).toBeTruthy();
  });
});

describe('Add 2FA screen: pasting a secret', () => {
  beforeEach(() => unlockedVaultWith([entry({ id: 'e1' })]));
  const field = () => screen.getByLabelText(/Or paste the secret key/);

  test('a bad secret is explained and nothing is saved', async () => {
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.changeText(field(), 'abc');
    await fireEvent.press(button('Save'));
    expect(screen.getByText(/too short/)).toBeTruthy();
    expect(storeEntries()[0]!.totpSecret).toBeUndefined();
    await fireEvent.changeText(field(), 'JBSWY3DPEHPK3PX1');
    await fireEvent.press(button('Save'));
    expect(screen.getByText(/only contain the letters A to Z/)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('a good secret (spaces and lower case allowed) is saved and the screen closes', async () => {
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.changeText(field(), 'jbsw y3dp ehpk 3pxp');
    await fireEvent.press(button('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(storeEntries()[0]!.totpSecret).toBe(SECRET);
  });

  test('an otpauth link with settings is saved with them', async () => {
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.changeText(field(), `otpauth://totp/x?secret=${SECRET}&digits=8`);
    await fireEvent.press(button('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(storeEntries()[0]).toMatchObject({
      totpSecret: SECRET,
      totpParams: { algorithm: 'SHA1', digits: 8, period: 30 },
    });
  });

  test('the secret field is hidden by default', async () => {
    await render(<TotpSetupScreen id="e1" />);
    expect(field().props.secureTextEntry).toBe(true);
  });
});

describe('Add 2FA screen: scanning a QR code', () => {
  beforeEach(() => unlockedVaultWith([entry({ id: 'e1' })]));
  const scan = (data: string) =>
    act(async () => {
      mockCamera.props!.onBarcodeScanned({ data });
    });

  test('looks only for QR codes and never takes a picture', async () => {
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.press(button('Scan QR code'));
    expect(mockCamera.props!.barcodeScannerSettings).toEqual({ barcodeTypes: ['qr'] });
    expect(mockCamera.props).not.toHaveProperty('ref');
  });

  test('a QR code that is not a 2FA code is explained and scanning continues', async () => {
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.press(button('Scan QR code'));
    await scan('https://example.com');
    expect(await screen.findByText(/does not look like a valid 2FA/)).toBeTruthy();
    expect(storeEntries()[0]!.totpSecret).toBeUndefined();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('a valid code is saved once, even if the camera reports it many times', async () => {
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.press(button('Scan QR code'));
    const link = `otpauth://totp/GitHub:me?secret=${SECRET}&issuer=GitHub`;
    await scan(link);
    await scan(link);
    await scan(link);
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(storeEntries()[0]!.totpSecret).toBe(SECRET);
  });

  test('without camera permission it asks, and explains that nothing is recorded', async () => {
    mockCamera.permission = { granted: false, canAskAgain: true };
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.press(button('Scan QR code'));
    expect(screen.getByText(/nothing is photographed or recorded/)).toBeTruthy();
    expect(mockCamera.props).toBeNull(); // no camera preview without permission
    await fireEvent.press(button('Allow camera'));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  test('permission refused for good: points to typing the key instead', async () => {
    mockCamera.permission = { granted: false, canAskAgain: false };
    await render(<TotpSetupScreen id="e1" />);
    await fireEvent.press(button('Scan QR code'));
    expect(screen.getByText(/type the secret key instead/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Allow camera' })).toBeNull();
    await fireEvent.press(button('Cancel'));
    expect(screen.getByLabelText(/Or paste the secret key/)).toBeTruthy();
  });
});
