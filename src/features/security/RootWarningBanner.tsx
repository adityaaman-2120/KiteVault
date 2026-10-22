import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextAction } from '@/components';
import { useTheme } from '@/theme';

import { detectRootedDevice } from './rootCheck';

export const ROOT_WARNING =
  'This device appears to be rooted. Other apps with root access may be able to read your vault while it is unlocked.';

// Shown above every screen on a device that looks rooted. Warns only; the app keeps working.
export function RootWarningBanner() {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [rooted, setRooted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Run after the first paint: the check reads files and installed apps.
    const timer = setTimeout(() => setRooted(detectRootedDevice()), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!rooted || dismissed) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.warning,
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Text style={[typography.caption, { flex: 1, color: colors.onPrimary }]}>{ROOT_WARNING}</Text>
      <TextAction
        label="Dismiss"
        accessibilityLabel="Dismiss warning"
        color={colors.onPrimary}
        onPress={() => setDismissed(true)}
      />
    </View>
  );
}
