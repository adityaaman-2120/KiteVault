import { View } from 'react-native';

import { ScreenContainer, ScreenHeader } from '@/components';
import { useTheme } from '@/theme';

import { PasswordGeneratorPanel } from './PasswordGeneratorPanel';

export function GeneratorScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Generator" subtitle="Strong passwords, made on this phone" />
      <ScreenContainer scroll>
        <PasswordGeneratorPanel />
      </ScreenContainer>
    </View>
  );
}
