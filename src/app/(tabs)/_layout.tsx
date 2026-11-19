import { Tabs } from 'expo-router';
import { Animated, Dimensions, View } from 'react-native';

import { TabIcon } from '@/components';
import { SwipeBetweenTabs } from '@/components/SwipeBetweenTabs';
import { useTheme } from '@/theme';

// The tab you leave slides out to one side, a little slower than the new one comes in (a parallax
// feel), and shrinks and fades slightly; the new tab grows to full size. Progress is -1 left of the
// active tab, 0 on it, 1 right of it.
const slideScenes = ({ current }: { current: { progress: Animated.Value } }) => {
  const { width } = Dimensions.get('window');
  const at = (outputRange: number[]) =>
    current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange });
  return {
    sceneStyle: {
      opacity: at([0, 1, 0]),
      transform: [
        { translateX: at([-width * 0.6, 0, width * 0.6]) },
        { scale: at([0.92, 1, 0.92]) },
      ],
    },
  };
};

// Quick add is listed first (it sits left of Vault), but the app must open on Vault.
export const unstable_settings = { initialRouteName: 'vault' };

export default function TabsLayout() {
  const { colors, typography } = useTheme();

  return (
    <Tabs
      // Back goes to Vault.
      backBehavior="initialRoute"
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
        name="quick-add"
        options={{
          title: 'Quick add',
          // Reached by swiping right on the Vault tab (it sits left of Vault), so it gets no button in the tab bar.
          // Do NOT use the null-href shortcut for this: Expo Router turns it into "hidden", and a hidden
          // tab cannot be shown; opening it bounces straight back to the first tab.
          tabBarButton: () => <View style={{ width: 0, height: 0 }} />,
          // The bar still gives every tab a share of its width; this takes this one out of the row,
          // so only the three real tabs are spread across the bar.
          tabBarItemStyle: { display: 'none' },
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          // The Vault screen draws its own header (title, lock button and search).
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="vault" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="generator"
        options={{
          title: 'Generator',
          // The Generator screen draws its own header panel.
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="generator" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          // The Settings screen draws its own header panel.
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="settings" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
