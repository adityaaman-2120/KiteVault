import { Text, View } from 'react-native';

import { Button, ScreenContainer, TextField } from '@/components';
import { useSessionStore } from '@/features/session/useSessionStore';
import { useTheme } from '@/theme';

export default function UnlockScreen() {
  const setStatus = useSessionStore((s) => s.setStatus);
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenContainer>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
        <Text style={[typography.title, { color: colors.text }]}>Unlock</Text>
        <TextField label="Master password" secret />
      </View>
      {/* Placeholder: no password is checked yet. */}
      <Button title="Unlock" onPress={() => setStatus('unlocked')} />
    </ScreenContainer>
  );
}
