import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

type Props = {
  // Which edge of the parent the fade sits on.
  side?: 'right' | 'left';
  width?: number;
};

// A soft fade into the page colour along one edge, so something that scrolls under it (a row of
// chips) melts away instead of being cut off by a hard line. It sits on top of what scrolls but
// lets every touch through. Put it inside a parent that has its own size and the page colour behind it.
export function EdgeFade({ side = 'right', width = 28 }: Props) {
  const { colors } = useTheme();
  const toRight = side === 'right';
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        { width, left: toRight ? undefined : 0, right: toRight ? 0 : undefined },
      ]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="fade" x1={toRight ? '0' : '1'} y1="0" x2={toRight ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
      </Svg>
    </View>
  );
}
