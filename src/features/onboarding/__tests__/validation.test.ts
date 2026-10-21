import { MIN_PASSWORD_LENGTH, passwordLength, validateCreateVault } from '../validation';

const good = 'a'.repeat(MIN_PASSWORD_LENGTH);
const input = (over = {}) => ({ password: good, confirm: good, acknowledged: true, ...over });

describe('validateCreateVault', () => {
  test('accepts a long enough, matching, acknowledged password', () => {
    expect(validateCreateVault(input())).toEqual({ valid: true, errors: {} });
  });

  test('enforces the minimum length at the boundary', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const result = validateCreateVault(input({ password: short, confirm: short }));
    expect(result.valid).toBe(false);
    expect(result.errors.password).toMatch(/at least 12/i);
    expect(validateCreateVault(input()).errors.password).toBeUndefined();
  });

  test('counts characters, not UTF-16 units', () => {
    const emoji = '😀'.repeat(MIN_PASSWORD_LENGTH);
    expect(passwordLength(emoji)).toBe(MIN_PASSWORD_LENGTH);
    expect(validateCreateVault(input({ password: emoji, confirm: emoji })).valid).toBe(true);
  });

  test('requires the confirmation to match exactly', () => {
    expect(validateCreateVault(input({ confirm: good + 'x' })).errors.confirm).toMatch(/match/i);
    expect(validateCreateVault(input({ confirm: '' })).errors.confirm).toMatch(/match/i);
    expect(validateCreateVault(input({ confirm: good.toUpperCase() })).valid).toBe(false);
  });

  test('requires the no-recovery acknowledgement', () => {
    const result = validateCreateVault(input({ acknowledged: false }));
    expect(result.valid).toBe(false);
    expect(result.errors.acknowledged).toBeDefined();
  });

  test('error messages never contain the password', () => {
    const secret = 'sup3r-secret';
    const { errors } = validateCreateVault({
      password: secret,
      confirm: 'other',
      acknowledged: false,
    });
    expect(JSON.stringify(errors)).not.toContain(secret);
  });
});
