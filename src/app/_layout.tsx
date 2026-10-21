import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { startAutoBackup } from '@/features/backup/autoBackup';
import { purgeExportFiles } from '@/features/transfer/exportFiles';
import { useAutoLock } from '@/features/lock/useAutoLock';
import {
  protectScreenCaptureAtStartup,
  useScreenProtection,
} from '@/features/privacy/screenProtection';
import { RootWarningBanner } from '@/features/security/RootWarningBanner';
import { useSessionStore } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useTheme } from '@/theme';
import { markActivity } from '@/utils/activity';
import { useVaultStore } from '@/vault';

SplashScreen.preventAutoHideAsync();
protectScreenCaptureAtStartup(); // no screenshots or recents preview from the first frame

export default function RootLayout() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const previousStatus = useRef(status);

  useAutoLock();
  useScreenProtection();

  // Load preferences and find out whether a vault already exists before choosing the first screen.
  useEffect(() => {
    Promise.all([useSettingsStore.getState().load(), useVaultStore.getState().initialize()])
      .catch(() => {}) // on failure we use defaults and stay on the welcome flow; creating re-checks
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync();
      });
  }, []);

  // Move to the right screen when the state changes: locked (button, timeout, background) goes to
  // the unlock screen, and an erased vault goes back to the welcome screen.
  useEffect(() => {
    if (ready && previousStatus.current === 'unlocked' && status === 'locked') {
      router.replace('/unlock');
    }
    if (ready && previousStatus.current !== 'no-vault' && status === 'no-vault') {
      router.replace('/welcome');
    }
    previousStatus.current = status;
  }, [ready, status, router]);

  // A share that was interrupted must not leave a readable export in the cache.
  useEffect(() => {
    if (ready) purgeExportFiles();
  }, [ready]);

  // Automatic cloud backup (does nothing unless the user turned it on).
  useEffect(() => (ready ? startAutoBackup() : undefined), [ready]);

  if (!ready) return null;

  return (
    // Observes touches (without handling them) so inactivity can be measured.
    <View style={{ flex: 1 }} onTouchStart={markActivity}>
      <StatusBar style="auto" />
      <RootWarningBanner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={status === 'no-vault'}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="create-vault" options={{ title: 'Create vault' }} />
          <Stack.Screen name="restore" options={{ title: 'Restore from Google Drive' }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'locked'}>
          <Stack.Screen name="unlock" options={{ headerShown: false }} />
          <Stack.Screen name="recover" options={{ title: 'Recover vault' }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'unlocked'}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/new" options={{ title: 'New entry' }} />
          <Stack.Screen name="entry/[id]" options={{ title: 'Entry' }} />
          <Stack.Screen name="entry/edit/[id]" options={{ title: 'Edit entry' }} />
          <Stack.Screen name="trash" options={{ title: 'Trash' }} />
          <Stack.Screen name="folders" options={{ title: 'Folders' }} />
          <Stack.Screen name="import" options={{ title: 'Import passwords' }} />
          <Stack.Screen name="export" options={{ title: 'Export' }} />
          <Stack.Screen name="backup-conflict" options={{ title: 'Backup conflict' }} />
          <Stack.Screen name="backup-history" options={{ title: 'Backup history' }} />
          <Stack.Screen name="change-password" options={{ title: 'Change master password' }} />
          <Stack.Screen name="recovery-key" options={{ title: 'Recovery key' }} />
          <Stack.Screen name="about" options={{ title: 'About' }} />
          <Stack.Screen name="licenses" options={{ title: 'Open source licenses' }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}
