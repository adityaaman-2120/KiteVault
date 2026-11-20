import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { EntryIcon, luminance } from '../EntryIcon';

// The icon is hidden from screen readers (the title says it all), so queries must include it.
const hidden = { includeHiddenElements: true } as const;
const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
const tile = () => screen.getByTestId('entry-icon', hidden);
const logo = () => screen.queryByTestId('entry-icon-logo', hidden);

describe('luminance', () => {
  test('is 0 for black, 1 for white and in between for colours', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(luminance('#FFC629')).toBeGreaterThan(0.5); // yellow: needs a dark glyph
    expect(luminance('#0A66C2')).toBeLessThan(0.5); // blue: white glyph
  });
});

describe('EntryIcon', () => {
  test('a known service with a logo shows the logo on its brand colour', async () => {
    await render(<EntryIcon title="Mail" urls={['https://github.com']} size={50} />);
    expect(styleOf(logo()!).tintColor).toBe('#FFFFFF');
    expect(styleOf(tile()).backgroundColor).toBe('#181717');
  });

  test('a known service without a logo shows its first letter on its brand colour', async () => {
    await render(<EntryIcon title="x" urls={['https://www.amazon.in']} />);
    expect(screen.getByText('A', hidden)).toBeTruthy();
    expect(logo()).toBeNull();
    expect(styleOf(tile()).backgroundColor).toBe('#FF9900');
  });

  test('a light brand colour gets a dark letter', async () => {
    await render(<EntryIcon title="x" urls={['https://bumble.com']} />);
    expect(styleOf(screen.getByText('B', hidden)).color).toBe('#14181F');
  });

  test('a linked app finds its service too', async () => {
    await render(
      <EntryIcon title="x" appLinks={[{ packageName: 'com.whatsapp', certSha256: 'AA' }]} />,
    );
    expect(logo()).not.toBeNull();
  });

  test('an unknown login shows the letter tile', async () => {
    await render(<EntryIcon title="my bank" urls={['https://unknown.example']} />);
    expect(screen.getByText('M', hidden)).toBeTruthy();
    expect(screen.queryByTestId('entry-icon', hidden)).toBeNull();
  });

  test('a note, a card and an identity with no known service get their own tile, not a letter', async () => {
    for (const type of ['note', 'card', 'identity'] as const) {
      const view = await render(<EntryIcon title="Something" type={type} />);
      expect(screen.queryByText('S', hidden)).toBeNull();
      expect(tile()).toBeTruthy();
      await view.unmount();
    }
  });

  test('each kind has its own colour', async () => {
    const colors: unknown[] = [];
    for (const type of ['note', 'card', 'identity'] as const) {
      const view = await render(<EntryIcon title="Something" type={type} />);
      colors.push(styleOf(tile()).backgroundColor);
      await view.unmount();
    }
    expect(new Set(colors).size).toBe(3);
  });

  test('a card named after a service still shows that service', async () => {
    await render(<EntryIcon title="Netflix" type="card" />);
    expect(logo()).not.toBeNull();
  });

  test('is hidden from screen readers, like the old letter tile', async () => {
    await render(<EntryIcon title="GitHub" />);
    expect(screen.queryByTestId('entry-icon')).toBeNull(); // not found without includeHidden
    expect(tile().props.accessibilityElementsHidden).toBe(true);
  });
});
