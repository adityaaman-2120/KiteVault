import { View } from 'react-native';

import { useTheme } from '@/theme';

export const RING_SEGMENTS = 30;

// How many of the ring's segments are still lit: the share of the period that is left.
export function litSegments(secondsLeft: number, period: number): number {
  return Math.max(0, Math.min(RING_SEGMENTS, Math.ceil((secondsLeft / period) * RING_SEGMENTS)));
}

// A ring of small bars that go out one by one as the code runs out. Drawn with plain views, so no
// graphics library is needed.
export function CountdownRing({
  secondsLeft,
  period,
  size = 44,
}: {
  secondsLeft: number;
  period: number;
  size?: number;
}) {
  const { colors } = useTheme();
  const lit = litSegments(secondsLeft, period);
  const low = secondsLeft <= 5;
  const bar = { width: 3, height: Math.round(size / 5) };
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Code changes in ${secondsLeft} seconds`}
      accessibilityValue={{ min: 0, max: period, now: secondsLeft }}
      style={{ width: size, height: size }}
    >
      {Array.from({ length: RING_SEGMENTS }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: size / 2 - bar.width / 2,
            top: size / 2 - bar.height / 2,
            ...bar,
            borderRadius: 2,
            backgroundColor: i < lit ? (low ? colors.danger : colors.primary) : colors.border,
            transform: [
              { rotate: `${(i * 360) / RING_SEGMENTS}deg` },
              { translateY: -(size / 2 - bar.height / 2) },
            ],
          }}
        />
      ))}
    </View>
  );
}
