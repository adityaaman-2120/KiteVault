import { Tabs } from 'expo-router';

import { TabIcon } from '@/components';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { colors, typography } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.onHeader,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        headerTitleStyle: typography.heading,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 68,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: typography.label,
      }}
    >
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          // The Vault screen draws its own header (title, lock button and search).
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="vault" color={color} />,
        }}
      />
      <Tabs.Screen
        name="generator"
        options={{
          title: 'Generator',
          tabBarIcon: ({ color }) => <TabIcon name="generator" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}
