import Constants from 'expo-constants';

export type CloudBackupConfig = { enabled: boolean; webClientId: string };

// Set by plugins/withGoogleBackup.js from app.json. Without it the whole feature is off.
export function cloudBackupConfig(): CloudBackupConfig {
  const raw = (
    Constants.expoConfig?.extra as { cloudBackup?: Partial<CloudBackupConfig> } | undefined
  )?.cloudBackup;
  return {
    enabled: raw?.enabled === true,
    webClientId: typeof raw?.webClientId === 'string' ? raw.webClientId : '',
  };
}

export const isCloudBackupAvailable = (): boolean => cloudBackupConfig().enabled;
