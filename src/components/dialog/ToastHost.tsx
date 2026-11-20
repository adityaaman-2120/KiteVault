import { useEffect, useRef, useState } from 'react';
import { Animated, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

// Draws every ToastAndroid.show ("Copied, clears in 30 s") as a small card in the app's style.
// Mounted once at the root; it takes over ToastAndroid.show while mounted, like DialogHost does
// for Alert.alert, so no call site had to change.
export function ToastHost() {
  const { colors, elevation, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const original = ToastAndroid.show;
    ToastAndroid.show = (text: string, duration: number) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      progress.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        stiffness: 300,
        damping: 26,
        mass: 1,
        overshootClamping: true,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(
        () => {
          Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(
            ({ finished }) => {
              if (finished) setMessage(null);
            },
          );
        },
        duration === ToastAndroid.LONG ? 3500 : 2200,
      );
    };
    return () => {
      ToastAndroid.show = original;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [progress]);

  if (message === null) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: insets.bottom + 92,
        alignItems: 'center',
      }}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            maxWidth: 420,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.header,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            ],
          },
          elevation.float,
        ]}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.success,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>✓</Text>
        </View>
        <Text style={[typography.body, { color: colors.onHeader, flexShrink: 1, fontSize: 14.5 }]}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
