import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '@/components';
import { useTheme } from '@/theme';
import type { EntryType } from '@/vault';

import { ADD_CHOICES } from './AddEntrySheet';

// Each card rises and fades in a little after the one before it, every time the page is shown.
function Rise({ index, children, style }: { index: number; children: ReactNode; style?: object }) {
  const progress = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      progress.setValue(0);
      const run = Animated.timing(progress, {
        toValue: 1,
        duration: 320,
        delay: index * 70,
        useNativeDriver: true,
      });
      run.start();
      return () => run.stop();
    }, [index, progress]),
  );
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// The page you reach by swiping right on the Vault tab: every way to add something, one tap away.
export function QuickAddScreen() {
  const router = useRouter();
  const { colors, elevation, radius, spacing, typography } = useTheme();

  const add = (type: EntryType) => router.push(`/entry/new?type=${type}`);

  const more: { key: string; icon: string; label: string; hint: string; go: () => void }[] = [
    {
      key: 'import',
      icon: '📥',
      label: 'Import passwords',
      hint: 'From Chrome, Bitwarden or a KiteVault backup',
      go: () => router.push('/import'),
    },
    {
      key: 'generate',
      icon: '🎲',
      label: 'Make a strong password',
      hint: 'Open the generator',
      go: () => router.navigate('/generator'),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Quick add" subtitle="Add something to your vault" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          paddingBottom: spacing.xxl * 2,
        }}
      >
        <Text style={[typography.caption, { color: colors.textMuted }]}>NEW ENTRY</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {ADD_CHOICES.map((choice, i) => (
            <Rise key={choice.type} index={i} style={{ width: '47.5%', flexGrow: 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`New ${choice.label.toLowerCase()}`}
                onPress={() => add(choice.type)}
                style={({ pressed }) => [
                  {
                    minHeight: 150,
                    padding: spacing.lg,
                    gap: spacing.sm,
                    borderRadius: radius.xl,
                    backgroundColor: colors.surface,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                  elevation.card,
                ]}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: radius.lg,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{choice.icon}</Text>
                </View>
                <Text style={[typography.heading, { color: colors.text }]}>{choice.label}</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{choice.hint}</Text>
              </Pressable>
            </Rise>
          ))}
        </View>

        <Text style={[typography.caption, { color: colors.textMuted }]}>MORE</Text>
        {more.map((item, i) => (
          <Rise key={item.key} index={ADD_CHOICES.length + i}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={item.go}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: 64,
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              })}
            >
              <Text style={{ fontSize: 22 }}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
                  {item.label}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{item.hint}</Text>
              </View>
              <Text style={[typography.heading, { color: colors.textMuted }]}>›</Text>
            </Pressable>
          </Rise>
        ))}

        <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
          Swipe left to go back to your vault
        </Text>
      </ScrollView>
    </View>
  );
}
