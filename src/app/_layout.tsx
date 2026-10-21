import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

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

  // When an unlocked vault becomes locked (button, timeout, background), go to the unlock screen.
  useEffect(() => {
    if (ready && previousStatus.current === 'unlocked' && status === 'locked') {
      router.replace('/unlock');
    }
    previousStatus.current = status;
  }, [ready, status, router]);

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
        </Stack.Protected>
        <Stack.Protected guard={status === 'locked'}>
          <Stack.Screen name="unlock" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'unlocked'}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/new" options={{ title: 'New entry' }} />
          <Stack.Screen name="entry/[id]" options={{ title: 'Entry' }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}
