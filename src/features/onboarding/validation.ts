export const MIN_PASSWORD_LENGTH = 12;

export type CreateVaultInput = {
  password: string;
  confirm: string;
  acknowledged: boolean;
};

export type CreateVaultErrors = {
  password?: string;
  confirm?: string;
  acknowledged?: string;
};

// Counts characters the way a person does (an emoji is one, not two).
export function passwordLength(password: string): number {
  return Array.from(password).length;
}

// Pure rules for the create-vault form. Messages never repeat the password.
export function validateCreateVault({ password, confirm, acknowledged }: CreateVaultInput): {
  valid: boolean;
  errors: CreateVaultErrors;
} {
  const errors: CreateVaultErrors = {};
  if (passwordLength(password) < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirm !== password) {
    errors.confirm = 'The passwords do not match.';
  }
  if (!acknowledged) {
    errors.acknowledged = 'Please confirm that you understand.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
