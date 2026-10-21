import { render, screen } from '@testing-library/react-native';

import { avatarHue, avatarLetter, LetterAvatar } from '../LetterAvatar';

test('uses the first letter, upper case', async () => {
  expect(avatarLetter('github')).toBe('G');
  expect(avatarLetter('  bank')).toBe('B');
  expect(avatarLetter('ñandú')).toBe('Ñ');
  expect(avatarLetter('😀 smile')).toBe('😀');
  expect(avatarLetter('')).toBe('?');
  expect(avatarLetter('   ')).toBe('?');
  await render(<LetterAvatar title="github" />);
  expect(screen.getByText('G', { includeHiddenElements: true })).toBeTruthy();
});

test('the same title always gets the same colour, in range', () => {
  expect(avatarHue('GitHub')).toBe(avatarHue('GitHub'));
  for (const title of ['a', 'GitHub', 'x'.repeat(500), '😀']) {
    const hue = avatarHue(title);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  }
});
