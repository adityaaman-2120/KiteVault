import * as fs from 'node:fs';
import * as path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { AboutScreen, appVersion, PRIVACY_STATEMENT } from '../AboutScreen';
import { EXTRA_COMPONENTS } from '../extraLicenses';
import { LICENSE_TEXTS, LICENSES } from '../licenses.generated';
import { LICENSE_ROWS, LicensesScreen } from '../LicensesScreen';
import { SettingsForm } from '@/features/settings/SettingsForm';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3' } },
}));
jest.mock('@react-native-community/slider', () => 'Slider');

beforeEach(() => jest.clearAllMocks());

describe('AboutScreen', () => {
  test('shows the app name, Kitelux and the version', async () => {
    await render(<AboutScreen />);
    expect(screen.getByText('KiteVault')).toBeTruthy();
    expect(screen.getByText('by Kitelux')).toBeTruthy();
    expect(screen.getByText('Version 1.2.3')).toBeTruthy();
    expect(appVersion()).toBe('1.2.3');
  });

  test('shows the privacy statement', async () => {
    await render(<AboutScreen />);
    expect(PRIVACY_STATEMENT.length).toBeGreaterThanOrEqual(3);
    for (const paragraph of PRIVACY_STATEMENT) expect(screen.getByText(paragraph)).toBeTruthy();
    const all = PRIVACY_STATEMENT.join(' ');
    expect(all).toMatch(/stay on this phone/);
    expect(all).toMatch(/no analytics, no tracking and no ads/);
    expect(all).toMatch(/optional/);
  });

  test('opens the license list', async () => {
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open source licenses' }));
    expect(mockPush).toHaveBeenCalledWith('/licenses');
  });
});

describe('LicensesScreen', () => {
  test('lists the libraries with version and license', async () => {
    await render(<LicensesScreen />);
    expect(screen.getByText(`${LICENSE_ROWS.length} components.`, { exact: false })).toBeTruthy();
    expect(screen.getByText('@hookform/resolvers')).toBeTruthy();
    expect(screen.getAllByText(/^\d+\.\d+\.\d+ · MIT$/).length).toBeGreaterThan(1);
  });

  test('tapping a library shows its license text, tapping again hides it', async () => {
    await render(<LicensesScreen />);
    const entry = LICENSES.find((l) => l.name === '@hookform/resolvers')!;
    const firstLine = LICENSE_TEXTS[entry.text]!.split('\n')[0]!;
    const row = () => screen.getByRole('button', { name: /^@hookform\/resolvers,/ });

    expect(screen.queryByText(firstLine, { exact: false })).toBeNull();
    await fireEvent.press(row());
    expect(screen.getAllByText(firstLine, { exact: false }).length).toBeGreaterThan(0);
    await fireEvent.press(row());
    expect(screen.queryByText(firstLine, { exact: false })).toBeNull();
  });

  test('also lists the components that are not npm packages, with the word-list attribution', async () => {
    expect(EXTRA_COMPONENTS.map((c) => c.name)).toEqual(
      expect.arrayContaining([expect.stringContaining('EFF'), expect.stringContaining('OpenSSL')]),
    );
    expect(LICENSE_ROWS.some((r) => r.key.startsWith('extra:'))).toBe(true);
  });
});

describe('the generated license list', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8'),
  ) as { dependencies: Record<string, string> };

  test('contains every library the app depends on (run "npm run licenses" if this fails)', () => {
    const listed = new Set(LICENSES.map((l) => l.name));
    const missing = Object.keys(pkg.dependencies).filter((name) => !listed.has(name));
    expect(missing).toEqual([]);
  });

  test('has no unknown licenses, and every entry has a version', () => {
    for (const l of LICENSES) {
      expect(l.license).not.toBe('UNKNOWN');
      expect(l.version).toMatch(/^\d/);
    }
  });

  test('licenses that are not MIT are visible', () => {
    // All of today's dependencies are MIT; this fails loudly if one is not, so it gets a review.
    expect([...new Set(LICENSES.map((l) => l.license))].sort()).toEqual(['MIT']);
  });
});

describe('Settings sections', () => {
  test('has Security, Backup, Data and About, in that order', async () => {
    await render(<SettingsForm />);
    const headers = screen.getAllByRole('header').map((h) => h.props.children as string);
    expect(headers).toEqual(['Security', 'Backup', 'Data', 'About']);
  });

  test('Security has the change-password button', async () => {
    await render(<SettingsForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Change master password' }));
    expect(mockPush).toHaveBeenCalledWith('/change-password');
  });

  test('Backup is a placeholder', async () => {
    await render(<SettingsForm />);
    expect(screen.getByText(/Coming in a future version/)).toBeTruthy();
  });

  test('Data has the explanation and the red erase button', async () => {
    await render(<SettingsForm />);
    expect(screen.getByText(/Uninstalling the app also deletes all local data/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erase vault' })).toBeTruthy();
  });

  test('About shows the version and opens the About screen', async () => {
    await render(<SettingsForm />);
    expect(screen.getByText('Version 1.2.3 · by Kitelux')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'About KiteVault' }));
    expect(mockPush).toHaveBeenCalledWith('/about');
  });
});
