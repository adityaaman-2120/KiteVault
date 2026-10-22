import { darkColors, lightColors, type ColorTokens } from '../colors';

// WCAG 2.1 contrast ratio between two "#RRGGBB" colours.
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const themes: [string, ColorTokens][] = [
  ['light', lightColors],
  ['dark', darkColors],
];

describe.each(themes)('%s theme', (_name, c) => {
  // Normal-size text needs 4.5:1 (WCAG AA). Everything below is used as text somewhere.
  test.each<[string, keyof ColorTokens, keyof ColorTokens]>([
    ['text on the page', 'text', 'background'],
    ['text on cards', 'text', 'surface'],
    ['text on muted areas', 'text', 'surfaceMuted'],
    ['secondary text on the page', 'textMuted', 'background'],
    ['secondary text on cards', 'textMuted', 'surface'],
    ['secondary text on muted areas', 'textMuted', 'surfaceMuted'],
    ['text in a text field', 'text', 'field'],
    ['hint text in a text field', 'textMuted', 'field'],
    ['button text on the main colour', 'onPrimary', 'primary'],
    ['links and chosen options on the page', 'primary', 'background'],
    ['links and chosen options on cards', 'primary', 'surface'],
    ['brand orange text on the page', 'accent', 'background'],
    ['brand orange text on cards', 'accent', 'surface'],
    ['error text on the page', 'danger', 'background'],
    ['error text on cards', 'danger', 'surface'],
    ['warning text on the page', 'warning', 'background'],
    ['warning text on cards', 'warning', 'surface'],
    ['success text on the page', 'success', 'background'],
    ['success text on cards', 'success', 'surface'],
  ])('%s has contrast of at least 4.5:1', (_label, foreground, background) => {
    expect(contrast(c[foreground], c[background])).toBeGreaterThanOrEqual(4.5);
  });

  // Parts of controls you need to see (the edge of a text box, an "off" switch) need 3:1.
  test.each<[string, keyof ColorTokens]>([
    ['the edge of controls on the page', 'background'],
    ['the edge of controls on cards', 'surface'],
  ])('%s has contrast of at least 3:1', (_label, behind) => {
    expect(contrast(c.outline, c[behind])).toBeGreaterThanOrEqual(3);
  });

  test('the main colour stands out from the page (3:1) so a filled button can be seen', () => {
    expect(contrast(c.primary, c.background)).toBeGreaterThanOrEqual(3);
  });

  test('error, warning and success are not the same colour (not only red versus green)', () => {
    expect(new Set([c.danger, c.warning, c.success]).size).toBe(3);
  });
});

test('the contrast function matches known values', () => {
  expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
});
