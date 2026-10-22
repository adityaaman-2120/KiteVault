import { useColorScheme } from 'react-native';

import { darkColors, lightColors } from './colors';
import { elevation, radius, spacing, touch, typography } from './tokens';

export type { ColorTokens } from './colors';
export { elevation, radius, spacing, touch, typography };

// Follows the system light/dark setting.
export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    isDark,
    colors: isDark ? darkColors : lightColors,
    spacing,
    radius,
    typography,
    elevation,
  };
}
