import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = { children: ReactNode; scroll?: boolean };

export function ScreenContainer({ children, scroll = false }: Props) {
  const { colors, spacing } = useTheme();
  const padding = { padding: spacing.lg, gap: spacing.lg };
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={padding} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, padding]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
