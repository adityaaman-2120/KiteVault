import { VaultError } from './errors';
import { DATA_VERSION, type VaultData } from './types';

// Checks the shape of decrypted JSON so a bad file cannot put the app in a broken state.
// The data already passed the AES-GCM integrity check; this guards against bugs and old formats.
export function parseVaultData(json: string): VaultData {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new VaultError('CORRUPTED', 'The vault file is damaged.');
  }
  const data = value as Partial<VaultData> | null;
  if (typeof data !== 'object' || data === null || typeof data.version !== 'number') {
    throw new VaultError('CORRUPTED', 'The vault file is damaged.');
  }
  if (data.version !== DATA_VERSION) {
    throw new VaultError(
      'UNSUPPORTED_VERSION',
      'This vault was created by a different version of KiteVault.',
    );
  }
  if (
    !Array.isArray(data.entries) ||
    !Array.isArray(data.folders) ||
    typeof data.settings !== 'object' ||
    data.settings === null
  ) {
    throw new VaultError('CORRUPTED', 'The vault file is damaged.');
  }
  return data as VaultData;
}
