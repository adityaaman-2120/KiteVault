import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import type { EntryType } from '@/vault';

export const ADD_CHOICES: { type: EntryType; label: string; hint: string; icon: string }[] = [
  { type: 'login', label: 'Login', hint: 'Website, username and password', icon: '🔑' },
  { type: 'note', label: 'Secure note', hint: 'Private text only you can read', icon: '📝' },
  { type: 'card', label: 'Card', hint: 'Payment card details', icon: '💳' },
  { type: 'identity', label: 'Identity', hint: 'Name, email, phone and address', icon: '🪪' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (type: EntryType) => void;
};

// A popup that rises from the bottom of the screen, and sinks back down when closed. The dimmed
// background fades in with it, and the choices come up one after another.
export function AddEntrySheet({ visible, onClose, onPick }: Props) {
  const { colors, elevation, radius, spacing, typography } = useTheme();
  const { height } = useWindowDimensions();
  // The Modal stays on screen until the closing animation has finished.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // A spring: it reacts at once and settles softly, without overshooting.
      const run = Animated.spring(progress, {
        toValue: 1,
        stiffness: 240,
        damping: 28,
        mass: 1,
        overshootClamping: true,
        useNativeDriver: true,
      });
      run.start();
      return () => run.stop();
    }
    const run = Animated.spring(progress, {
      toValue: 0,
      stiffness: 320,
      damping: 34,
      mass: 1,
      overshootClamping: true,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => run.stop();
  }, [visible, progress]);

  const rise = (index: number) => {
    // Each choice starts a little later than the one above it.
    const start = 0.25 + index * 0.1;
    const range = { inputRange: [start, Math.min(1, start + 0.4)], extrapolate: 'clamp' } as const;
    return {
      opacity: progress.interpolate({ ...range, outputRange: [0, 1] }),
      transform: [{ translateY: progress.interpolate({ ...range, outputRange: [18, 0] }) }],
    };
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Tapping the dimmed area closes the popup. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ ...absoluteFill, backgroundColor: 'transparent' }}
        >
          <Animated.View
            style={{ ...absoluteFill, backgroundColor: 'rgba(5, 9, 24, 0.6)', opacity: progress }}
          />
        </Pressable>
        <Animated.View
          style={{
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height, 0],
                }),
              },
            ],
          }}
        >
          <SafeAreaView
            edges={['bottom']}
            style={[
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
              },
              elevation.float,
            ]}
          >
            <View style={{ padding: spacing.lg, gap: spacing.md }}>
              <View
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                }}
              />
              <Text accessibilityRole="header" style={[typography.heading, { color: colors.text }]}>
                Add to your vault
              </Text>
              {ADD_CHOICES.map((choice, index) => (
                <Animated.View key={choice.type} style={rise(index)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`New ${choice.label.toLowerCase()}`}
                    onPress={() => onPick(choice.type)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      minHeight: 64,
                      padding: spacing.md,
                      borderRadius: radius.lg,
                      backgroundColor: pressed ? colors.surfaceMuted : colors.background,
                    })}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.md,
                        backgroundColor: colors.primarySoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{choice.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
                        {choice.label}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {choice.hint}
                      </Text>
                    </View>
                    <Text style={[typography.heading, { color: colors.textMuted }]}>›</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
