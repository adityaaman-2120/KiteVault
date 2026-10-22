import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AboutScreen } from '@/features/about/AboutScreen';
import { AutofillScreen } from '@/features/autofill/AutofillScreen';
import { MAX_ROW_FONT_SCALE, rowHeight, BASE_ROW_HEIGHT } from '@/features/entries/EntryRow';
import { WelcomeSlides } from '@/features/onboarding/WelcomeSlides';
import { touch } from '@/theme';

import { Button, Checkbox, Chip, ChoiceGroup, TextAction, TextField, ToggleRow } from '..';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/native/keystore', () => ({ getUnlockState: jest.fn(async () => 'ready') }));
jest.mock('@/native/keystore/autofill', () => ({
  getAutofillStatus: jest.fn(() => ({ supported: true, enabled: true })),
  openAutofillSettings: jest.fn(() => true),
}));

const minHeightOf = (element: { props: { style?: unknown } }): number => {
  const style = element.props.style;
  const flat = StyleSheet.flatten(
    (typeof style === 'function'
      ? (style as (s: { pressed: boolean }) => object)({ pressed: false })
      : style) as StyleProp<ViewStyle>,
  ) as { minHeight?: number; height?: number };
  return flat?.minHeight ?? flat?.height ?? 0;
};

describe('things you tap are at least 48 dp tall', () => {
  test('the shared controls', async () => {
    await render(
      <>
        <Button title="Press" />
        <TextAction label="Show" onPress={() => {}} />
        <Chip label="Chip" selected={false} onPress={() => {}} />
        <Checkbox label="Tick" checked={false} onChange={() => {}} />
        <ChoiceGroup
          label="Pick"
          options={[
            { value: 1, label: 'One' },
            { value: 2, label: 'Two' },
          ]}
          value={1}
          onChange={() => {}}
        />
      </>,
    );
    const tappable = [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('checkbox'),
      ...screen.getAllByRole('radio'),
    ];
    expect(tappable.length).toBe(6);
    for (const element of tappable) {
      expect(minHeightOf(element)).toBeGreaterThanOrEqual(touch.min);
    }
  });

  test('a small word that can be tapped has a 48 x 48 area', async () => {
    await render(<TextAction label="Copy" onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style) as {
      minHeight: number;
      minWidth: number;
    };
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });
});

describe('screen readers', () => {
  test('a secret field names its own Show button ("Show Master password")', async () => {
    await render(<TextField label="Master password" secret value="" onChangeText={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show Master password' })).toBeTruthy();
  });

  test('fields, switches, check boxes and options have names', async () => {
    await render(
      <>
        <TextField label="Title" value="" onChangeText={() => {}} />
        <ToggleRow label="Allow it" value={false} onChange={() => {}} />
        <Checkbox label="I agree" checked={false} onChange={() => {}} />
      </>,
    );
    expect(screen.getByLabelText('Title')).toHaveAccessibleName('Title');
    expect(screen.getByRole('switch')).toHaveAccessibleName('Allow it');
    expect(screen.getByRole('checkbox')).toHaveAccessibleName('I agree');
  });

  test('every button on the welcome, about and autofill screens has a name', async () => {
    for (const screenElement of [
      <WelcomeSlides key="w" />,
      <AboutScreen key="a" />,
      <AutofillScreen key="f" />,
    ]) {
      const view = await render(screenElement);
      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) expect(button).toHaveAccessibleName();
      await view.unmount();
    }
  });

  test('the selected option of a group is announced as selected', async () => {
    await render(
      <ChoiceGroup
        label="Lock after"
        options={[
          { value: 1, label: '1 min' },
          { value: 2, label: '2 min' },
        ]}
        value={2}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: '2 min', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '1 min', checked: false })).toBeTruthy();
  });
});

describe('big text sizes', () => {
  test('list rows grow with the phone font size, up to a limit', () => {
    expect(rowHeight(1)).toBe(BASE_ROW_HEIGHT);
    expect(rowHeight(0.8)).toBe(BASE_ROW_HEIGHT); // never smaller
    expect(rowHeight(1.3)).toBe(Math.ceil(BASE_ROW_HEIGHT * 1.3));
    expect(rowHeight(2)).toBe(Math.ceil(BASE_ROW_HEIGHT * MAX_ROW_FONT_SCALE));
    expect(rowHeight(3)).toBe(rowHeight(2)); // the limit, so the list can still jump to any position
  });
});
