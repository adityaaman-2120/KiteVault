import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useSessionStore } from '@/features/session/useSessionStore';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const status = useSessionStore((s) => s.status);
  const { colors } = useTheme();

  return (
    <>
      <StatusBar style="auto" />
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
    </>
  );
}
