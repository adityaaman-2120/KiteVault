import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { deleteJsonFile, readJsonFile } from '@/storage/jsonFile';

import { PrivacySettingsCard } from '../PrivacySettingsCard';

beforeEach(() => {
  deleteJsonFile('settings.json');
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
});
afterAll(() => deleteJsonFile('settings.json'));

test('screenshots are off and the clipboard clears after 30 s by default', async () => {
  await render(<PrivacySettingsCard />);
  expect(screen.getByLabelText('Allow screenshots').props.value).toBe(false);
  expect(screen.getByRole('radio', { name: '30 s' })).toBeChecked();
});

test('the screenshot switch is saved', async () => {
  await render(<PrivacySettingsCard />);
  await fireEvent(screen.getByLabelText('Allow screenshots'), 'valueChange', true);
  expect(useSettingsStore.getState().allowScreenshots).toBe(true);
  await waitFor(async () =>
    expect(await readJsonFile('settings.json')).toMatchObject({ allowScreenshots: true }),
  );
});

test.each([
  ['15 s', 15],
  ['60 s', 60],
  ['Never', 0],
])('choosing "%s" sets the clipboard delay to %i', async (label, seconds) => {
  await render(<PrivacySettingsCard />);
  await fireEvent.press(screen.getByRole('radio', { name: label }));
  expect(useSettingsStore.getState().clipboardClearSeconds).toBe(seconds);
  await waitFor(async () =>
    expect(await readJsonFile('settings.json')).toMatchObject({ clipboardClearSeconds: seconds }),
  );
});
