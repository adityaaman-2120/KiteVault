import { Tabs } from 'expo-router';

import { LockButton } from '@/features/lock/LockButton';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { colors, typography } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: typography.label,
        // Text-only tabs keep the shell free of icon dependencies.
        tabBarIcon: () => null,
      }}
    >
      <Tabs.Screen name="vault" options={{ title: 'Vault', headerRight: () => <LockButton /> }} />
      <Tabs.Screen name="generator" options={{ title: 'Generator' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
