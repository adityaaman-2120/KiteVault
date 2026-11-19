import { Tabs } from 'expo-router';
import { Animated, Dimensions } from 'react-native';

import { TabIcon } from '@/components';
import { SwipeBetweenTabs } from '@/components/SwipeBetweenTabs';
import { useTheme } from '@/theme';

// A full-width slide: the tab you leave moves out to one side while the new one comes in from the
// other (progress is -1 left of the active tab, 0 on it, 1 right of it).
const slideScenes = ({ current }: { current: { progress: Animated.Value } }) => ({
  sceneStyle: {
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-Dimensions.get('window').width, 0, Dimensions.get('window').width],
        }),
      },
    ],
  },
});

export default function TabsLayout() {
  const { colors, typography } = useTheme();

  return (
    <Tabs
      // Swipe sideways to move between the tabs.
      screenLayout={({ route, navigation, children }) => (
        <SwipeBetweenTabs current={route.name} onGo={(tab) => navigation.navigate(tab)}>
          {children}
        </SwipeBetweenTabs>
      )}
      screenOptions={{
        // All tabs are built at start, so the first swipe to one does not wait for it to load.
        lazy: false,
        animation: 'shift',
        sceneStyleInterpolator: slideScenes,
        transitionSpec: { animation: 'timing', config: { duration: 220 } },
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
          // The Generator screen draws its own header panel.
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="generator" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          // The Settings screen draws its own header panel.
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}
