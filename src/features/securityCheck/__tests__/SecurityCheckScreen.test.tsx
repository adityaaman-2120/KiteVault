import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { entry, showInStore } from '@/features/entries/__support__/entryTestUtils';
import { DEFAULT_APP_SETTINGS, SETTINGS_FILE } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { deleteJsonFile } from '@/storage/jsonFile';

import { HIBP_RANGE_URL, sha1Upper } from '../hibp';
import { BREACH_EXPLANATION, SecurityCheckScreen } from '../SecurityCheckScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const STRONG = 'k7#Qv9!zLm2$Rx8@Wp4&';
const LEAKED = 'letmein';

const entries = [
  entry({ id: 'leak', title: 'Leaked site', password: LEAKED, createdAt: NOW - DAY }),
  entry({ id: 'weak', title: 'Weak site', password: 'qwerty', createdAt: NOW - DAY }),
  entry({ id: 'old', title: 'Old site', password: STRONG, createdAt: NOW - 500 * DAY }),
  entry({ id: 'fine', title: 'Fine site', password: STRONG + 'x', createdAt: NOW - DAY }),
  entry({ id: 'none', title: 'Empty site', password: '' }),
  entry({
    id: 'gh',
    title: 'GitHub',
    password: STRONG + 'y',
    urls: ['https://github.com'],
    createdAt: NOW - DAY,
  }),
];

let requested: string[];
let fetchMock: jest.Mock;
// The pretend service knows one leaked password.
function installApi(status = 200) {
  fetchMock = jest.fn(async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    if (status !== 200) return new Response('', { status });
    const hash = sha1Upper(LEAKED);
    const prefix = url.slice(HIBP_RANGE_URL.length);
    return new Response(
      prefix === hash.slice(0, 5) ? `${hash.slice(5)}:1234\r\n${'A'.repeat(35)}:0` : '',
      {
        status: 200,
      },
    );
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  requested = [];
  deleteJsonFile(SETTINGS_FILE);
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  showInStore(entries);
  installApi();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  deleteJsonFile(SETTINGS_FILE);
});

describe('local checks (offline)', () => {
  test('lists the problems, grouped, with a score', async () => {
    await render(<SecurityCheckScreen />);
    expect(await screen.findByText('Weak passwords (2)')).toBeTruthy();
    expect(screen.getByText('No password saved (1)')).toBeTruthy();
    expect(screen.getByText('Old passwords (1)')).toBeTruthy();
    expect(screen.getByText('Could use 2FA (1)')).toBeTruthy();
    expect(screen.queryByText(/Found in a data breach/)).toBeNull();
    expect(screen.queryByText(/Fine site/)).toBeNull();
    expect(screen.getByLabelText(/^Security score \d+, (Excellent|Good|Fair|Poor)$/)).toBeTruthy();
  });

  test('makes no network request on its own', async () => {
    await render(<SecurityCheckScreen />);
    await screen.findByText('Weak passwords (2)');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('tapping an issue opens that entry', async () => {
    await render(<SecurityCheckScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Weak site\. .*Open to fix/));
    expect(mockPush).toHaveBeenCalledWith('/entry/weak');
  });

  test('the 2FA suggestions can be switched off', async () => {
    await render(<SecurityCheckScreen />);
    await screen.findByText('Could use 2FA (1)');
    await fireEvent(screen.getByLabelText('Suggest 2FA'), 'valueChange', false);
    await waitFor(() => expect(screen.queryByText(/Could use 2FA/)).toBeNull());
  });

  test('says so when everything is fine', async () => {
    showInStore([entries[3]!]);
    await render(<SecurityCheckScreen />);
    expect(await screen.findByText('No problems found.')).toBeTruthy();
    expect(screen.getByLabelText('Security score 100, Excellent')).toBeTruthy();
  });

  test('an empty vault has nothing to check', async () => {
    showInStore([]);
    await render(<SecurityCheckScreen />);
    expect(await screen.findByLabelText('Security score none, Nothing to check')).toBeTruthy();
  });
});

describe('breach check is off until the user allows it and taps', () => {
  test('is off by default, explained, and has no button', async () => {
    await render(<SecurityCheckScreen />);
    expect(await screen.findByText(BREACH_EXPLANATION)).toBeTruthy();
    expect(screen.getByLabelText('Allow the breach check')).toHaveProp('value', false);
    expect(screen.queryByRole('button', { name: /Check passwords now/ })).toBeNull();
  });

  test('the explanation says what is and is not sent', () => {
    expect(BREACH_EXPLANATION).toMatch(/first 5 characters of its SHA-1 hash/);
    expect(BREACH_EXPLANATION).toMatch(/never leave the phone/);
    expect(BREACH_EXPLANATION).toMatch(/only when you tap/);
  });

  test('allowing it shows the button but still sends nothing', async () => {
    await render(<SecurityCheckScreen />);
    await fireEvent(await screen.findByLabelText('Allow the breach check'), 'valueChange', true);
    expect(await screen.findByRole('button', { name: 'Check passwords now' })).toBeTruthy();
    expect(useSettingsStore.getState().breachCheckEnabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('tapping runs it: only 5-character prefixes are sent, and the leaked password is listed first', async () => {
    useSettingsStore.setState({ breachCheckEnabled: true });
    await render(<SecurityCheckScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Check passwords now' }));

    expect(await screen.findByText('Found in a data breach (1)')).toBeTruthy();
    expect(screen.getByText(/1 of 5 different passwords were found in breaches/)).toBeTruthy();
    expect(screen.getByText(/1,234 times/)).toBeTruthy();

    expect(requested.length).toBeGreaterThan(0);
    for (const url of requested) {
      expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
    }
    const everything = JSON.stringify(fetchMock.mock.calls);
    for (const secret of [LEAKED, 'qwerty', STRONG, sha1Upper(LEAKED).slice(5)]) {
      expect(everything).not.toContain(secret);
    }
    // the score now includes the breach and the list opens the right entry
    // the breach is listed first; the same entry is also listed as weak
    await fireEvent.press(screen.getAllByLabelText(/^Leaked site\. .*Open to fix/)[0]!);
    expect(mockPush).toHaveBeenCalledWith('/entry/leak');
  });

  test('a clean result is reported as such', async () => {
    useSettingsStore.setState({ breachCheckEnabled: true });
    showInStore([entries[3]!]);
    await render(<SecurityCheckScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Check passwords now' }));
    expect(await screen.findByText(/None of your 1 different passwords were found/)).toBeTruthy();
  });

  test('a service or network failure is explained and no result is shown', async () => {
    useSettingsStore.setState({ breachCheckEnabled: true });
    installApi(500);
    await render(<SecurityCheckScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Check passwords now' }));
    expect(await screen.findByText(/breach service had a problem/)).toBeTruthy();
    expect(screen.queryByText(/None of your/)).toBeNull();

    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await fireEvent.press(screen.getByRole('button', { name: 'Check passwords now' }));
    expect(await screen.findByText(/No internet connection/)).toBeTruthy();
  });

  test('turning it off again forgets the results', async () => {
    useSettingsStore.setState({ breachCheckEnabled: true });
    await render(<SecurityCheckScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Check passwords now' }));
    await screen.findByText('Found in a data breach (1)');
    await fireEvent(screen.getByLabelText('Allow the breach check'), 'valueChange', false);
    await waitFor(() => expect(screen.queryByText(/Found in a data breach/)).toBeNull());
    expect(useSettingsStore.getState().breachCheckEnabled).toBe(false);
  });

  test('opening the screen again never repeats the check by itself', async () => {
    useSettingsStore.setState({ breachCheckEnabled: true });
    const first = await render(<SecurityCheckScreen />);
    await screen.findByText('Weak passwords (2)');
    await first.unmount();
    await render(<SecurityCheckScreen />);
    await screen.findByText('Weak passwords (2)');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
