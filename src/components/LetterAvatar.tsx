import { memo } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

// First letter of the title, or "?" if there is none.
export function avatarLetter(title: string): string {
  const first = Array.from(title.trim())[0];
  return first ? first.toUpperCase() : '?';
}

// The same title always gets the same colour.
export function avatarHue(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360;
  return hash;
}

export const LetterAvatar = memo(function LetterAvatar({
  title,
  size = 40,
}: {
  title: string;
  size?: number;
}) {
  const { isDark } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `hsl(${avatarHue(title)}, 45%, ${isDark ? 32 : 42}%)`,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.45 }}>
        {avatarLetter(title)}
      </Text>
    </View>
  );
});
