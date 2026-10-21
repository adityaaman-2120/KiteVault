import { evaluatePassword } from '../passwordStrength';

describe('evaluatePassword', () => {
  test('empty input scores zero', () => {
    expect(evaluatePassword('')).toEqual({ score: 0, label: 'Very weak' });
  });

  test('common passwords score low and come with a hint', () => {
    const result = evaluatePassword('password1234');
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.hint).toBeTruthy();
  });

  test('a long random passphrase scores high', () => {
    expect(evaluatePassword('vivid-lantern-oxide-mango-3flute').score).toBeGreaterThanOrEqual(3);
  });

  test('handles very long input without error', () => {
    expect(() => evaluatePassword('x'.repeat(5000))).not.toThrow();
  });
});
